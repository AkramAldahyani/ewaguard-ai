import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/auth-service.js';
import { issueAccessToken } from '../src/auth/auth-token.js';
import { decryptSecret, encryptSecret, startMfa, totpFor } from '../src/auth/mfa-service.js';
import { requireOwnershipOrRole, requireRole } from '../src/middleware/authorize.js';
import { createAuthenticate } from '../src/middleware/authenticate.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig } from '../src/config/env.js';

test('RBAC and MFA with real PostgreSQL and HTTP requests', async (t) => {
  const logs = [t.mock.method(console, 'info', () => {}), t.mock.method(console, 'warn', () => {})];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'), LOGIN_RATE_LIMIT_MAX: '100' });
  const db = createDatabaseClient();
  const password = `Test-${randomUUID()}!`;
  const passwordHash = await hashPassword(password);
  const roles = await db.role.findMany();
  const ids = [];
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  async function fixture(role) {
    const user = await db.user.create({ data: { firstName: 'MFA', lastName: 'Fixture', email: `${randomUUID()}@example.invalid`,
      passwordHash, status: 'ACTIVE', roleId: roles.find((item) => item.name === role).id } });
    ids.push(user.id); return user;
  }
  const employee = await fixture('EMPLOYEE');
  const admin = await fixture('IT_SECURITY_ADMIN');
  const other = await fixture('EMPLOYEE');
  const app = express();
  app.use(cookieParser());
  // A test-only resource route demonstrates the reusable ownership boundary without adding a business module.
  const auth = createAuthenticate({ database: db, config });
  app.get('/test/resources/:id', auth, requireOwnershipOrRole(async (req) =>
    req.params.id === 'existing' ? { userId: employee.id, value: 'authorized' } : null,
  { roles: ['IT_SECURITY_ADMIN'] }), (req, res) => res.json({ value: req.authorizedResource.value }));
  app.use(createApp(config, { database: db }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, cookie, body) => fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: config.frontendUrl,
      ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const cookieFor = (response, name) => response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`))?.split(';')[0];
  const login = (user, extra = {}) => request('/api/auth/login', null, { email: user.email, password, ...extra });
  const submittedCodes = [];
  const verify = (cookie, code) => {
    if (/^\d{6}$/.test(code)) submittedCodes.push(code);
    return request('/api/auth/mfa/verify', cookie, { code });
  };
  const accessCookie = (user) => `ewaguard_access=${issueAccessToken(user.id, config)}`;
  let employeeCookie, challenge, secret, adminCookie;

  await t.test('anonymous access is rejected for both workspaces', async () => {
    for (const area of ['employee', 'admin']) assert.equal((await request(`/api/${area}/workspace`)).status, 401);
  });
  await t.test('employee login preserved; vertical escalation and client role injection rejected', async () => {
    const result = await login(employee);
    assert.equal(result.status, 200);
    employeeCookie = cookieFor(result, 'ewaguard_access');
    assert.equal((await request('/api/employee/workspace', employeeCookie)).status, 200);
    assert.equal((await request('/api/admin/workspace', employeeCookie)).status, 403);
    assert.equal((await login(employee, { role: 'IT_SECURITY_ADMIN' })).status, 401);
    const forgedRole = jwt.sign({ role: 'IT_SECURITY_ADMIN', mfa: 'fake' }, config.jwtSecret,
      { subject: employee.id, issuer: 'ewaguard-api', audience: 'ewaguard-web', jwtid: randomUUID(), expiresIn: 60 });
    assert.equal((await request('/api/admin/workspace', `ewaguard_access=${forgedRole}`)).status, 403);
  });
  await t.test('horizontal boundaries return identical missing and inaccessible responses', async () => {
    assert.equal((await request('/test/resources/existing', employeeCookie)).status, 200);
    const denied = await request('/test/resources/existing', accessCookie(other));
    const missing = await request('/test/resources/missing', accessCookie(other));
    assert.equal(denied.status, 404); assert.equal(missing.status, 404);
    assert.deepEqual(await denied.json(), await missing.json());
  });
  await t.test('privacy-sensitive administration rejects employees and MFA-less administrators', async () => {
    for (const path of ['/api/admin/incidents', '/api/admin/training', '/api/admin/monthly-quizzes',
      '/api/admin/certificates', '/api/admin/community', '/api/admin/dashboard']) {
      assert.equal((await request(path, employeeCookie)).status, 403, path);
      assert.equal((await request(path, accessCookie(admin))).status, 401, path);
    }
  });
  await t.test('admin password creates enrollment challenge, never an authenticated session', async () => {
    const result = await login(admin);
    assert.equal(result.status, 202);
    const body = await result.json();
    assert.equal(body.mfaRequired, true); assert.equal(body.enrollment, true);
    assert.equal(body.user, undefined);
    assert.equal(cookieFor(result, 'ewaguard_access'), 'ewaguard_access=');
    secret = new URL(body.provisioningUri).searchParams.get('secret');
    challenge = cookieFor(result, 'ewaguard_mfa');
    const pending = await db.user.findUnique({ where: { id: admin.id } });
    assert.equal(pending.mfaEnabledAt, null);
    assert.equal(pending.mfaPendingSecret.includes(secret), false);
    assert.equal(pending.mfaChallengeHash.includes(challenge.split('=')[1]), false);
    assert.equal((await request('/api/auth/me', challenge)).status, 401);
    assert.equal((await request('/api/admin/workspace', accessCookie(admin))).status, 401);
    assert.equal((await request('/api/auth/me', challenge.replace('ewaguard_mfa=', 'ewaguard_access='))).status, 401);
  });
  await t.test('invalid and excessively drifted codes fail without enabling MFA', async () => {
    assert.equal((await verify(challenge, 'invalid')).status, 401);
    assert.equal((await verify(challenge, totpFor(secret, config).generate({ timestamp: Date.now() - 300_000 }))).status, 401);
    assert.equal((await db.user.findUnique({ where: { id: admin.id } })).mfaEnabledAt, null);
  });
  await t.test('valid first TOTP enables MFA and issues admin session exactly once under concurrency', async () => {
    const code = totpFor(secret, config).generate();
    const results = await Promise.all([verify(challenge, code), verify(challenge, code)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
    adminCookie = cookieFor(results.find((r) => r.status === 200), 'ewaguard_access');
    assert.equal((await request('/api/admin/workspace', adminCookie)).status, 200);
    assert.equal((await request('/test/resources/existing', adminCookie)).status, 200);
    assert.equal((await request('/api/employee/workspace', adminCookie)).status, 403);
    assert.equal((await verify(challenge, code)).status, 401);
    const me = JSON.stringify(await (await request('/api/auth/me', adminCookie)).json());
    assert.equal(me.includes(secret), false); assert.equal(me.includes('mfaSecret'), false);
    const stored = await db.user.findUnique({ where: { id: admin.id } });
    assert.equal(stored.mfaPendingSecret, null); assert.equal(stored.mfaChallengeHash, null);
    assert.equal(decryptSecret(stored.mfaSecretEncrypted, admin.id, config), secret);
  });
  await t.test('subsequent login does not disclose setup material; accepted TOTP cannot be reused', async () => {
    const response = await login(admin);
    const body = await response.json();
    assert.deepEqual(body, { mfaRequired: true, enrollment: false });
    challenge = cookieFor(response, 'ewaguard_mfa');
    const stored = await db.user.findUnique({ where: { id: admin.id } });
    const previous = totpFor(secret, config).generate({ timestamp: Number(stored.mfaLastCounter) * 30_000 });
    assert.equal((await verify(challenge, previous)).status, 401);
    // Permit the current test code again by moving only this fixture's last-used counter backwards.
    await db.user.update({ where: { id: admin.id }, data: { mfaLastCounter: stored.mfaLastCounter - 2n } });
    assert.equal((await verify(challenge, totpFor(secret, config).generate())).status, 200);
  });
  await t.test('expired challenge rejected; replacement invalidates previous challenge', async () => {
    const first = cookieFor(await login(admin), 'ewaguard_mfa');
    challenge = cookieFor(await login(admin), 'ewaguard_mfa');
    assert.equal((await verify(first, totpFor(secret, config).generate())).status, 401);
    await db.user.update({ where: { id: admin.id }, data: { mfaChallengeExpiresAt: new Date(0) } });
    assert.equal((await verify(challenge, totpFor(secret, config).generate())).status, 401);
  });
  await t.test('database status and role changes override existing JWTs immediately', async () => {
    await db.user.update({ where: { id: admin.id }, data: { status: 'SUSPENDED' } });
    assert.equal((await login(admin)).status, 401);
    assert.equal((await request('/api/admin/workspace', adminCookie)).status, 401);
    await db.user.update({ where: { id: admin.id }, data: { status: 'ACTIVE', roleId: employee.roleId } });
    assert.equal((await request('/api/admin/workspace', adminCookie)).status, 403);
    assert.equal((await request('/api/employee/workspace', adminCookie)).status, 200);
    await db.user.update({ where: { id: admin.id }, data: { roleId: roles.find((r) => r.name === 'IT_SECURITY_ADMIN').id } });
    await db.user.update({ where: { id: employee.id }, data: { roleId: admin.roleId } });
    assert.equal((await request('/api/admin/workspace', employeeCookie)).status, 401);
    await db.user.update({ where: { id: employee.id }, data: { roleId: employee.roleId } });
  });
  await t.test('password changes invalidate pending challenge', async () => {
    challenge = cookieFor(await login(admin), 'ewaguard_mfa');
    await db.user.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword('Different-test-password!') } });
    assert.equal((await verify(challenge, totpFor(secret, config).generate())).status, 401);
    await db.user.update({ where: { id: admin.id }, data: { passwordHash } });
  });
  await t.test('disabled account cannot complete a pending MFA challenge', async () => {
    challenge = cookieFor(await login(admin), 'ewaguard_mfa');
    await db.user.update({ where: { id: admin.id }, data: { status: 'SUSPENDED' } });
    assert.equal((await verify(challenge, totpFor(secret, config).generate())).status, 401);
    await db.user.update({ where: { id: admin.id }, data: { status: 'ACTIVE' } });
  });
  await t.test('MFA fails closed without encryption configuration or with stale credential proof', async () => {
    assert.equal(await startMfa(db, admin.id, { ...config, mfaEncryptionKey: null }, passwordHash), null);
    assert.equal(await startMfa(db, admin.id, config, 'stale-password-hash'), null);
  });
  await t.test('five failures lock challenge and password re-entry does not reset limit', async () => {
    await db.user.update({ where: { id: admin.id }, data: { mfaChallengeExpiresAt: new Date(0) } });
    challenge = cookieFor(await login(admin), 'ewaguard_mfa');
    for (let i = 0; i < 5; i++) assert.equal((await verify(challenge, 'bad')).status, 401);
    assert.equal((await login(admin)).status, 503);
    assert.equal((await verify(challenge, totpFor(secret, config).generate())).status, 401);
  });
  await t.test('logout clears session and cancels pending challenge', async () => {
    await db.user.update({ where: { id: admin.id }, data: { mfaChallengeExpiresAt: new Date(0) } });
    challenge = cookieFor(await login(admin), 'ewaguard_mfa');
    const response = await request('/api/auth/logout', `${challenge}; ${adminCookie}`, {});
    assert.equal(response.status, 204);
    assert.equal(cookieFor(response, 'ewaguard_access'), 'ewaguard_access=');
    assert.equal(cookieFor(response, 'ewaguard_mfa'), 'ewaguard_mfa=');
    assert.equal((await db.user.findUnique({ where: { id: admin.id } })).mfaChallengeHash, null);
  });
  await t.test('no secrets, TOTP codes, cookies or passwords in logs', () => {
    const output = JSON.stringify(logs.flatMap((mock) => mock.mock.calls));
    for (const value of [secret, password, passwordHash, challenge, adminCookie, config.mfaEncryptionKey, ...submittedCodes]) assert.equal(output.includes(value), false);
  });
  await t.test('MFA persistent audits record committed outcomes without credentials', async () => {
    const rows = await db.auditLog.findMany({ where: { actorId: admin.id, resourceType: 'AUTHENTICATION' } });
    for (const action of ['MFA_ENROLLMENT_STARTED', 'MFA_ENROLLMENT_COMPLETED', 'MFA_CHALLENGE_STARTED', 'MFA_CHALLENGE_SUCCEEDED', 'ADMIN_AUTHENTICATION_SUCCEEDED', 'MFA_CANCELLED']) {
      assert.ok(rows.some((r) => r.action === action && r.outcome === 'SUCCESS'), action);
    }
    assert.equal(rows.filter((r) => r.action === 'MFA_ENROLLMENT_COMPLETED').length, 1);
    assert.ok(rows.some((r) => r.action === 'MFA_CHALLENGE_FAILED' && r.outcome === 'FAILURE'));
    const output = JSON.stringify(rows.map(({ metadata, action, outcome }) => ({ metadata, action, outcome })));
    for (const value of [secret, password, passwordHash, challenge, adminCookie, ...submittedCodes]) assert.equal(output.includes(value), false);
  });
});

test('MFA IP throttling, trusted origin and config validation', async (t) => {
  const config = parseConfig({ JWT_SECRET: randomBytes(32).toString('hex'), MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  assert.throws(() => parseConfig({ JWT_SECRET: config.jwtSecret, MFA_ENCRYPTION_KEY: 'not-a-key' }));
  assert.throws(() => parseConfig({ JWT_SECRET: config.jwtSecret, MFA_CHALLENGE_TTL_SECONDS: '3600' }));
  const server = createApp(config, { database: {} }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/auth/mfa/verify`;
  const options = { method: 'POST', headers: { Origin: config.frontendUrl, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '000000' }) };
  assert.equal((await fetch(url, { ...options, headers: { ...options.headers, Origin: 'https://untrusted.example' } })).status, 403);
  for (let i = 0; i < 19; i++) assert.equal((await fetch(url, options)).status, 401);
  const response = await fetch(url, options);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, 'MFA_RATE_LIMITED');
});

test('encryption authenticates ciphertext and user binding; authorization fails closed', () => {
  const config = { mfaEncryptionKey: randomBytes(32).toString('hex') };
  const encrypted = encryptSecret('fixture-secret', 'owner', config);
  assert.equal(decryptSecret(encrypted, 'owner', config), 'fixture-secret');
  assert.throws(() => decryptSecret(encrypted, 'other-owner', config));
  assert.throws(() => decryptSecret(encrypted, 'owner', { mfaEncryptionKey: randomBytes(32).toString('hex') }));
  assert.throws(() => requireRole('UNKNOWN'));
  const res = { status(value) { assert.equal(value, 401); return this; }, json() {} };
  requireRole('IT_SECURITY_ADMIN')({ user: { role: 'IT_SECURITY_ADMIN' } }, res, () => assert.fail('Unauthenticated context accepted'));
});
