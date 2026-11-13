import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src/config/database.js';
import { findFixtureUsers, isFixtureUser, purgeFixtureUsers } from './fixture-users.js';

test('isFixtureUser requires both reserved-domain email and UM-<uuid> identifier, never a display name', () => {
  const id = `UM-${randomUUID()}`;
  assert.equal(isFixtureUser({ email: 'a@example.invalid', employeeIdentifier: id }), true);
  assert.equal(isFixtureUser({ email: 'a@ewa.bh', employeeIdentifier: id, firstName: 'Lifecycle', lastName: 'Fixture' }), false);
  assert.equal(isFixtureUser({ email: 'a@example.invalid', employeeIdentifier: 'EMP-001', firstName: 'Lifecycle', lastName: 'Fixture' }), false);
  assert.equal(isFixtureUser({ email: 'a@example.invalid', employeeIdentifier: null }), false);
});

test('leftover fixture sweep removes stale fixtures with untouched assignments and keeps anything else', async (t) => {
  const db = createDatabaseClient(), users = [], programs = [];
  t.after(async () => {
    try { await db.$transaction(async (tx) => {
      await tx.incident.deleteMany({ where: { reporterId: { in: users } } });
      await tx.trainingProgress.deleteMany({ where: { assignment: { trainingId: { in: programs } } } });
      await tx.trainingAssignment.deleteMany({ where: { trainingId: { in: programs } } });
      await tx.trainingProgram.deleteMany({ where: { id: { in: programs } } });
      await tx.auditLog.deleteMany({ where: { OR: [{ resourceId: { in: [...users, ...programs] } }, { actorId: { in: users } }] } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    }); } finally { await db.$disconnect(); }
  });
  const old = new Date(Date.now() - 2 * 3_600_000);
  const user = async (email, employeeIdentifier, role = 'EMPLOYEE', createdAt = old) => {
    const row = await db.user.create({ data: { firstName: 'Lifecycle', lastName: 'Fixture', email, employeeIdentifier, status: 'ACTIVE', passwordHash: 'synthetic-not-a-login-hash', createdAt, role: { connect: { name: role } } } });
    users.push(row.id); return row;
  };
  const stale = await user(`${randomUUID()}@example.invalid`, `UM-${randomUUID()}`);
  const busy = await user(`${randomUUID()}@example.invalid`, `UM-${randomUUID()}`);
  const recent = await user(`${randomUUID()}@example.invalid`, `UM-${randomUUID()}`, 'EMPLOYEE', new Date());
  const lookalike = await user(`${randomUUID()}@example.invalid`, `EMP-${randomUUID()}`);
  const admin = await user(`${randomUUID()}@example.invalid`, `SYN-${randomUUID()}`, 'IT_SECURITY_ADMIN');
  const program = await db.trainingProgram.create({ data: { title: `Fixture sweep ${randomUUID()}`, description: 'Test only.', topic: 'OTHER',
    learningObjectives: ['Test.'], content: { version: 1, sections: [{ key: 'one', title: 'One', body: 'Test.' }] }, status: 'PUBLISHED',
    requiresQuiz: false, createdById: admin.id, reviewedById: admin.id, reviewedAt: old, publishedAt: old } });
  programs.push(program.id);
  await db.trainingAssignment.create({ data: { trainingId: program.id, employeeId: stale.id, assignedById: admin.id, progress: { create: {} } } });
  await db.incident.create({ data: { reporterId: busy.id, title: 'Fixture', description: 'Fixture', severity: 'LOW', riskScore: 0,
    riskRuleVersion: '1.0', type: 'SUSPICIOUS_ACTIVITY', detectionSource: 'MANUAL_REPORT' } });

  const candidates = await findFixtureUsers(db, { createdBefore: new Date(Date.now() - 30 * 60_000) });
  const found = new Set(candidates.map((row) => row.id));
  assert.equal(found.has(stale.id) && found.has(busy.id), true);
  assert.equal(found.has(recent.id) || found.has(lookalike.id) || found.has(admin.id), false, 'recent runs and non-fixture identifiers are excluded');

  const preview = await purgeFixtureUsers(db, candidates.filter((row) => [stale.id, busy.id].includes(row.id)));
  assert.equal(await db.user.count({ where: { id: stale.id } }), 1, 'preview never deletes');
  assert.deepEqual(preview.removed.map((row) => row.id), [stale.id]);
  assert.deepEqual(preview.kept.map((row) => [row.id, row.blocking.map((ref) => ref.table)]), [[busy.id, ['incidents']]]);

  const applied = await purgeFixtureUsers(db, candidates.filter((row) => [stale.id, busy.id].includes(row.id)), { apply: true });
  assert.deepEqual(applied.removed.map((row) => row.id), [stale.id]);
  assert.equal(await db.user.count({ where: { id: stale.id } }), 0);
  assert.equal(await db.trainingAssignment.count({ where: { employeeId: stale.id } }), 0);
  assert.equal(await db.user.count({ where: { id: busy.id } }), 1, 'accounts with real activity are kept for manual review');
  assert.equal(await db.auditLog.count({ where: { action: 'FIXTURE_ACCOUNT_REMOVED', resourceId: stale.id } }), 1);
});
