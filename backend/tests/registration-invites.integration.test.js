import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl, parseConfig } from '../src/config/env.js';
import { hashPassword } from '../src/auth/auth-service.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';

async function fixture(t, invitesEnabled = true) {
  const url = new URL(databaseUrl());
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'Integration fixtures must use the local development database.',
  );
  const db = createDatabaseClient();
  const config = parseConfig({
    NODE_ENV: 'test',
    REGISTRATION_INVITES_ENABLED: String(invitesEnabled),
    JWT_SECRET: 'registration-invite-test-secret-with-sufficient-length',
    FRONTEND_URL: 'http://127.0.0.1:5173',
    LOGIN_RATE_LIMIT_MAX: '100',
  });
  const app = createApp(config, { database: db }),
    server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const ids = [],
    emails = [];
  const password = `Fixture-password-${randomUUID()}!`;
  const department = await db.department.findFirstOrThrow({
    where: { active: true },
    select: { id: true, name: true },
  });
  async function account(role) {
    const row = await db.user.create({
      data: {
        firstName: 'Invite',
        lastName: 'Fixture',
        email: `${randomUUID()}@example.invalid`,
        employeeIdentifier: `UM-${randomUUID()}`,
        status: 'ACTIVE',
        department: { connect: { id: department.id } },
        passwordHash: await hashPassword(password),
        role: { connect: { name: role } },
        ...(role === 'IT_SECURITY_ADMIN'
          ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n }
          : {}),
      },
    });
    ids.push(row.id);
    return row;
  }
  const admin = await account('IT_SECURITY_ADMIN'),
    employee = await account('EMPLOYEE');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    const registered = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const users = [...ids, ...registered.map((row) => row.id)];
    const invites = await db.registrationInvite.findMany({ where: { createdById: { in: ids } }, select: { id: true } });
    await db.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: users } },
          { resourceType: 'USER', resourceId: { in: users } },
          { resourceType: 'REGISTRATION_INVITE', resourceId: { in: invites.map((row) => row.id) } },
        ],
      },
    });
    await db.registrationInvite.deleteMany({ where: { createdById: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });
  async function request(path, { actor = admin, method = 'GET', body, origin = config.frontendUrl } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Origin: origin,
        ...(actor
          ? {
              Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt, actor.sessionVersion)}`,
            }
          : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) : null, headers: response.headers };
  }
  const invite = (body = {}) =>
    request('/api/admin/invites', {
      method: 'POST',
      body: { label: 'Fixture onboarding', departmentId: department.id, ...body },
    });
  const person = (token, extra = {}) => {
    const email = `${randomUUID()}@example.invalid`;
    emails.push(email);
    return { token, firstName: 'Joined', lastName: 'Employee', email, password, confirmPassword: password, ...extra };
  };
  const register = (body) => request('/api/auth/register', { actor: null, method: 'POST', body });
  return { db, config, admin, employee, department, password, emails, request, invite, person, register };
}

test('invite links: issuance, public self-registration, limits, revocation and audit', async (t) => {
  const f = await fixture(t),
    { db, request, invite, person, register } = f;
  let token, inviteId;

  await t.test('only MFA administrators from a trusted origin can manage invite links', async () => {
    for (const options of [{ actor: null }, { actor: f.employee }]) {
      const expected = options.actor ? 403 : 401;
      assert.equal((await request('/api/admin/invites', options)).status, expected);
      assert.equal(
        (
          await request('/api/admin/invites', {
            ...options,
            method: 'POST',
            body: { label: 'x', departmentId: f.department.id },
          })
        ).status,
        expected,
      );
    }
    assert.equal((await request('/api/admin/invites', { origin: 'https://evil.invalid' })).status, 403);
  });

  await t.test('issuance validates bounds, stores only a digest and discloses the token once', async () => {
    for (const body of [
      { maxUses: 0 },
      { maxUses: 201 },
      { maxUses: '5' },
      { expiresInHours: 169 },
      { emailDomain: 'not a domain' },
      { label: '' },
      { departmentId: randomUUID() },
      { role: 'IT_SECURITY_ADMIN' },
    ])
      assert.equal((await invite(body)).status, 400, JSON.stringify(body));
    const created = await invite({ maxUses: 3, expiresInHours: 24, emailDomain: '@Example.INVALID' });
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('cache-control'), 'no-store');
    token = created.data.token;
    inviteId = created.data.invite.id;
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(
      [created.data.invite.state, created.data.invite.maxUses, created.data.invite.useCount],
      ['ACTIVE', 3, 0],
    );
    assert.equal(created.data.invite.emailDomain, 'example.invalid');
    const stored = await db.registrationInvite.findUniqueOrThrow({ where: { id: inviteId } });
    assert.match(stored.tokenHash, /^[0-9a-f]{64}$/);
    assert.notEqual(stored.tokenHash, token);
    const listed = await request('/api/admin/invites');
    assert.ok(listed.data.items.some((item) => item.id === inviteId));
    assert.ok(!JSON.stringify(listed.data).includes(token));
    assert.doesNotMatch(JSON.stringify(listed.data), /tokenHash|passwordHash|email"/);
  });

  await t.test('a valid link registers an active employee who can then sign in', async () => {
    const valid = await request('/api/auth/register/validate', { actor: null, method: 'POST', body: { token } });
    assert.equal(valid.status, 200);
    assert.deepEqual([valid.data.valid, valid.data.department], [true, f.department.name]);
    const unknown = `${'A'.repeat(42)}B`;
    for (const value of [unknown, 'short', undefined])
      assert.equal(
        (await request('/api/auth/register/validate', { actor: null, method: 'POST', body: { token: value } })).status,
        400,
      );
    for (const [body, code] of [
      [person(token, { password: 'password1234', confirmPassword: 'password1234' }), 'SETUP_PASSWORD_WEAK'],
      [person(token, { confirmPassword: 'different' }), 'SETUP_PASSWORD_MISMATCH'],
      [person(token, { email: `${randomUUID()}@elsewhere.invalid` }), 'INVITE_EMAIL_DOMAIN'],
      [person(token, { role: 'IT_SECURITY_ADMIN' }), 'USER_INVALID'],
      [person(token, { firstName: ' ' }), 'USER_INVALID'],
      [person(unknown), 'INVITE_INVALID'],
    ]) {
      const response = await register(body);
      assert.equal(response.status, 400, code);
      assert.equal(response.data.error.code, code);
    }
    const body = person(token);
    const created = await register(body);
    assert.equal(created.status, 201);
    assert.deepEqual(created.data, { completed: true });
    assert.equal(created.headers.get('set-cookie'), null);
    const user = await db.user.findUniqueOrThrow({ where: { email: body.email }, include: { role: true } });
    assert.deepEqual(
      [user.status, user.role.name, user.departmentId, user.mfaEnabledAt],
      ['ACTIVE', 'EMPLOYEE', f.department.id, null],
    );
    assert.notEqual(user.passwordHash, body.password);
    assert.equal((await db.registrationInvite.findUniqueOrThrow({ where: { id: inviteId } })).useCount, 1);
    const login = await request('/api/auth/login', {
      actor: null,
      method: 'POST',
      body: { email: body.email, password: body.password },
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.role, 'EMPLOYEE');
    const duplicate = await register({ ...person(token), email: body.email.toUpperCase() });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.error.code, 'REGISTRATION_EMAIL_UNAVAILABLE');
    assert.equal((await db.registrationInvite.findUniqueOrThrow({ where: { id: inviteId } })).useCount, 1);
    const logs = await db.auditLog.findMany({
      where: { OR: [{ resourceId: user.id }, { resourceType: 'REGISTRATION_INVITE', resourceId: inviteId }] },
    });
    assert.ok(logs.some((log) => log.action === 'USER_SELF_REGISTERED' && log.metadata.inviteId === inviteId));
    assert.ok(logs.some((log) => log.action === 'REGISTRATION_INVITE_CREATED' && log.actorId === f.admin.id));
    assert.ok(!JSON.stringify(logs).includes(token) && !JSON.stringify(logs).includes(body.password));
  });

  await t.test('the use limit holds under simultaneous registration', async () => {
    const single = await invite({ maxUses: 1 });
    const responses = await Promise.all([1, 2].map(() => register(person(single.data.token))));
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 400]);
    const stored = await db.registrationInvite.findUniqueOrThrow({ where: { id: single.data.invite.id } });
    assert.equal(stored.useCount, 1);
    const listed = await request('/api/admin/invites');
    assert.equal(listed.data.items.find((item) => item.id === stored.id).state, 'EXHAUSTED');
  });

  await t.test('revoked and expired links stop working immediately', async () => {
    const revoke = (id, options = {}) =>
      request(`/api/admin/invites/${id}/revoke`, { method: 'POST', body: {}, ...options });
    assert.equal((await revoke(inviteId, { actor: f.employee })).status, 403);
    assert.equal((await revoke(randomUUID())).status, 404);
    const revoked = await revoke(inviteId);
    assert.equal(revoked.status, 200);
    assert.equal(revoked.data.invite.state, 'REVOKED');
    assert.equal((await revoke(inviteId)).data.invite.state, 'REVOKED');
    assert.equal((await register(person(token))).data.error.code, 'INVITE_INVALID');
    const expiring = await invite();
    await db.registrationInvite.update({
      where: { id: expiring.data.invite.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await register(person(expiring.data.token))).data.error.code, 'INVITE_INVALID');
    assert.equal(await db.user.count({ where: { email: { in: f.emails.slice(-2) } } }), 0);
  });
});

test('invite links can be disabled by configuration', async (t) => {
  assert.throws(
    () => parseConfig({ JWT_SECRET: 'x'.repeat(40), REGISTRATION_INVITES_ENABLED: 'yes' }),
    /must be true or false/,
  );
  const f = await fixture(t, false);
  const created = await f.invite();
  assert.equal(created.status, 403);
  assert.equal(created.data.error.code, 'INVITES_DISABLED');
  assert.equal((await f.request('/api/admin/invites')).data.enabled, false);
  const response = await f.register(f.person(`${'A'.repeat(42)}B`));
  assert.equal(response.data.error.code, 'INVITE_INVALID');
});
