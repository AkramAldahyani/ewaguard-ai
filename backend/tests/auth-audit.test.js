import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { authAudit } from '../src/auth/auth-audit.js';
import { completeMfa, startMfa, totpFor } from '../src/auth/mfa-service.js';

test('authentication audit allow-list excludes arbitrary input and secrets', async () => {
  const rows = [];
  const db = { auditLog: { create: async ({ data }) => rows.push(data) } };
  const id = randomUUID();
  await authAudit(db, 'LOGIN_SUCCEEDED', id, { password: 'SECRET_PASSWORD', cookie: 'SECRET_COOKIE', token: 'SECRET_TOKEN' });
  await authAudit(db, 'LOGIN_FAILED', 'user@example.invalid\nSECRET_INPUT');
  assert.equal(rows[0].actorId, id);
  assert.equal(rows[0].outcome, 'SUCCESS');
  assert.equal(rows[1].actorId, null);
  assert.equal(rows[1].outcome, 'FAILURE');
  assert.deepEqual(rows[0].metadata, {});
  assert.doesNotMatch(JSON.stringify(rows), /SECRET_|example.invalid/);
  await assert.rejects(authAudit(db, 'LOGIN_FAILED\nSECRET_INPUT'));
  assert.equal(rows.length, 2);
});

test('optional audit failure is minimized; required audit fails closed', async (t) => {
  const log = t.mock.method(console, 'warn', () => {});
  const db = { auditLog: { create: async () => { throw new Error('SECRET_DATABASE_PASSWORD'); } } };
  assert.equal(await authAudit(db, 'LOGIN_SUCCEEDED', randomUUID()), false);
  await assert.rejects(authAudit(db, 'MFA_ENROLLMENT_COMPLETED', randomUUID(), { required: true }));
  assert.doesNotMatch(JSON.stringify(log.mock.calls), /SECRET_DATABASE_PASSWORD/);
});

test('MFA enrollment rolls back on audit failure; ordinary verification remains available', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const config = { mfaEncryptionKey: 'ab'.repeat(32), jwtSecret: 'synthetic-audit-test-secret-long-enough', mfaChallengeTtlSeconds: 300, mfaIssuer: 'Test' };
  let user = { id: randomUUID(), email: 'test@example.invalid', status: 'ACTIVE', role: { name: 'IT_SECURITY_ADMIN' },
    passwordHash: 'synthetic-hash', mfaLastCounter: null, mfaEnabledAt: null };
  let fail = false;
  const rows = [];
  const db = { auditLog: { create: async ({ data }) => { if (fail) throw new Error('SECRET_STORE_ERROR'); rows.push(data); } },
    $queryRaw: async () => [], user: { findUnique: async () => user,
      update: async ({ data }) => { Object.assign(user, data); } },
    $transaction: async (work) => {
      const previous = structuredClone(user), length = rows.length;
      try { return await work(db); } catch (error) { user = previous; rows.length = length; throw error; }
    } };
  const challenge = await startMfa(db, user.id, config, user.passwordHash);
  const secret = new URL(challenge.provisioningUri).searchParams.get('secret');
  const code = totpFor(secret, config).generate();
  fail = true;
  await assert.rejects(completeMfa(db, challenge.token, code, config));
  assert.equal(user.mfaEnabledAt, null);
  assert.ok(user.mfaPendingSecret);
  fail = false;
  assert.ok(await completeMfa(db, challenge.token, code, config));
  assert.equal(rows.filter((r) => r.action === 'MFA_ENROLLMENT_COMPLETED').length, 1);
  const next = await startMfa(db, user.id, config, user.passwordHash);
  user.mfaLastCounter = -1n;
  fail = true;
  assert.ok(await completeMfa(db, next.token, totpFor(secret, config).generate(), config));
  fail = false;
  assert.equal(await completeMfa(db, 'SECRET_INVALID_TOKEN', 'SECRET_CODE', config), null);
  assert.equal(rows.at(-1).outcome, 'FAILURE');
  for (const value of [secret, code, challenge.token, 'SECRET_CODE', 'SECRET_INVALID_TOKEN']) assert.equal(JSON.stringify(rows).includes(value), false);
});
