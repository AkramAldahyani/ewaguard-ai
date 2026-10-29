import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { authCookie } from '../src/auth/auth-token.js';
import { hashPassword } from '../src/auth/auth-service.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig } from '../src/config/env.js';

const TEST_SECRET = 'authentication-integration-secret-with-adequate-length';
const ORIGIN = 'http://127.0.0.1:5173';

test('authentication lifecycle and security boundaries', async (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  const info = t.mock.method(console, 'info', () => {});
  const database = createDatabaseClient();
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: TEST_SECRET, FRONTEND_URL: ORIGIN, LOGIN_RATE_LIMIT_MAX: '100' });
  const role = await database.role.findUniqueOrThrow({ where: { name: 'EMPLOYEE' } });
  const department = await database.department.findUniqueOrThrow({ where: { code: 'OPS' } });
  const password = `Auth-test-${randomUUID()}!`;
  const user = await database.user.create({ data: {
    employeeIdentifier: `TEST-${randomUUID()}`,
    firstName: 'Authentication', lastName: 'Fixture',
    email: `${randomUUID()}@example.invalid`, passwordHash: await hashPassword(password),
    status: 'ACTIVE', roleId: role.id, departmentId: department.id,
  } });
  const app = createApp(config, { database });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.user.deleteMany({ where: { id: user.id } });
    await database.$disconnect();
  });

  const request = (path, options = {}, cookie) => fetch(`${base}${path}`, {
    ...options,
    headers: { Origin: ORIGIN, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
  });
  const login = (email, suppliedPassword) => request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password: suppliedPassword }),
  });

  await t.test('anonymous protected endpoint is rejected', async () => {
    const response = await request('/api/auth/me');
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'AUTHENTICATION_REQUIRED');
  });
  let cookie;
  let loginSession;
  await t.test('valid login returns safe profile and secure development cookie', async () => {
    const response = await login(user.email.toUpperCase(), password);
    assert.equal(response.status, 200);
    const body = await response.json();
    loginSession = body.session;
    assert.match(loginSession.id, /^[0-9a-f-]{36}$/i);
    const serialized = JSON.stringify(body);
    assert.equal(body.user.id, user.id);
    assert.equal(body.user.role, 'EMPLOYEE');
    assert.equal(body.user.department.code, 'OPS');
    assert.equal('passwordHash' in body.user, false);
    assert.equal('token' in body, false);
    assert.equal(serialized.includes(password), false);
    assert.equal(serialized.includes(user.passwordHash), false);
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /^ewaguard_access=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//i);
    assert.match(setCookie, /Max-Age=1800/i);
    assert.doesNotMatch(setCookie, /Secure/i);
    cookie = setCookie.split(';', 1)[0];
  });
  await t.test('current user resolves trusted database identity', async () => {
    const response = await request('/api/auth/me', {}, cookie);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user.id, user.id);
    assert.equal('passwordHash' in body.user, false);
    assert.match(body.session.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(body.session, loginSession, 'refresh retains the same session identity and expiry');
  });
  await t.test('a new sign-in has a different session identity', async () => {
    const response = await login(user.email, password);
    assert.equal(response.status, 200);
    assert.notEqual((await response.json()).session.id, loginSession.id);
  });
  await t.test('wrong password and nonexistent account use the same response', async () => {
    const wrong = await login(user.email, `${password}-wrong`);
    const missing = await login('missing@example.invalid', password);
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.deepEqual(await wrong.json(), await missing.json());
  });
  await t.test('employee identifier is not accepted as a login method', async () => {
    const response = await login(user.employeeIdentifier, password);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'INVALID_CREDENTIALS');
  });
  await t.test('inactive account cannot authenticate and is not disclosed', async () => {
    await database.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    const inactive = await login(user.email, password);
    assert.equal(inactive.status, 401);
    assert.equal((await inactive.json()).error.code, 'INVALID_CREDENTIALS');
    const existingCookie = await request('/api/auth/me', {}, cookie);
    assert.equal(existingCookie.status, 401, 'database status invalidates an existing token');
    await database.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
  });
  await t.test('invalid and expired tokens are rejected', async () => {
    const cookieName = authCookie(config).name;
    const invalid = await request('/api/auth/me', {}, `${cookieName}=invalid`);
    assert.equal(invalid.status, 401);
    const expired = jwt.sign({}, TEST_SECRET, { algorithm: 'HS256', subject: user.id, issuer: 'ewaguard-api', audience: 'ewaguard-web', expiresIn: -1 });
    assert.equal((await request('/api/auth/me', {}, `${cookieName}=${expired}`)).status, 401);
  });
  await t.test('untrusted browser origin is rejected', async () => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'UNTRUSTED_ORIGIN');
  });
  await t.test('logout clears cookie without returning token data', async () => {
    const response = await request('/api/auth/logout', { method: 'POST' }, cookie);
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    const cleared = response.headers.get('set-cookie');
    assert.match(cleared, /^ewaguard_access=/);
    assert.match(cleared, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
    assert.match(cleared, /HttpOnly/i);
    assert.match(cleared, /SameSite=Lax/i);
  });
  await t.test('production cookie uses __Host prefix and Secure', () => {
    const production = authCookie({ ...config, nodeEnv: 'production' });
    assert.equal(production.name, '__Host-ewaguard_access');
    assert.equal(production.options.secure, true);
    assert.equal(production.options.httpOnly, true);
    assert.equal(production.options.path, '/');
  });
  await t.test('logs contain no submitted password, hash, or token', () => {
    const logs = JSON.stringify([...warning.mock.calls, ...info.mock.calls]);
    assert.equal(logs.includes(password), false);
    assert.equal(logs.includes(user.passwordHash), false);
    assert.equal(logs.includes(cookie), false);
  });
  await t.test('persistent login and logout audit is minimized and revocation is idempotent', async () => {
    assert.equal((await request('/api/auth/logout', { method: 'POST' }, cookie)).status, 204);
    const rows = await database.auditLog.findMany({ where: { actorId: user.id, resourceType: 'AUTHENTICATION' } });
    for (const action of ['LOGIN_SUCCEEDED', 'LOGOUT', 'SESSION_REVOKED']) assert.ok(rows.some((r) => r.action === action && r.outcome === 'SUCCESS'));
    assert.equal(rows.filter((r) => r.action === 'SESSION_REVOKED').length, 1);
    for (const value of [password, user.passwordHash, user.email, cookie, loginSession.id]) assert.equal(JSON.stringify(rows).includes(value), false);
  });
  await t.test('audit store failure does not block login or change credential failure responses', async () => {
    const original = database.auditLog.create;
    database.auditLog.create = async () => { throw new Error('SECRET_AUDIT_STORE'); };
    try {
      assert.equal((await login(user.email, password)).status, 200);
      const wrong = await login(user.email, 'wrong');
      const missing = await login('absent@example.invalid', 'wrong');
      assert.equal(wrong.status, 401);
      assert.deepEqual(await wrong.json(), await missing.json());
      assert.equal((await request('/api/auth/logout', { method: 'POST' }, cookie)).status, 204);
    } finally { database.auditLog.create = original; }
  });
});

test('login rate limiter blocks repeated failures', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const database = createDatabaseClient();
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: TEST_SECRET, FRONTEND_URL: ORIGIN, LOGIN_RATE_LIMIT_MAX: '2', LOGIN_RATE_LIMIT_WINDOW_MINUTES: '1' });
  const server = createApp(config, { database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.$disconnect();
  });
  const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;
  const options = { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@example.invalid', password: 'invalid' }) };
  assert.equal((await fetch(url, options)).status, 401);
  assert.equal((await fetch(url, options)).status, 401);
  const limited = await fetch(url, options);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'LOGIN_RATE_LIMITED');
});
