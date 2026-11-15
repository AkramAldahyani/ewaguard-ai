import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';

test('bulk training assignment: selected and all eligible employees', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(),
    users = [],
    programs = [];
  const config = parseConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-bulk-assignment-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173',
  });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    // Removes only the synthetic programs' assignments (including any made for real local employees by the
    // all-eligible case), then the synthetic programs and users.
    try {
      await db.$transaction(
        async (tx) => {
          await tx.auditLog.deleteMany({
            where: { OR: [{ actorId: { in: users } }, { resourceId: { in: programs } }] },
          });
          await tx.trainingProgress.deleteMany({ where: { assignment: { trainingId: { in: programs } } } });
          await tx.trainingAssignment.deleteMany({ where: { trainingId: { in: programs } } });
          await tx.trainingProgram.deleteMany({ where: { id: { in: programs } } });
          await tx.user.deleteMany({ where: { id: { in: users } } });
        },
        { timeout: 20000 },
      );
    } finally {
      await db.$disconnect();
    }
  });
  async function user(role = 'EMPLOYEE', extra = {}) {
    const row = await db.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Bulk',
        email: `${randomUUID()}@example.invalid`,
        status: 'ACTIVE',
        passwordHash: 'synthetic-not-a-login-hash',
        role: { connect: { name: role } },
        ...(role === 'IT_SECURITY_ADMIN'
          ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n }
          : {}),
        ...extra,
      },
    });
    users.push(row.id);
    return row;
  }
  const admin = await user('IT_SECURITY_ADMIN'),
    noMfa = await user('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
  const [first, second, third, revokedEmployee] = [await user(), await user(), await user(), await user()];
  const inactive = await user('EMPLOYEE', { status: 'DEACTIVATED', deactivatedAt: new Date() });
  async function request(path, { actor = admin, body } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: config.frontendUrl,
        Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }
  const created = await request('/api/admin/training', {
    body: {
      title: `Synthetic bulk ${randomUUID()}`,
      description: 'Test only.',
      topic: 'OTHER',
      learningObjectives: ['Test.'],
      estimatedMinutes: 5,
      requiresQuiz: false,
      content: {
        version: 1,
        sections: [
          { key: 'one', title: 'One', body: 'Test.' },
          { key: 'two', title: 'Two', body: 'Test.' },
        ],
      },
    },
  });
  assert.equal(created.status, 200);
  const programId = created.data.program.id;
  programs.push(programId);
  const bulk = `/api/admin/training/${programId}/assignments/bulk`;
  const assignedCount = () => db.trainingAssignment.count({ where: { trainingId: programId } });

  await t.test('authorization, publication state and strict input validation', async () => {
    assert.equal((await request(bulk, { actor: first, body: { allEligible: true } })).status, 403);
    assert.equal((await request(bulk, { actor: noMfa, body: { allEligible: true } })).status, 401);
    assert.equal((await request(bulk, { body: { employeeIds: [first.id] } })).status, 409);
    const draft = (await request(`/api/admin/training/${programId}`)).data.program;
    await request(`/api/admin/training/${programId}/review`, { body: { expectedUpdatedAt: draft.updatedAt } });
    const reviewed = (await request(`/api/admin/training/${programId}`)).data.program;
    assert.equal(
      (await request(`/api/admin/training/${programId}/publish`, { body: { expectedUpdatedAt: reviewed.updatedAt } }))
        .status,
      200,
    );
    for (const body of [
      {},
      { allEligible: false },
      { allEligible: 'true' },
      { allEligible: true, employeeIds: [first.id] },
      { employeeIds: [] },
      { employeeIds: ['not-a-uuid'] },
      { employeeIds: [first.id, first.id] },
      { employeeIds: Array.from({ length: 201 }, () => randomUUID()) },
      { employeeIds: [first.id], extra: true },
    ])
      assert.equal((await request(bulk, { body })).status, 400, JSON.stringify(body).slice(0, 80));
    // A list containing any ineligible account (administrator, unknown or inactive) is rejected without partial writes.
    for (const bad of [admin.id, randomUUID(), inactive.id])
      assert.equal((await request(bulk, { body: { employeeIds: [first.id, bad] } })).status, 400);
    assert.equal(await assignedCount(), 0);
  });

  await t.test('selected employees are assigned once, with per-assignment audit records', async () => {
    const response = await request(bulk, { body: { employeeIds: [first.id, second.id] } });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.deepEqual(response.data, { eligible: 2, created: 2, alreadyAssigned: 0, revoked: 0 });
    const again = await request(bulk, { body: { employeeIds: [second.id, third.id] } });
    assert.deepEqual(again.data, { eligible: 2, created: 1, alreadyAssigned: 1, revoked: 0 });
    assert.equal(await assignedCount(), 3);
    const progress = await db.trainingProgress.findMany({ where: { assignment: { trainingId: programId } } });
    assert.equal(progress.length, 3);
    assert.ok(progress.every((row) => row.status === 'NOT_STARTED'));
    const audits = await db.auditLog.findMany({ where: { resourceId: programId, action: 'TRAINING_ASSIGNED' } });
    assert.equal(audits.length, 3);
    assert.ok(audits.every((row) => row.actorId === admin.id && row.metadata.bulk === 'SELECTED'));
    assert.equal(
      (await request('/api/training', { actor: third })).data.items.filter((item) => item.training.id === programId)
        .length,
      1,
    );
  });

  await t.test('eligible employee listing is course-specific and concurrent requests never duplicate', async () => {
    const now = new Date();
    const other = await db.trainingProgram.create({
      data: {
        title: `Synthetic other ${randomUUID()}`,
        description: 'Test only.',
        topic: 'OTHER',
        learningObjectives: ['Test.'],
        content: {
          version: 1,
          sections: [
            { key: 'one', title: 'One', body: 'Test.' },
            { key: 'two', title: 'Two', body: 'Test.' },
          ],
        },
        status: 'PUBLISHED',
        requiresQuiz: false,
        createdById: admin.id,
        reviewedById: admin.id,
        reviewedAt: now,
        publishedAt: now,
      },
    });
    programs.push(other.id);
    const listed = async (trainingId) => {
      const response = await request(`/api/admin/training/employees?pageSize=50&search=Bulk&trainingId=${trainingId}`);
      assert.equal(response.status, 200, JSON.stringify(response.data));
      return new Set(response.data.items.map((row) => row.id));
    };
    const forProgram = await listed(programId);
    for (const assigned of [first, second, third])
      assert.equal(forProgram.has(assigned.id), false, 'already assigned to this course');
    assert.equal(forProgram.has(revokedEmployee.id), true);
    for (const ineligible of [admin, noMfa, inactive]) assert.equal(forProgram.has(ineligible.id), false);
    const forOther = await listed(other.id);
    for (const person of [first, second, third, revokedEmployee])
      assert.equal(forOther.has(person.id), true, 'other courses are unaffected');
    assert.equal((await request('/api/admin/training/employees?trainingId=not-a-uuid')).status, 400);
    assert.equal((await request(`/api/admin/training/employees?trainingId=${randomUUID()}`)).status, 404);
    assert.equal((await request(`/api/admin/training/employees?trainingId=${other.id}`, { actor: first })).status, 403);

    // Simultaneous single and bulk requests for the same course and employee create exactly one assignment.
    const path = `/api/admin/training/${other.id}/assignments`;
    const results = await Promise.all([
      ...Array.from({ length: 4 }, () => request(path, { body: { employeeId: revokedEmployee.id } })),
      request(`${path}/bulk`, { body: { employeeIds: [revokedEmployee.id, first.id] } }),
      request(`${path}/bulk`, { body: { employeeIds: [first.id] } }),
    ]);
    assert.ok(
      results.every((result) => result.status === 200),
      JSON.stringify(results.map((result) => result.status)),
    );
    assert.equal(
      results.slice(0, 4).filter((result) => result.data.alreadyAssigned === false).length +
        results.slice(4).reduce((sum, result) => sum + (result.data.created ?? 0), 0),
      2,
      'one creation per employee',
    );
    for (const person of [revokedEmployee, first])
      assert.equal(await db.trainingAssignment.count({ where: { trainingId: other.id, employeeId: person.id } }), 1);
    const remaining = await listed(other.id);
    assert.equal(remaining.has(revokedEmployee.id), false);
    assert.equal(remaining.has(first.id), false);
    assert.equal(remaining.has(second.id), true);
    assert.equal(await assignedCount(), 3, 'the first course is untouched');
  });

  await t.test('all eligible employees: revoked assignments stay revoked and reruns create nothing', async () => {
    await db.trainingAssignment.create({
      data: {
        trainingId: programId,
        employeeId: revokedEmployee.id,
        assignedById: admin.id,
        revokedAt: new Date(),
        progress: { create: {} },
      },
    });
    const eligible = await db.user.count({
      where: { status: 'ACTIVE', deactivatedAt: null, role: { name: 'EMPLOYEE' } },
    });
    const response = await request(bulk, { body: { allEligible: true } });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.deepEqual(response.data, { eligible, created: eligible - 4, alreadyAssigned: 3, revoked: 1 });
    assert.equal(
      (await db.trainingAssignment.findFirst({ where: { trainingId: programId, employeeId: revokedEmployee.id } }))
        .revokedAt instanceof Date,
      true,
    );
    assert.equal(await db.trainingAssignment.count({ where: { trainingId: programId, employeeId: admin.id } }), 0);
    const rerun = await request(bulk, { body: { allEligible: true } });
    assert.deepEqual(rerun.data, { eligible, created: 0, alreadyAssigned: eligible - 1, revoked: 1 });
    assert.equal(await assignedCount(), eligible);
  });
});
