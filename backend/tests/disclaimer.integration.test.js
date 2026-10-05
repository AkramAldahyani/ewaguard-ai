import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { issueAccessToken, authCookie } from '../src/auth/auth-token.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig } from '../src/config/env.js';
import { verifyAcknowledgement } from '../src/disclaimers/disclaimer-service.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';

const ORIGIN = 'http://127.0.0.1:5173';
const SECRET = 'disclaimer-integration-secret-with-adequate-length';

test('sensitive-information acknowledgement API and verification boundaries', async (t) => {
  const database = createDatabaseClient();
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: SECRET, FRONTEND_URL: ORIGIN });
  const employeeRole = await database.role.findUniqueOrThrow({ where: { name: 'EMPLOYEE' } });
  const adminRole = await database.role.findUniqueOrThrow({ where: { name: 'IT_SECURITY_ADMIN' } });
  const employee = await database.user.create({ data: {
    email: `${randomUUID()}@example.invalid`, firstName: 'Disclaimer', lastName: 'Employee',
    passwordHash: 'not-used-by-this-test', status: 'ACTIVE', roleId: employeeRole.id,
  } });
  const adminMfaEnabledAt = new Date();
  const admin = await database.user.create({ data: {
    email: `${randomUUID()}@example.invalid`, firstName: 'Disclaimer', lastName: 'Admin',
    passwordHash: 'not-used-by-this-test', status: 'ACTIVE', roleId: adminRole.id,
    mfaEnabledAt: adminMfaEnabledAt, mfaSecretEncrypted: 'test-only-not-decrypted', mfaLastCounter: 0n,
  } });
  const server = createApp(config, { database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookieName = authCookie(config).name;
  const cookieFor = (userId) => `${cookieName}=${issueAccessToken(userId, config, userId === admin.id ? adminMfaEnabledAt : null)}`;
  const request = (body, cookie) => fetch(`${base}/api/disclaimers/acknowledge`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: [employee.id, admin.id] } } });
    await database.user.deleteMany({ where: { id: { in: [employee.id, admin.id] } } });
    await database.$disconnect();
  });

  await t.test('anonymous and administrator requests are denied', async () => {
    assert.equal((await request({ context: 'EMAIL_ANALYSIS' })).status, 401);
    assert.equal((await request({ context: 'EMAIL_ANALYSIS' }, cookieFor(admin.id))).status, 403);
  });

  await t.test('invalid context and client-controlled version or content are rejected', async () => {
    const employeeCookie = cookieFor(employee.id);
    for (const body of [
      { context: 'SCREENSHOT_ANALYSIS' },
      { context: 'EMAIL_ANALYSIS', version: '999.0' },
      { context: 'EMAIL_ANALYSIS', content: 'Sensitive content must not be accepted' },
    ]) {
      const response = await request(body, employeeCookie);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'INVALID_ACKNOWLEDGEMENT');
    }
    assert.equal(await database.disclaimerAcknowledgement.count({ where: { userId: employee.id } }), 0);
  });

  let acknowledgement;
  await t.test('employee acknowledgement stores and returns only authoritative metadata', async () => {
    const response = await request({ context: 'EMAIL_ANALYSIS' }, cookieFor(employee.id));
    assert.equal(response.status, 201);
    acknowledgement = (await response.json()).acknowledgement;
    assert.equal(acknowledgement.version, DISCLAIMER_DEFINITION.version);
    assert.equal(acknowledgement.context, 'EMAIL_ANALYSIS');
    assert.equal(acknowledgement.reused, false);
    assert.deepEqual(Object.keys(acknowledgement).sort(), ['acknowledgedAt', 'context', 'id', 'reused', 'version']);
    const stored = await database.disclaimerAcknowledgement.findUniqueOrThrow({ where: { id: acknowledgement.id } });
    assert.equal(stored.userId, employee.id);
    assert.equal(stored.version, DISCLAIMER_DEFINITION.version);
    assert.deepEqual(Object.keys(stored).sort(), ['context', 'createdAt', 'id', 'userId', 'version']);
  });

  await t.test('rapid repeated acknowledgement reuses context-specific record', async () => {
    const response = await request({ context: 'EMAIL_ANALYSIS' }, cookieFor(employee.id));
    assert.equal(response.status, 200);
    const repeated = (await response.json()).acknowledgement;
    assert.equal(repeated.id, acknowledgement.id);
    assert.equal(repeated.reused, true);
    assert.equal(await database.disclaimerAcknowledgement.count({ where: { userId: employee.id, context: 'EMAIL_ANALYSIS' } }), 1);
  });

  await t.test('verification binds acknowledgement to user, context, version, and optional age', async () => {
    assert.ok(await verifyAcknowledgement(database, { acknowledgementId: acknowledgement.id, userId: employee.id, context: 'EMAIL_ANALYSIS' }));
    assert.equal(await verifyAcknowledgement(database, { acknowledgementId: acknowledgement.id, userId: admin.id, context: 'EMAIL_ANALYSIS' }), null);
    assert.equal(await verifyAcknowledgement(database, { acknowledgementId: acknowledgement.id, userId: employee.id, context: 'FILE_ANALYSIS' }), null);
    assert.equal(await verifyAcknowledgement(database, { acknowledgementId: randomUUID(), userId: employee.id, context: 'EMAIL_ANALYSIS' }), null);
    assert.equal(await verifyAcknowledgement(database, { acknowledgementId: acknowledgement.id, userId: employee.id, context: 'EMAIL_ANALYSIS', now: new Date(Date.now() + 1_000), maxAgeMs: 0 }), null);
  });
});
