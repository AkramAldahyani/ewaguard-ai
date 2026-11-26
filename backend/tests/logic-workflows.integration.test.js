import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { createInviteService } from '../src/users/invite-service.js';
import { createChatService } from '../src/ai/chat-service.js';
import { PRIVACY_NOTICE, modelPricing } from '../src/ai/chat-policy.js';
import { cleanupTestIncidents } from './incident-cleanup.js';

// End-to-end business logic over real HTTP and PostgreSQL: the incident, awareness and community demonstration goals,
// the complete authorization matrix, and concurrency rules that cannot be checked with mocks.
const ORIGIN = 'http://127.0.0.1:5173';
const PASSWORD = 'violet-Harbor-93-kettle-moss';
const historyTriggers = [
  ['quiz_answers', 'answer_history'],
  ['quiz_attempts', 'submitted_history'],
  ['quiz_options', 'option_history'],
  ['quiz_questions', 'question_history'],
];

test('complete application workflows', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient();
  const users = [];
  const emails = [];
  const programs = [];
  const quizIds = [];
  const config = parseConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-workflow-secret-at-least-32-characters',
    FRONTEND_URL: ORIGIN,
  });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    try {
      const registered = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
      const ids = [...users, ...registered.map((row) => row.id)];
      const incidents = await db.incident.findMany({ where: { reporterId: { in: ids } }, select: { id: true } });
      await db.incidentComment.deleteMany({ where: { incident: { reporterId: { in: ids } } } });
      await cleanupTestIncidents(db, ids);
      await db.notification.deleteMany({ where: { recipientId: { in: ids } } });
      await db.aiUsage.deleteMany({ where: { userId: { in: ids } } });
      await db.chatSession.deleteMany({ where: { ownerId: { in: ids } } });
      await db.emailAnalysis.deleteMany({ where: { userId: { in: ids } } });
      await db.postModerationAction.deleteMany({ where: { moderatorId: { in: ids } } });
      await db.communityPost.deleteMany({ where: { authorId: { in: ids } } });
      await db.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: ids } } });
      await db.registrationInvite.deleteMany({ where: { createdById: { in: ids } } });
      await db.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: ids } },
            { resourceId: { in: [...ids, ...programs, ...incidents.map((row) => row.id)] } },
          ],
        },
      });
      // Submitted history is immutable; only rows created by this test are removed, inside one transaction.
      await db.$transaction(
        async (tx) => {
          for (const [table, trigger] of historyTriggers)
            await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
          await tx.certificate.deleteMany({ where: { progress: { assignment: { trainingId: { in: programs } } } } });
          await tx.trainingProgress.deleteMany({ where: { assignment: { trainingId: { in: programs } } } });
          await tx.quizAnswer.deleteMany({ where: { attempt: { quizId: { in: quizIds } } } });
          await tx.quizAttempt.deleteMany({ where: { quizId: { in: quizIds } } });
          await tx.quizOption.deleteMany({ where: { question: { quizId: { in: quizIds } } } });
          await tx.quizQuestion.deleteMany({ where: { quizId: { in: quizIds } } });
          await tx.trainingQuiz.deleteMany({ where: { quizId: { in: quizIds } } });
          await tx.quiz.deleteMany({ where: { id: { in: quizIds } } });
          await tx.trainingAssignment.deleteMany({ where: { trainingId: { in: programs } } });
          await tx.trainingProgram.deleteMany({ where: { id: { in: programs } } });
          for (const [table, trigger] of historyTriggers)
            await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
        },
        { timeout: 20000 },
      );
      await db.user.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await db.$disconnect();
    }
  });

  const department = await db.department.findFirstOrThrow({ where: { active: true } });
  async function person(role = 'EMPLOYEE', extra = {}) {
    const row = await db.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        employeeIdentifier: `UM-${randomUUID()}`,
        firstName: 'Synthetic',
        lastName: 'Workflow',
        status: 'ACTIVE',
        passwordHash: 'synthetic-not-a-login-hash',
        department: { connect: { id: department.id } },
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
  const employee = await person();
  const other = await person();
  const admin = await person('IT_SECURITY_ADMIN');
  const noMfa = await person('IT_SECURITY_ADMIN', {
    mfaEnabledAt: null,
    mfaSecretEncrypted: null,
    mfaLastCounter: null,
  });
  const suspended = await person('EMPLOYEE', { status: 'SUSPENDED' });
  async function request(path, { actor = employee, body, method, origin = ORIGIN, token } = {}) {
    const value = token ?? (actor && issueAccessToken(actor.id, config, actor.mfaEnabledAt));
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(value ? { Cookie: `${authCookie(config).name}=${value}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json().catch(() => null) };
  }
  async function ok(path, options, status = 200) {
    const result = await request(path, options);
    assert.equal(result.status, status, `${path}: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  const id = randomUUID();
  const adminRoutes = [
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/users/summary'],
    ['GET', '/api/admin/users/options'],
    ['GET', `/api/admin/users/${id}`],
    ['GET', `/api/admin/users/${id}/profile`],
    ['POST', '/api/admin/users'],
    ...['update', 'status', 'role', 'setup', 'delete'].map((action) => ['POST', `/api/admin/users/${id}/${action}`]),
    ['GET', '/api/admin/invites'],
    ['POST', '/api/admin/invites'],
    ['POST', `/api/admin/invites/${id}/revoke`],
    ['GET', '/api/admin/incidents'],
    ['GET', '/api/admin/incidents/summary'],
    ['GET', '/api/admin/incidents/assignees'],
    ['GET', `/api/admin/incidents/${id}`],
    ['GET', `/api/admin/incidents/${id}/history`],
    ['GET', `/api/admin/incidents/${id}/notes`],
    ...['assignment', 'status', 'notes'].map((action) => ['POST', `/api/admin/incidents/${id}/${action}`]),
    ['GET', '/api/admin/training'],
    ['GET', '/api/admin/training/employees'],
    ['GET', `/api/admin/training/${id}`],
    ['GET', `/api/admin/training/${id}/quiz`],
    ['GET', `/api/admin/training/${id}/quiz/attempts`],
    ['GET', `/api/admin/training/${id}/assignments`],
    ['POST', '/api/admin/training'],
    ...['edit', 'review', 'publish', 'archive', 'quiz', 'quiz/edit', 'quiz/approve', 'quiz/publish'].map((action) => [
      'POST',
      `/api/admin/training/${id}/${action}`,
    ]),
    ['POST', `/api/admin/training/${id}/assignments`],
    ['POST', `/api/admin/training/${id}/assignments/bulk`],
    ['GET', '/api/admin/monthly-quizzes'],
    ['GET', `/api/admin/monthly-quizzes/${id}`],
    ['GET', `/api/admin/monthly-quizzes/${id}/report`],
    ['POST', '/api/admin/monthly-quizzes'],
    ...['edit', 'approve', 'publish', 'archive'].map((action) => [
      'POST',
      `/api/admin/monthly-quizzes/${id}/${action}`,
    ]),
    ['GET', '/api/admin/certificates'],
    ['GET', `/api/admin/certificates/${id}`],
    ['GET', `/api/admin/certificates/${id}/pdf`],
    ['GET', `/api/admin/certificates/verify/${id}`],
    ['GET', '/api/admin/community'],
    ['GET', `/api/admin/community/${id}`],
    ['POST', `/api/admin/community/${id}/approve`],
    ['GET', '/api/admin/community/reports'],
    ['POST', `/api/admin/community/reports/${id}/resolve`],
    ['GET', '/api/admin/community/comments'],
    ['POST', `/api/admin/community/comments/${id}/remove`],
    ['GET', '/api/admin/dashboard'],
    ['GET', '/api/admin/audit'],
    ['GET', '/api/admin/analytics/security'],
    ['GET', '/api/admin/analytics/security/analyses'],
    ['GET', '/api/admin/analytics/awareness'],
    ['GET', '/api/admin/workspace'],
  ];
  const employeeRoutes = [
    ['GET', '/api/incidents'],
    ['GET', '/api/incidents/summary'],
    ['GET', `/api/incidents/${id}`],
    ['GET', `/api/incidents/${id}/history`],
    ['GET', `/api/incidents/${id}/notes`],
    ['GET', '/api/training'],
    ['GET', `/api/training/${id}`],
    ['POST', `/api/training/${id}/start`],
    ['POST', `/api/training/${id}/sections`],
    ['GET', `/api/training/${id}/quiz`],
    ['POST', `/api/training/${id}/quiz/attempts`],
    ['GET', `/api/training/${id}/quiz/attempts/${id}`],
    ['POST', `/api/training/${id}/quiz/attempts/${id}/submit`],
    ['GET', '/api/monthly-quizzes'],
    ['GET', '/api/monthly-quizzes/history'],
    ['GET', `/api/monthly-quizzes/${id}`],
    ['POST', `/api/monthly-quizzes/${id}/attempts`],
    ['POST', `/api/monthly-quizzes/${id}/attempts/${id}/submit`],
    ['GET', '/api/certificates'],
    ['GET', `/api/certificates/${id}`],
    ['GET', `/api/certificates/${id}/pdf`],
    ['GET', '/api/community/mine'],
    ['GET', '/api/community/saved'],
    ['POST', '/api/community'],
    ['POST', '/api/community/reports'],
    ['DELETE', `/api/community/${id}`],
    ['PUT', `/api/community/${id}/like`],
    ['POST', '/api/analysis/email/text'],
    ['POST', '/api/analysis/email/eml'],
    ['POST', '/api/analysis/url'],
    ['POST', '/api/analysis/file'],
    ['POST', '/api/analysis/file/hash'],
    ['POST', `/api/analysis-escalations/EMAIL/${id}/retry`],
    ['POST', `/api/analysis-escalations/EMAIL/${id}/exposure`],
    ['GET', '/api/chat/privacy'],
    ['GET', '/api/chat/conversations'],
    ['POST', '/api/chat/conversations'],
    ['GET', `/api/chat/conversations/${id}`],
    ['POST', `/api/chat/conversations/${id}/messages`],
    ['GET', `/api/tool-approvals/conversations/${id}/requests/${id}`],
    ['POST', `/api/tool-approvals/conversations/${id}/requests/${id}/decision`],
    ['GET', '/api/knowledge/privacy'],
    ['POST', '/api/knowledge/search'],
    ['POST', '/api/disclaimers/acknowledge'],
    ['GET', '/api/employee/workspace'],
  ];
  const call = ([method, path], options) =>
    request(path, { method, ...(method === 'GET' ? {} : { body: {} }), ...options });

  await t.test('authorization matrix: every protected route rejects the wrong identity', async () => {
    const expired = issueAccessToken(employee.id, { ...config, accessTokenTtlSeconds: -10 });
    const forged = issueAccessToken(admin.id, { ...config, jwtSecret: 'x'.repeat(40) }, admin.mfaEnabledAt);
    for (const route of [...adminRoutes, ...employeeRoutes, ['GET', '/api/notifications'], ['GET', '/api/auth/me']]) {
      const name = route.join(' ');
      assert.equal((await call(route, { actor: null })).status, 401, `anonymous ${name}`);
      assert.equal((await call(route, { actor: noMfa })).status, 401, `administrator without MFA ${name}`);
      assert.equal((await call(route, { actor: suspended })).status, 401, `suspended ${name}`);
      assert.equal((await call(route, { token: expired })).status, 401, `expired ${name}`);
      assert.equal((await call(route, { token: forged })).status, 401, `forged ${name}`);
    }
    for (const route of adminRoutes) {
      const denied = await call(route, { actor: employee });
      assert.equal(denied.status, 403, `employee ${route.join(' ')}`);
      assert.equal(denied.data.error.code, 'FORBIDDEN');
    }
    for (const route of employeeRoutes)
      assert.equal((await call(route, { actor: admin })).status, 403, `administrator ${route.join(' ')}`);
  });

  await t.test('a valid session from an untrusted origin cannot write', async () => {
    for (const [route, actor] of [
      ...adminRoutes.map((route) => [route, admin]),
      ...employeeRoutes.map((route) => [route, employee]),
    ]) {
      if (route[0] === 'GET') continue;
      const result = await call(route, { actor, origin: 'https://evil.example' });
      assert.equal(result.status, 403, route.join(' '));
      assert.equal(result.data.error.code, 'UNTRUSTED_ORIGIN', route.join(' '));
    }
  });

  await t.test('incident goal: phishing email to HIGH, exposure to CRITICAL, investigation to closure', async () => {
    await ok('/api/disclaimers/acknowledge', { body: { context: 'EMAIL_ANALYSIS' } }, 201);
    const analyzed = await ok(
      '/api/analysis/email/text',
      {
        body: {
          headers:
            'From: "Microsoft IT support" <alert@micros0ft-helpdesk.example.net>\r\nReply-To: x@evil.example.org',
          body: 'Urgent: confirm your account\npassword within 2 hours. <a href="http://evil.example.org/x">www.microsoft.com</a>',
        },
      },
      201,
    );
    assert.equal(analyzed.result.risk.riskLevel, 'HIGH');
    assert.equal(analyzed.incident.created, true);
    assert.equal(analyzed.incident.severity, 'HIGH');
    assert.match(analyzed.incident.reference, /^INC-\d{4}-\d{6}$/);
    const exposurePath = `/api/analysis-escalations/EMAIL/${analyzed.analysisId}/exposure`;
    const confirmation = { exposure: 'CREDENTIALS_SUBMITTED', confirmed: true };
    assert.equal((await request(exposurePath, { actor: other, body: confirmation })).status, 404);
    for (const body of [{ ...confirmation, severity: 'LOW' }, { ...confirmation, confirmed: 'true' }, {}])
      assert.equal((await request(exposurePath, { body })).status, 400);
    const reports = await Promise.all([1, 2, 3].map(() => ok(exposurePath, { body: confirmation })));
    assert.ok(reports.every((report) => report.incident.severity === 'CRITICAL'));
    assert.equal(reports.filter((report) => report.incident.exposureRecorded).length, 1, 'recorded once');

    const queue = await ok('/api/admin/incidents?view=open&sort=priority&pageSize=100', { actor: admin });
    const listed = queue.items.find((row) => row.reference === analyzed.incident.reference);
    assert.equal(listed.severity, 'CRITICAL');
    const path = `/api/admin/incidents/${listed.id}`;
    const alerts = await ok('/api/notifications', { actor: admin });
    assert.deepEqual(
      alerts.items
        .filter((item) => item.incidentId === listed.id)
        .map((item) => item.kind)
        .sort(),
      ['EXPOSURE_REPORTED', 'INCIDENT_CREATED'],
    );
    assert.ok(!(await ok('/api/notifications')).items.some((item) => item.kind === 'EXPOSURE_REPORTED'));

    const current = async () => (await ok(path, { actor: admin })).incident;
    const move = async (status, expectedStatus = 200) =>
      ok(
        `${path}/status`,
        { actor: admin, body: { status, expectedUpdatedAt: (await current()).updatedAt } },
        expectedStatus,
      );
    await move('CLOSED', 409);
    await move('CONTAINED', 409);
    const stale = (await current()).updatedAt;
    await move('UNDER_INVESTIGATION');
    assert.equal((await current()).assigneeId, admin.id, 'the investigator becomes the owner');
    assert.equal(
      (await request(`${path}/status`, { actor: admin, body: { status: 'CONTAINED', expectedUpdatedAt: stale } }))
        .status,
      409,
      'a stale edit is refused',
    );
    await move('CONTAINED');
    await move('RESOLVED');
    assert.ok((await current()).resolvedAt);
    await move('CLOSED');
    assert.ok((await current()).closedAt && (await current()).resolvedAt);
    await move('UNDER_INVESTIGATION');
    assert.deepEqual([(await current()).resolvedAt, (await current()).closedAt], [null, null]);

    const own = await ok(`/api/incidents/${listed.id}`);
    assert.equal(own.incident.status, 'UNDER_INVESTIGATION');
    for (const key of ['assigneeId', 'assignee', 'reporterId', 'reporter', 'department', 'description'])
      assert.ok(!Object.hasOwn(own.incident, key), `employee view exposes ${key}`);
    assert.deepEqual(Object.keys(own), ['incident'], 'no transitions or notes controls');
    for (const suffix of ['', '/history', '/notes'])
      assert.equal((await request(`/api/incidents/${listed.id}${suffix}`, { actor: other })).status, 404);
    const history = await ok(`${path}/history?pageSize=50`, { actor: admin });
    assert.deepEqual(
      history.items
        .filter((event) => event.type === 'STATUS_CHANGED')
        .map((event) => event.details.toStatus)
        .sort(),
      ['CLOSED', 'CONTAINED', 'RESOLVED', 'UNDER_INVESTIGATION', 'UNDER_INVESTIGATION'],
    );
    const audited = await db.auditLog.findMany({ where: { resourceId: listed.id }, select: { action: true } });
    for (const action of ['INCIDENT_CREATED', 'INCIDENT_EXPOSURE_REPORTED', 'INCIDENT_STATUS_CHANGED'])
      assert.ok(
        audited.some((row) => row.action === action),
        action,
      );
    // No submitted text may reach storage.
    const stored = await db.emailAnalysis.findUnique({ where: { id: analyzed.analysisId } });
    assert.doesNotMatch(JSON.stringify(stored.evidence), /micros0ft|evil\.example|confirm your/);
  });

  await t.test('LOW analyses never create an incident', async () => {
    const result = await ok('/api/analysis/email/text', { body: { body: 'Lunch is at noon.' } }, 201);
    assert.equal(result.result.risk.riskLevel, 'LOW');
    assert.equal(result.incident.state, 'NOT_REQUIRED');
    assert.equal(await db.incident.count({ where: { sourceKey: `EMAIL:${result.analysisId}` } }), 0);
  });

  await t.test('awareness goal: course, quiz, completion and certificate', async () => {
    const root = '/api/admin/training';
    const as = { actor: admin };
    const { program } = await ok(root, {
      ...as,
      body: {
        title: 'Synthetic workflow course',
        description: 'Test only.',
        topic: 'PHISHING',
        learningObjectives: ['Recognize test signals.'],
        estimatedMinutes: 6,
        requiresQuiz: true,
        content: {
          version: 1,
          sections: [
            { key: 'intro', title: 'Intro', body: 'Test introduction.' },
            { key: 'actions', title: 'Actions', body: 'Test actions.' },
          ],
        },
      },
    });
    programs.push(program.id);
    const path = `${root}/${program.id}`;
    const { quiz } = await ok(`${path}/quiz`, {
      ...as,
      body: {
        title: 'Synthetic workflow quiz',
        passingPercent: 100,
        maxAttempts: 3,
        questions: [
          {
            text: 'Report suspicious email?',
            type: 'TRUE_FALSE',
            explanation: 'Always report.',
            points: 1,
            options: [
              { text: 'True', isCorrect: true },
              { text: 'False', isCorrect: false },
            ],
          },
        ],
      },
    });
    quizIds.push(quiz.id);
    const step = async (target, action, status = 200) => {
      const record = target === path ? (await ok(path, as)).program : (await ok(`${path}/quiz`, as)).quiz;
      return ok(`${target}/${action}`, { ...as, body: { expectedUpdatedAt: record.updatedAt } }, status);
    };
    await step(path, 'publish', 409);
    await step(path, 'review');
    await step(path, 'publish', 409);
    await step(`${path}/quiz`, 'approve');
    await step(path, 'publish');
    await ok(`${path}/assignments`, { ...as, body: { employeeId: employee.id } }, 409);
    await step(`${path}/quiz`, 'publish');
    await ok(`${path}/assignments`, { ...as, body: { employeeId: admin.id } }, 400);
    const { assignment } = await ok(`${path}/assignments`, { ...as, body: { employeeId: employee.id } });
    const own = `/api/training/${assignment.id}`;
    assert.equal((await request(own, { actor: other })).status, 404);
    const status = async () => (await ok(own)).assignment.progress.status;
    assert.equal(await status(), 'NOT_STARTED', 'opening a course is not progress');
    const read = (sectionKey) => ({ body: { sectionKey, acknowledged: true } });
    await ok(`${own}/sections`, read('intro'), 409);
    await ok(`${own}/start`, { body: {} });
    await ok(`${own}/sections`, read('actions'), 409);
    await ok(`${own}/quiz/attempts`, { body: {} }, 409);
    await ok(`${own}/sections`, read('intro'));
    await ok(`${own}/sections`, read('actions'));
    assert.equal(await status(), 'IN_PROGRESS', 'reading alone does not complete a quiz course');
    assert.equal((await ok('/api/certificates')).items.length, 0);

    const before = await ok(`${own}/quiz`);
    assert.equal(before.attemptsRemaining, 3);
    assert.doesNotMatch(JSON.stringify(before), /isCorrect|explanation/);
    const question = before.quiz.questions[0];
    const option = (text) => question.options.find((item) => item.text === text).id;
    const answer = (text) => ({ body: { answers: [{ questionId: question.id, selectedOptionId: option(text) }] } });
    const starts = await Promise.all([1, 2, 3].map(() => ok(`${own}/quiz/attempts`, { body: {} })));
    assert.equal(new Set(starts.map((start) => start.attempt.id)).size, 1, 'parallel starts share one attempt');
    const failed = await ok(`${own}/quiz/attempts/${starts[0].attempt.id}/submit`, answer('False'));
    assert.equal(failed.attempt.passed, false);
    assert.equal((await ok(`${own}/quiz`)).attemptsRemaining, 2);
    assert.equal(await status(), 'IN_PROGRESS');
    const second = (await ok(`${own}/quiz/attempts`, { body: {} })).attempt;
    const submit = `${own}/quiz/attempts/${second.id}/submit`;
    const passed = await Promise.all([1, 2].map(() => ok(submit, answer('True'))));
    assert.ok(passed.every((result) => result.attempt.passed && Number(result.attempt.scorePercent) === 100));
    await ok(submit, answer('False'), 409);
    assert.equal(await status(), 'COMPLETED');
    assert.equal((await ok(`${own}/quiz`)).attemptsRemaining, 0, 'nothing is left to attempt after a pass');
    await ok(`${own}/quiz/attempts`, { body: {} }, 409);

    const certificates = (await ok('/api/certificates')).items;
    assert.equal(certificates.length, 1, 'exactly one certificate');
    assert.equal(certificates[0].scorePercent, 100);
    assert.equal((await request(`/api/certificates/${certificates[0].id}`, { actor: other })).status, 404);
    const verified = await ok(`/api/admin/certificates/verify/${certificates[0].certificateNumber}`, as);
    assert.equal(verified.trainingCompletionConfirmed, true);
  });

  await t.test('community goal: pending, hidden, moderated, then visible and audited', async () => {
    const ack = (await ok('/api/disclaimers/acknowledge', { body: { context: 'COMMUNITY_POST' } }, 201)).acknowledgement
      .id;
    const draft = {
      title: 'Synthetic warning',
      body: 'Fake parcel messages are circulating.',
      category: 'SECURITY_WARNING',
      acknowledgementId: ack,
    };
    assert.equal((await request('/api/community', { body: { ...draft, status: 'APPROVED' } })).status, 400);
    assert.equal((await request('/api/community', { body: { ...draft, acknowledgementId: id } })).status, 403);
    const { post } = await ok('/api/community', { body: draft });
    assert.equal(post.status, 'PENDING_REVIEW');
    assert.equal((await ok('/api/community', { body: draft })).alreadySubmitted, true);
    assert.equal((await request(`/api/community/${post.id}`, { actor: other })).status, 404);
    const path = `/api/admin/community/${post.id}`;
    const decision = async () => ({
      actor: admin,
      body: { reason: 'Reviewed.', expectedUpdatedAt: (await ok(path, { actor: admin })).post.updatedAt },
    });
    const same = await decision();
    const results = await Promise.all([request(`${path}/approve`, same), request(`${path}/approve`, same)]);
    assert.deepEqual(
      results.map((result) => result.status).sort(),
      [200, 409],
      'two simultaneous decisions: exactly one wins',
    );
    await ok(`/api/community/${post.id}`, { actor: other });
    await ok(`/api/community/${post.id}/like`, { actor: other, method: 'PUT', body: { active: true } });
    const again = await ok(`/api/community/${post.id}/like`, { actor: other, method: 'PUT', body: { active: true } });
    assert.equal(again.engagement.likeCount, 1, 'liking twice counts once');
    await ok(`${path}/reject`, await decision(), 409);
    await ok(`${path}/remove`, await decision());
    assert.equal((await request(`/api/community/${post.id}`, { actor: other })).status, 404);
    const { post: final } = await ok(path, { actor: admin });
    assert.deepEqual(
      final.history.map((entry) => entry.decision),
      ['APPROVED', 'REMOVED'],
    );
    assert.ok(await db.auditLog.count({ where: { resourceId: post.id, actorId: admin.id } }));
  });

  const invites = createInviteService(db, config);
  const auth = {
    userId: admin.id,
    mfaProof: admin.mfaEnabledAt.toISOString(),
    sessionVersion: 0,
    sessionId: randomUUID(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    authenticatedAt: Math.floor(Date.now() / 1000),
  };
  const newInvite = (maxUses) =>
    invites.create(auth, { label: 'Workflow test', departmentId: department.id, maxUses, expiresInHours: 1 });
  function registration(token) {
    const email = `${randomUUID()}@example.invalid`;
    emails.push(email);
    return { token, firstName: 'Invited', lastName: 'Person', email, password: PASSWORD, confirmPassword: PASSWORD };
  }

  await t.test('invite registration takes locks in the same order as revocation', async () => {
    const { invite, token } = await newInvite(5);
    let pending;
    await db.$transaction(
      async (tx) => {
        // Hold the directory lock exactly as revoke() does, and let a registration reach it.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(194731, 1)`;
        pending = invites.register(registration(token));
        pending.catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 1500));
        // The waiting registration must not already hold the invite row: revoke() would deadlock here.
        await tx.$queryRaw`SELECT id FROM registration_invites WHERE id = ${invite.id}::uuid FOR UPDATE NOWAIT`;
      },
      { timeout: 10000 },
    );
    assert.deepEqual(await pending, { completed: true });
  });

  await t.test('an invite link can never exceed its limit or create a privileged account', async () => {
    const { invite, token } = await newInvite(2);
    const bodies = Array.from({ length: 5 }, () => registration(token));
    const results = await Promise.allSettled(bodies.map((body) => invites.register(body)));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    for (const result of results.filter((item) => item.status === 'rejected'))
      assert.equal(result.reason.code, 'INVITE_INVALID');
    const created = await db.user.findMany({
      where: { email: { in: bodies.map((body) => body.email) } },
      include: { role: true },
    });
    assert.deepEqual([created.length, ...created.map((row) => row.role.name)], [2, 'EMPLOYEE', 'EMPLOYEE']);
    const row = await db.registrationInvite.findUnique({ where: { id: invite.id } });
    assert.equal(row.useCount, 2);
    assert.notEqual(row.tokenHash, token, 'only a digest is stored');
    const revocable = await newInvite(5);
    await invites.revoke(auth, revocable.invite.id, {});
    await assert.rejects(invites.register(registration(revocable.token)), { code: 'INVITE_INVALID' });
    await assert.rejects(invites.register({ ...registration(token), role: 'IT_SECURITY_ADMIN' }), { status: 400 });
  });

  await t.test('a conversation stays usable after the assistant replies with a link or a drafted email', async () => {
    const sent = [];
    const replies = [
      'Here is a draft:\nSubject: Leave request\nDear manager, I would like to request leave.',
      'See https://www.example.org/security for general advice.',
      'You are welcome.',
    ];
    const provider = {
      model: 'gpt-6-luna',
      verify: async () => modelPricing('gpt-6-luna'),
      respond: async (messages) => {
        sent.push(messages);
        return {
          model: 'gpt-6-luna',
          status: 'completed',
          service_tier: 'default',
          usage: { input_tokens: 100, output_tokens: 20 },
          output: [
            { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: replies[sent.length - 1] }] },
          ],
        };
      },
    };
    const chat = createChatService({ database: db, provider, config });
    const session = await db.chatSession.create({
      data: { ownerId: employee.id, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const send = (content) =>
      chat.send({
        userId: employee.id,
        sessionId: session.id,
        content,
        requestId: randomUUID(),
        privacyNoticeVersion: PRIVACY_NOTICE.version,
      });
    for (const [index, content] of ['Draft a leave email.', 'Where can I read more?', 'Thanks.'].entries())
      assert.equal((await send(content)).messages[1].content, replies[index]);
    assert.equal(sent.at(-1).length, 5, 'earlier turns remain in context');
    // Employee text is still fail-closed, and a credential-like stored reply is left out rather than re-sent.
    await assert.rejects(send('Subject: forwarded raw message'), { code: 'CHAT_SENSITIVE_INPUT' });
    await db.chatMessage.updateMany({
      where: { sessionId: session.id, role: 'ASSISTANT', sequence: 1 },
      data: { content: 'password: SyntheticValue' },
    });
    replies.push('Understood.');
    await send('One more question.');
    assert.doesNotMatch(JSON.stringify(sent.at(-1)), /SyntheticValue/);
  });
});
