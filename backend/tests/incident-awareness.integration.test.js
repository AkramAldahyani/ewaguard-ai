import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl, parseConfig } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';

test('Phase 14A incident patterns prepare reviewed warnings without automatic publication or assignment', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient();
  const ids = { users: [], incidents: [], trainings: [], acknowledgements: [], posts: [], assignments: [] };
  const config = parseConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-incident-awareness-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173',
  });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    try {
      await db.auditLog.deleteMany({ where: { actorId: { in: ids.users } } });
      await db.postModerationAction.deleteMany({ where: { postId: { in: ids.posts } } });
      await db.communityPost.deleteMany({ where: { id: { in: ids.posts } } });
      await db.trainingProgress.deleteMany({ where: { assignmentId: { in: ids.assignments } } });
      await db.trainingAssignment.deleteMany({ where: { id: { in: ids.assignments } } });
      await db.trainingProgram.deleteMany({ where: { id: { in: ids.trainings } } });
      await db.incident.deleteMany({ where: { id: { in: ids.incidents } } });
      await db.disclaimerAcknowledgement.deleteMany({ where: { id: { in: ids.acknowledgements } } });
      await db.user.deleteMany({ where: { id: { in: ids.users } } });
    } finally {
      await db.$disconnect();
    }
  });
  async function user(role = 'EMPLOYEE', mfa = true) {
    const row = await db.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Awareness',
        email: `${randomUUID()}@example.invalid`,
        status: 'ACTIVE',
        passwordHash: 'synthetic',
        role: { connect: { name: role } },
        ...(role === 'IT_SECURITY_ADMIN' && mfa
          ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n }
          : {}),
      },
    });
    ids.users.push(row.id);
    return row;
  }
  const admin = await user('IT_SECURITY_ADMIN'),
    reviewer = await user('IT_SECURITY_ADMIN'),
    noMfa = await user('IT_SECURITY_ADMIN', false),
    employee = await user();
  async function request(
    path,
    { actor = admin, method = 'GET', body, origin = config.frontendUrl, tokenMfa = true } = {},
  ) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        Origin: origin,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(actor
          ? {
              Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, tokenMfa ? actor.mfaEnabledAt : null)}`,
            }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  await t.test('administrator RBAC, MFA, origin and bounded range are enforced', async () => {
    const path = '/api/admin/incident-awareness?period=custom&start=2091-01-01&end=2091-01-31';
    assert.equal((await request(path, { actor: null })).status, 401);
    assert.equal((await request(path, { actor: employee })).status, 403);
    assert.equal((await request(path, { actor: noMfa })).status, 401);
    assert.equal((await request(path, { tokenMfa: false })).status, 401);
    assert.equal((await request(path, { origin: 'https://evil.invalid' })).status, 403);
    assert.equal(
      (await request('/api/admin/incident-awareness?period=custom&start=2091-01-01&end=2091-04-30')).status,
      400,
    );
  });
  async function incident(day, type = 'PHISHING', status = 'NEW') {
    const row = await db.incident.create({
      data: {
        reporterId: employee.id,
        createdAt: new Date(`2091-01-${String(day).padStart(2, '0')}T08:00:00Z`),
        title: 'PRIVATE_INCIDENT_TITLE',
        description: 'PRIVATE_INCIDENT_BODY employee@example.invalid',
        aiSummary: 'PRIVATE_AI_SUMMARY',
        indicators: ['PRIVATE_INDICATOR'],
        severity: 'MEDIUM',
        riskScore: 40,
        riskRuleVersion: '1.0',
        type,
        detectionSource: 'EMAIL_ANALYSIS',
        status,
      },
    });
    ids.incidents.push(row.id);
    return row;
  }
  await incident(1);
  await incident(2);
  await incident(3);
  await incident(4, 'PHISHING', 'FALSE_POSITIVE');
  await incident(5, 'MALWARE');
  const training = await db.trainingProgram.create({
    data: {
      title: 'Synthetic phishing course',
      description: 'Practice',
      topic: 'PHISHING',
      learningObjectives: ['Identify suspicious messages'],
      content: {
        version: 1,
        sections: [
          { key: 'first', title: 'First', body: 'Practice' },
          { key: 'second', title: 'Second', body: 'Report' },
        ],
      },
      status: 'PUBLISHED',
      requiresQuiz: false,
      createdById: admin.id,
      reviewedById: admin.id,
      reviewedAt: new Date(),
      publishedAt: new Date(),
    },
  });
  ids.trainings.push(training.id);
  const draftTraining = await db.trainingProgram.create({
    data: {
      title: 'Synthetic draft course',
      description: 'Practice',
      topic: 'PHISHING',
      learningObjectives: ['Identify suspicious messages'],
      content: {
        version: 1,
        sections: [
          { key: 'first', title: 'First', body: 'Practice' },
          { key: 'second', title: 'Second', body: 'Report' },
        ],
      },
      createdById: admin.id,
    },
  });
  ids.trainings.push(draftTraining.id);
  const range = '?period=custom&start=2091-01-01&end=2091-01-31';
  await t.test('privacy-safe category counts and only related published training', async () => {
    const result = await request(`/api/admin/incident-awareness${range}`);
    assert.equal(result.status, 200);
    assert.match(result.cache, /private.*no-store/);
    assert.deepEqual(
      result.data.patterns.map((item) => [item.incidentCategory, item.incidentCount]),
      [['PHISHING', 3]],
    );
    assert.ok(
      result.data.patterns[0].relatedTraining.some((item) => item.id === training.id && item.topic === 'PHISHING'),
    );
    assert.ok(result.data.patterns[0].relatedTraining.every((item) => item.id !== draftTraining.id));
    assert.doesNotMatch(
      JSON.stringify(result.data),
      /PRIVATE_|example.invalid|reporterId|assigneeId|indicators|aiSummary/,
    );
  });
  const acknowledgement = await db.disclaimerAcknowledgement.create({
    data: { userId: admin.id, context: 'COMMUNITY_POST', version: DISCLAIMER_DEFINITION.version },
  });
  ids.acknowledgements.push(acknowledgement.id);
  const body = {
    incidentCategory: 'PHISHING',
    period: 'custom',
    start: '2091-01-01',
    end: '2091-01-31',
    title: 'Check unusual messages',
    body: 'Verify unexpected requests using approved channels and report suspicious messages.',
    trainingId: training.id,
    acknowledgementId: acknowledgement.id,
    reviewed: true,
  };
  await t.test('explicit review, disclaimer, plain text, relevance and current pattern are required', async () => {
    const path = '/api/admin/incident-awareness/warnings';
    assert.equal((await request(path, { method: 'POST', actor: employee, body })).status, 403);
    assert.equal((await request(path, { method: 'POST', actor: noMfa, body })).status, 401);
    assert.equal((await request(path, { method: 'POST', body: { ...body, reviewed: false } })).status, 400);
    assert.equal((await request(path, { method: 'POST', body: { ...body, status: 'APPROVED' } })).status, 400);
    assert.equal((await request(path, { method: 'POST', body: { ...body, trainingId: 'invalid' } })).status, 400);
    assert.equal(
      (await request(path, { method: 'POST', body: { ...body, acknowledgementId: randomUUID() } })).status,
      403,
    );
    assert.equal(
      (await request(path, { method: 'POST', body: { ...body, trainingId: draftTraining.id } })).status,
      409,
    );
    assert.equal((await request(path, { method: 'POST', body: { ...body, incidentCategory: 'MALWARE' } })).status, 409);
    for (const unsafe of [
      'Reach employee@example.invalid for details.',
      '<script>alert(1)</script>',
      'Review https://internal.invalid/case',
      'PRIVATE_INCIDENT_BODY 10.1.2.3',
    ])
      assert.equal((await request(path, { method: 'POST', body: { ...body, body: unsafe } })).status, 400);
    assert.equal(await db.communityPost.count({ where: { authorId: admin.id } }), 0);
  });
  let postId;
  await t.test('pending warning is idempotent, audited and hidden from employee feed', async () => {
    const [first, again] = await Promise.all([
      request('/api/admin/incident-awareness/warnings', { method: 'POST', body }),
      request('/api/admin/incident-awareness/warnings', { method: 'POST', body }),
    ]);
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(again.status, 200, JSON.stringify(again.data));
    assert.equal(first.data.post.status, 'PENDING_REVIEW');
    assert.equal(first.data.post.trainingId, training.id);
    assert.deepEqual([first.data.alreadyPrepared, again.data.alreadyPrepared].sort(), [false, true]);
    postId = first.data.post.id;
    ids.posts.push(postId);
    assert.equal(again.data.post.id, postId);
    assert.equal(await db.communityPost.count({ where: { id: postId } }), 1);
    assert.equal(await db.trainingAssignment.count({ where: { trainingId: training.id } }), 0);
    assert.equal(
      (await request('/api/community', { actor: employee })).data.items.some((post) => post.id === postId),
      false,
    );
    const audit = await db.auditLog.findMany({
      where: { resourceId: postId, action: 'INCIDENT_AWARENESS_WARNING_PREPARED' },
    });
    assert.equal(audit.length, 1);
    assert.deepEqual(audit[0].metadata, {
      incidentCategory: 'PHISHING',
      trainingId: training.id,
      periodStart: '2091-01-01',
      periodEnd: '2091-01-31',
    });
    assert.doesNotMatch(JSON.stringify(audit), /PRIVATE_INCIDENT|employee@example.invalid/);
  });
  await t.test('existing moderation and training assignment workflows remain authoritative', async () => {
    const detail = await request(`/api/admin/community/${postId}`);
    assert.equal(detail.data.post.relatedTraining.id, training.id);
    const decision = { reason: 'Reviewed general guidance.', expectedUpdatedAt: detail.data.post.updatedAt };
    assert.equal(
      (await request(`/api/admin/community/${postId}/approve`, { method: 'POST', body: decision })).status,
      403,
    );
    assert.equal(
      (await request(`/api/admin/community/${postId}/approve`, { actor: reviewer, method: 'POST', body: decision }))
        .status,
      200,
    );
    assert.equal(
      (await request('/api/community', { actor: employee })).data.items.some((post) => post.id === postId),
      true,
    );
    const assigned = await request(`/api/admin/training/${training.id}/assignments`, {
      method: 'POST',
      body: { employeeId: employee.id },
    });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.data.alreadyAssigned, false);
    ids.assignments.push(assigned.data.assignment.id);
    const duplicate = await request(`/api/admin/training/${training.id}/assignments`, {
      method: 'POST',
      body: { employeeId: employee.id },
    });
    assert.equal(duplicate.data.alreadyAssigned, true);
    assert.equal(await db.trainingAssignment.count({ where: { trainingId: training.id } }), 1);
  });
});
