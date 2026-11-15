import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createUserService } from '../src/users/user-service.js';
import { listInput, profileInput, setupInput } from '../src/users/user-policy.js';

test('last enrolled active administrator cannot be disabled, suspended, demoted or deleted', async () => {
  // Isolated policy fixture avoids changing real administrator accounts to test a last-admin state.
  const actor = {
    id: randomUUID(),
    status: 'ACTIVE',
    deletedAt: null,
    deactivatedAt: null,
    passwordHash: 'synthetic',
    role: { name: 'IT_SECURITY_ADMIN' },
    mfaEnabledAt: new Date(),
    sessionVersion: 2,
    updatedAt: new Date(),
  };
  const auth = {
    userId: actor.id,
    sessionId: randomUUID(),
    sessionVersion: 2,
    mfaProof: actor.mfaEnabledAt.toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    authenticatedAt: Math.floor(Date.now() / 1000),
  };
  let writes = 0;
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [],
    revokedSession: { findUnique: async () => null },
    user: {
      findUnique: async () => actor,
      count: async () => 0,
      update: async () => {
        writes++;
      },
    },
    auditLog: {
      create: async () => {
        writes++;
      },
    },
  };
  const service = createUserService({ $transaction: (fn) => fn(tx) });
  for (const [operation, body] of [
    ['status', { status: 'DEACTIVATED' }],
    ['status', { status: 'SUSPENDED' }],
    ['role', { role: 'EMPLOYEE' }],
    ['delete', { confirmation: actor.id }],
  ]) {
    await assert.rejects(
      service[operation](auth, actor.id, { expectedUpdatedAt: actor.updatedAt.toISOString(), ...body }),
      { code: 'USER_LAST_ADMIN' },
    );
  }
  assert.equal(writes, 0);
});

test('provisioning validates identity and never accepts credentials or privileged creation', () => {
  const body = {
    firstName: ' Ada ',
    lastName: ' Lovelace ',
    email: ' ADA@example.invalid ',
    employeeIdentifier: 'staff-42',
    departmentId: randomUUID(),
  };
  assert.deepEqual(profileInput(body, true), {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.invalid',
    employeeIdentifier: 'STAFF-42',
    departmentId: body.departmentId,
    status: 'INVITED',
  });
  for (const extra of [
    { role: 'IT_SECURITY_ADMIN' },
    { sessionVersion: 0 },
    { password: 'not-accepted' },
    { firstName: 'bad\nname' },
    { departmentId: null },
  ])
    assert.throws(() => profileInput({ ...body, ...extra }, true));
  assert.equal(profileInput({ ...body, employeeIdentifier: null }, true).employeeIdentifier, null);
});

test('setup rejects bcrypt-truncated passwords and invalid tokens', () => {
  const token = 'a'.repeat(43);
  assert.throws(() => setupInput({ token, password: 'é'.repeat(37) }), { code: 'USER_INVALID' });
  assert.throws(() => setupInput({ token, password: 'short' }), { code: 'USER_INVALID' });
  assert.throws(() => setupInput({ token: '../../bad', password: 'a'.repeat(20) }), { code: 'SETUP_INVALID' });
  assert.throws(() => setupInput({ token, password: 'é'.repeat(36) }), { code: 'SETUP_PASSWORD_WEAK' });
  assert.throws(() => setupInput({ token, password: 'passwordpassword' }), { code: 'SETUP_PASSWORD_WEAK' });
  const strong = 'River-orbit-sapphire-83!';
  assert.equal(setupInput({ token, password: strong }).password, strong);
});

test('pagination stays bounded and rejects repeated or unknown filters', () => {
  for (const query of [
    { pageSize: '101' },
    { page: '-1' },
    { page: '1.5' },
    { page: '100001' },
    { search: ['a', 'b'] },
    { role: 'OWNER' },
    { password: 'secret' },
  ])
    assert.throws(() => listInput(query));
  const page = listInput({ page: '2', pageSize: '20', status: 'DELETED' });
  assert.equal(page.skip, 20);
  assert.deepEqual(page.where.deletedAt, { not: null });
});
