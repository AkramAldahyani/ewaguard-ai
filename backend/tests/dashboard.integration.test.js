import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { createDashboardService } from '../src/dashboard/dashboard-service.js';

test('Phase 13A1 empty dashboard uses zero counts and bounded previews', async () => {
  const model = { count: async () => 0, findMany: async () => [] };
  const db = Object.fromEntries(['user', 'incident', 'trainingProgram', 'trainingAssignment', 'trainingProgress',
    'monthlyQuiz', 'monthlyQuizAssignment', 'certificate', 'communityPost', 'notification'].map((key) => [key, model]));
  const result = await createDashboardService(db).overview({ id: randomUUID(), role: 'IT_SECURITY_ADMIN' });
  assert.deepEqual(result.metrics, { employees: { active: 0 }, incidents: { total: 0, open: 0, highOpen: 0,
    criticalOpen: 0, awaitingAssignment: 0 }, awareness: { publishedPrograms: 0, assignedEmployees: 0,
    activeAssignments: 0, completedAssignments: 0, inProgressAssignments: 0, publishedMonthlyQuizzes: 0,
    monthlyParticipations: 0, monthlySubmitted: 0, certificatesIssued: 0 }, community: { pendingPosts: 0 } });
  assert.deepEqual(result.recentIncidents, []); assert.deepEqual(result.pendingPosts, []);
  assert.deepEqual(result.notifications, { unreadCount: 0, items: [] });
  assert.ok(Number.isFinite(Date.parse(result.generatedAt)));
});

test('Phase 13A1 administrator dashboard uses real scoped PostgreSQL data', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(), ids = { users: [], incidents: [], posts: [], programs: [], quizzes: [], monthly: [] };
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-dashboard-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    try { await db.$transaction(async (tx) => {
      // The synthetic submitted result is removed only after suspending its history guard.
      for (const [table, trigger] of [['quiz_answers', 'answer_history'], ['quiz_attempts', 'submitted_history'], ['quiz_options', 'option_history'],
        ['quiz_questions', 'question_history']]) await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
      await tx.notification.deleteMany({ where: { incidentId: { in: ids.incidents } } });
      await tx.quizAnswer.deleteMany({ where: { attempt: { quizId: { in: ids.quizzes } } } });
      await tx.quizAttempt.deleteMany({ where: { quizId: { in: ids.quizzes } } });
      await tx.monthlyQuizAssignment.deleteMany({ where: { monthlyQuizId: { in: ids.monthly } } });
      await tx.monthlyQuiz.deleteMany({ where: { id: { in: ids.monthly } } });
      await tx.quizOption.deleteMany({ where: { question: { quizId: { in: ids.quizzes } } } });
      await tx.quizQuestion.deleteMany({ where: { quizId: { in: ids.quizzes } } });
      await tx.quiz.deleteMany({ where: { id: { in: ids.quizzes } } });
      await tx.certificate.deleteMany({ where: { progress: { assignment: { trainingId: { in: ids.programs } } } } });
      await tx.trainingProgress.deleteMany({ where: { assignment: { trainingId: { in: ids.programs } } } });
      await tx.trainingAssignment.deleteMany({ where: { trainingId: { in: ids.programs } } });
      await tx.communityPost.deleteMany({ where: { id: { in: ids.posts } } });
      await tx.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: ids.users } } });
      await tx.trainingProgram.deleteMany({ where: { id: { in: ids.programs } } });
      await tx.incident.deleteMany({ where: { id: { in: ids.incidents } } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: ids.users } } });
      await tx.user.deleteMany({ where: { id: { in: ids.users } } });
      for (const [table, trigger] of [['quiz_answers', 'answer_history'], ['quiz_attempts', 'submitted_history'], ['quiz_options', 'option_history'],
        ['quiz_questions', 'question_history']]) await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
    }, { timeout: 20000 }); } finally { await db.$disconnect(); }
  });
  async function user(role = 'EMPLOYEE', extra = {}) {
    const row = await db.user.create({ data: { firstName: 'Synthetic', lastName: role === 'EMPLOYEE' ? 'Employee' : 'Admin',
      email: `${randomUUID()}@example.invalid`, status: 'ACTIVE', passwordHash: 'synthetic',
      role: { connect: { name: role } }, ...(role === 'IT_SECURITY_ADMIN' ?
        { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}), ...extra } });
    ids.users.push(row.id); return row;
  }
  const admin = await user('IT_SECURITY_ADMIN');
  const noMfa = await user('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
  async function request(path = '/api/admin/dashboard', { actor = admin, origin = config.frontendUrl, mfa = true } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: { Origin: origin,
      ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, mfa ? actor.mfaEnabledAt : null)}` } : {}) } });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  await t.test('authentication, RBAC, MFA, origin and query validation', async () => {
    assert.equal((await request(undefined, { actor: null })).status, 401);
    assert.equal((await request(undefined, { actor: noMfa })).status, 401);
    assert.equal((await request(undefined, { mfa: false })).status, 401);
    assert.equal((await request(undefined, { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await request('/api/admin/dashboard?employeeId=anything')).status, 400);
  });
  const baseline = (await request()).data;
  const employee = await user(), second = await user(), suspended = await user('EMPLOYEE', { status: 'SUSPENDED' });
  assert.equal((await request(undefined, { actor: employee })).status, 403);

  const incident = async (severity, status, assigneeId = null) => {
    const row = await db.incident.create({ data: { reporterId: employee.id, assigneeId,
      title: 'PRIVATE_INCIDENT_TITLE', description: 'PRIVATE_INCIDENT_BODY', severity,
      riskScore: severity === 'CRITICAL' ? 90 : severity === 'HIGH' ? 70 : 20,
      riskRuleVersion: '1.0', type: 'SUSPICIOUS_ACTIVITY', detectionSource: 'MANUAL_REPORT', status,
      aiSummary: 'PRIVATE_AI_TEXT', indicators: { secret: 'PRIVATE_INDICATOR' } } });
    ids.incidents.push(row.id); return row;
  };
  const high = await incident('HIGH', 'NEW');
  const critical = await incident('CRITICAL', 'UNDER_INVESTIGATION', admin.id);
  await incident('LOW', 'RESOLVED'); await incident('HIGH', 'CLOSED');
  const expiry = new Date(Date.now() + 60_000);
  await db.notification.create({ data: { recipientId: admin.id, incidentId: critical.id, type: 'INCIDENT_ALERT',
    audience: 'IT_SECURITY_ADMIN', kind: 'INCIDENT_CREATED', severity: 'CRITICAL',
    title: 'PRIVATE_NOTIFICATION_TITLE', message: 'PRIVATE_NOTIFICATION_BODY', expiresAt: expiry } });
  await db.notification.create({ data: { recipientId: noMfa.id, incidentId: high.id, type: 'INCIDENT_ALERT',
    audience: 'IT_SECURITY_ADMIN', kind: 'INCIDENT_CREATED', severity: 'HIGH',
    title: 'OTHER_ADMIN_PRIVATE', message: 'OTHER_ADMIN_PRIVATE', expiresAt: expiry } });
  const ack = await db.disclaimerAcknowledgement.create({ data: { userId: employee.id, context: 'COMMUNITY_POST', version: '1.0' } });
  for (const status of ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REMOVED']) {
    const row = await db.communityPost.create({ data: { authorId: employee.id, acknowledgementId: ack.id,
      title: `Synthetic ${status}`, body: 'PRIVATE_POST_BODY', category: 'SECURITY_TIP', status,
      submittedAt: new Date(), ...(status === 'APPROVED' || status === 'REMOVED' ? { approvedAt: new Date() } : {}),
      ...(status === 'REMOVED' ? { removedAt: new Date() } : {}) } }); ids.posts.push(row.id);
  }
  const program = async (status) => { const row = await db.trainingProgram.create({ data: {
    title: `Synthetic ${status} ${randomUUID()}`, description: 'Synthetic training', topic: 'PHISHING',
    learningObjectives: ['Identify suspicious requests'], content: { version: 1, sections: [
      { key: 'intro', title: 'Introduction', body: 'Synthetic text' }, { key: 'practice', title: 'Practice', body: 'Synthetic text' }] },
    status, requiresQuiz: false, createdById: admin.id,
    ...(status === 'PUBLISHED' ? { reviewedById: admin.id, reviewedAt: new Date(), publishedAt: new Date() } : {}) } });
    ids.programs.push(row.id); return row; };
  const published = await program('PUBLISHED'); await program('DRAFT');
  const firstAssignment = await db.trainingAssignment.create({ data: { trainingId: published.id, employeeId: employee.id, assignedById: admin.id } });
  const secondAssignment = await db.trainingAssignment.create({ data: { trainingId: published.id, employeeId: second.id, assignedById: admin.id } });
  await db.trainingAssignment.create({ data: { trainingId: published.id, employeeId: suspended.id, assignedById: admin.id } });
  const now = new Date();
  const completed = await db.trainingProgress.create({ data: { assignmentId: firstAssignment.id, status: 'COMPLETED',
    progressPercent: 100, completedSectionKeys: ['intro', 'practice'], startedAt: now, materialCompletedAt: now, completedAt: now } });
  await db.trainingProgress.create({ data: { assignmentId: secondAssignment.id, status: 'IN_PROGRESS',
    progressPercent: 50, completedSectionKeys: ['intro'], startedAt: now } });
  await db.certificate.create({ data: { progressId: completed.id, completedAt: now,
    employeeName: 'Synthetic Employee', trainingTitle: published.title } });
  const quiz = await db.quiz.create({ data: { kind: 'MONTHLY', title: 'Synthetic dashboard quiz',
    createdById: admin.id, passingPercent: 75, maxAttempts: 2 } }); ids.quizzes.push(quiz.id);
  const question = await db.quizQuestion.create({ data: { quizId: quiz.id, text: 'Synthetic question',
    type: 'TRUE_FALSE', topic: 'PHISHING', explanation: 'Synthetic explanation', points: 1, position: 0,
    options: { create: [{ text: 'True', position: 0, isCorrect: true }, { text: 'False', position: 1, isCorrect: false }] } }, include: { options: true } });
  assert.ok(question.id);
  await db.quiz.update({ where: { id: quiz.id }, data: { status: 'PUBLISHED',
    approvedById: admin.id, approvedAt: now, publishedAt: now } });
  const period = new Date(Date.UTC(2090, 0, 1));
  const monthly = await db.monthlyQuiz.create({ data: { quizId: quiz.id, period,
    opensAt: period, closesAt: new Date(Date.UTC(2090, 1, 1)) } }); ids.monthly.push(monthly.id);
  const monthlyFirst = await db.monthlyQuizAssignment.create({ data: { monthlyQuizId: monthly.id,
    employeeId: employee.id, assignedById: admin.id } });
  const monthlySecond = await db.monthlyQuizAssignment.create({ data: { monthlyQuizId: monthly.id,
    employeeId: second.id, assignedById: admin.id } });
  const attempt = await db.quizAttempt.create({ data: { quizId: quiz.id, employeeId: employee.id, monthlyAssignmentId: monthlyFirst.id,
    attemptNumber: 1, passingPercent: 75 } });
  await db.quizAnswer.create({ data: { attemptId: attempt.id, questionId: question.id,
    selectedOptionId: question.options.find((option) => option.isCorrect).id, awardedPoints: 1 } });
  await db.quizAttempt.update({ where: { id: attempt.id }, data: { status: 'SUBMITTED', submittedAt: now,
    earnedPoints: 1, possiblePoints: 1, scorePercent: 100, passed: true } });
  await db.quizAttempt.create({ data: { quizId: quiz.id, employeeId: second.id,
    monthlyAssignmentId: monthlySecond.id, attemptNumber: 1, passingPercent: 75 } });

  await t.test('global counts and previews reflect only defined operational states', async () => {
    const response = await request(); assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.match(response.cache, /no-store/);
    const before = baseline.metrics, after = response.data.metrics;
    assert.equal(after.employees.active - before.employees.active, 2);
    assert.equal(after.incidents.total - before.incidents.total, 4);
    assert.equal(after.incidents.open - before.incidents.open, 2);
    assert.equal(after.incidents.highOpen - before.incidents.highOpen, 1);
    assert.equal(after.incidents.criticalOpen - before.incidents.criticalOpen, 1);
    assert.equal(after.incidents.awaitingAssignment - before.incidents.awaitingAssignment, 1);
    assert.equal(after.community.pendingPosts - before.community.pendingPosts, 1);
    assert.equal(after.awareness.publishedPrograms - before.awareness.publishedPrograms, 1);
    assert.equal(after.awareness.assignedEmployees - before.awareness.assignedEmployees, 2);
    assert.equal(after.awareness.activeAssignments - before.awareness.activeAssignments, 2);
    assert.equal(after.awareness.completedAssignments - before.awareness.completedAssignments, 1);
    assert.equal(after.awareness.inProgressAssignments - before.awareness.inProgressAssignments, 1);
    assert.equal(after.awareness.publishedMonthlyQuizzes - before.awareness.publishedMonthlyQuizzes, 1);
    assert.equal(after.awareness.monthlyParticipations - before.awareness.monthlyParticipations, 2);
    assert.equal(after.awareness.monthlySubmitted - before.awareness.monthlySubmitted, 1);
    assert.equal(after.awareness.certificatesIssued - before.awareness.certificatesIssued, 1);
    assert.ok(response.data.recentIncidents.length <= 6);
    assert.ok(response.data.recentIncidents.some((row) => row.id === high.id && row.assigneeName === null && row.urgent));
    assert.ok(response.data.recentIncidents.some((row) => row.id === critical.id && row.assigneeName === 'Synthetic Admin' && row.urgent));
    assert.ok(response.data.pendingPosts.length <= 5);
    assert.ok(response.data.pendingPosts.some((row) => row.title === 'Synthetic PENDING_REVIEW'));
    assert.equal(response.data.pendingPosts.filter((row) => ids.posts.includes(row.id)).length, 1);
    assert.equal(response.data.notifications.unreadCount, 1);
    assert.equal(response.data.notifications.items[0].incidentId, critical.id);
    assert.equal(response.data.notifications.items[0].urgent, true);
    assert.doesNotMatch(JSON.stringify(response.data), /PRIVATE_INCIDENT_BODY|PRIVATE_INCIDENT_TITLE|PRIVATE_AI_TEXT|PRIVATE_INDICATOR|PRIVATE_POST_BODY|PRIVATE_NOTIFICATION_BODY|OTHER_ADMIN_PRIVATE|passwordHash|mfaSecret/i);
  });
});
