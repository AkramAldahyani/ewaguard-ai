import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { createTrainingService } from '../src/training/training-service.js';

test('Phase 11A1 training foundation: PostgreSQL and authenticated HTTP', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const database = createDatabaseClient(),
    users = [],
    programs = [];
  const config = parseConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-training-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173',
  });
  const server = createApp(config, { database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await database.certificate.deleteMany({ where: { progress: { assignment: { trainingId: { in: programs } } } } });
    await database.trainingProgress.deleteMany({ where: { assignment: { trainingId: { in: programs } } } });
    // This test's own synthetic course quiz is approved and published, so its content is protected by the history
    // triggers. Same scoped teardown as course-quiz.integration.test.js: triggers are re-enabled in the same transaction.
    const quizIds = (
      await database.trainingQuiz.findMany({ where: { trainingId: { in: programs } }, select: { quizId: true } })
    ).map((row) => row.quizId);
    await database.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('ALTER TABLE quiz_attempts DISABLE TRIGGER submitted_history');
        await tx.$executeRawUnsafe('ALTER TABLE quiz_options DISABLE TRIGGER option_history');
        await tx.$executeRawUnsafe('ALTER TABLE quiz_questions DISABLE TRIGGER question_history');
        await tx.quizAnswer.deleteMany({ where: { attempt: { quizId: { in: quizIds } } } });
        await tx.quizAttempt.deleteMany({ where: { quizId: { in: quizIds } } });
        await tx.quizOption.deleteMany({ where: { question: { quizId: { in: quizIds } } } });
        await tx.quizQuestion.deleteMany({ where: { quizId: { in: quizIds } } });
        await tx.trainingQuiz.deleteMany({ where: { quizId: { in: quizIds } } });
        await tx.quiz.deleteMany({ where: { id: { in: quizIds } } });
        await tx.$executeRawUnsafe('ALTER TABLE quiz_questions ENABLE TRIGGER question_history');
        await tx.$executeRawUnsafe('ALTER TABLE quiz_options ENABLE TRIGGER option_history');
        await tx.$executeRawUnsafe('ALTER TABLE quiz_attempts ENABLE TRIGGER submitted_history');
      },
      { timeout: 15000 },
    );
    await database.trainingAssignment.deleteMany({ where: { trainingId: { in: programs } } });
    await database.trainingProgram.deleteMany({ where: { id: { in: programs } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    await database.$disconnect();
  });
  async function user(role = 'EMPLOYEE', changes = {}) {
    const row = await database.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Training',
        email: `${randomUUID()}@example.invalid`,
        status: 'ACTIVE',
        passwordHash: 'synthetic-not-a-login-hash',
        role: { connect: { name: role } },
        ...(role === 'IT_SECURITY_ADMIN'
          ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n }
          : {}),
        ...changes,
      },
    });
    users.push(row.id);
    return row;
  }
  const admin = await user('IT_SECURITY_ADMIN'),
    employee = await user(),
    other = await user();
  const noMfa = await user('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
  const suspended = await user('EMPLOYEE', { status: 'SUSPENDED' });
  const root = '/api/admin/training',
    own = '/api/training',
    marker = randomUUID();
  const content = (requiresQuiz = true) => ({
    title: `Synthetic ${marker}`,
    description: 'Demonstration content for automated tests only.',
    topic: 'PHISHING',
    learningObjectives: ['Recognize example indicators.'],
    estimatedMinutes: 6,
    requiresQuiz,
    content: {
      version: 1,
      sections: [
        { key: 'intro', title: 'Introduction', body: 'Synthetic test section.' },
        { key: 'takeaways', title: 'Key takeaways', body: 'Synthetic test takeaways.' },
      ],
    },
  });
  async function request(path, { actor = admin, body, origin = config.frontendUrl } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        ...(actor
          ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}` }
          : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  async function create(requiresQuiz = true) {
    const result = await request(root, { body: content(requiresQuiz) });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    programs.push(result.data.program.id);
    return result.data.program;
  }
  async function change(program, operation, extra = {}) {
    const current = (await request(`${root}/${program.id}`)).data.program;
    return request(`${root}/${program.id}/${operation}`, { body: { expectedUpdatedAt: current.updatedAt, ...extra } });
  }
  // A quiz-required course needs an approved quiz before publication and a published quiz before assignment (BUG-008).
  const quizDraft = {
    title: 'Synthetic course assessment',
    passingPercent: 75,
    maxAttempts: 2,
    questions: [
      {
        text: 'Is this statement true?',
        type: 'TRUE_FALSE',
        explanation: 'It is false.',
        points: 1,
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: true },
        ],
      },
    ],
  };
  async function quizStep(target, action) {
    if (action === 'create') return request(`${root}/${target.id}/quiz`, { body: quizDraft });
    const quiz = (await request(`${root}/${target.id}/quiz`)).data.quiz;
    return request(`${root}/${target.id}/quiz/${action}`, { body: { expectedUpdatedAt: quiz.updatedAt } });
  }
  const program = await create();
  let assignment;
  await t.test('RBAC, MFA, authentication and trusted origin protect reads and writes', async () => {
    for (const actor of [null, noMfa, suspended]) assert.equal((await request(root, { actor })).status, 401);
    assert.equal((await request(root, { actor: employee })).status, 403);
    assert.equal((await request(root, { actor: employee, body: content() })).status, 403);
    assert.equal((await request(own)).status, 403);
    assert.equal((await request(root, { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await request(root, { body: content(), origin: 'https://evil.invalid' })).status, 403);
  });
  await t.test('draft creation, editing, explicit review and stale-edit protection', async () => {
    assert.equal(program.status, 'DRAFT');
    assert.equal((await change(program, 'publish')).status, 409);
    assert.equal((await change(program, 'review')).status, 200);
    assert.equal((await change(program, 'edit', content())).status, 200);
    assert.equal((await change(program, 'publish')).status, 409);
    assert.equal(
      (await request(`${root}/${program.id}/archive`, { body: { expectedUpdatedAt: program.updatedAt } })).status,
      409,
    );
    assert.equal(
      (await request(`${root}/${program.id}/assignments`, { body: { employeeId: employee.id } })).status,
      409,
    );
    assert.equal((await change(program, 'review')).status, 200);
    assert.equal((await change(program, 'publish')).status, 409, 'no quiz yet');
    assert.equal((await quizStep(program, 'create')).status, 200);
    assert.equal((await change(program, 'publish')).status, 409, 'quiz still a draft');
    assert.equal((await quizStep(program, 'approve')).status, 200);
    assert.equal((await change(program, 'publish')).status, 200);
    assert.equal(
      (await request(`${root}/${program.id}/assignments`, { body: { employeeId: employee.id } })).status,
      409,
      'quiz not yet published',
    );
    assert.equal(
      (await request(`${root}/${program.id}/assignments/bulk`, { body: { allEligible: true } })).status,
      409,
      'bulk assignment blocked too',
    );
    assert.equal(await database.trainingAssignment.count({ where: { trainingId: program.id } }), 0);
    assert.equal((await quizStep(program, 'publish')).status, 200);
    assert.equal((await change(program, 'edit', content())).status, 409);
  });
  await t.test('content input rejects HTML, forged publication and invalid boundaries', async () => {
    for (const body of [
      { ...content(), title: '<img src=x onerror=alert(1)>' },
      { ...content(), status: 'PUBLISHED' },
      { ...content(), estimatedMinutes: 0 },
      { ...content(), requiresQuiz: 'false' },
      {
        ...content(),
        content: {
          version: 1,
          sections: [
            { key: 'a', title: 'A', body: 'A' },
            { key: 'a', title: 'B', body: 'B' },
          ],
        },
      },
      {
        ...content(),
        content: {
          version: 1,
          sections: [
            { key: 'a', title: 'A', body: '<script>bad()</script>' },
            { key: 'b', title: 'B', body: 'B' },
          ],
        },
      },
    ])
      assert.equal((await request(root, { body })).status, 400);
  });
  await t.test('eligible assignment, concurrent duplicate prevention and minimal employee information', async () => {
    for (const id of [admin.id, suspended.id, randomUUID()])
      assert.equal((await request(`${root}/${program.id}/assignments`, { body: { employeeId: id } })).status, 400);
    const results = await Promise.all(
      [1, 2].map(() => request(`${root}/${program.id}/assignments`, { body: { employeeId: employee.id } })),
    );
    assert.ok(results.every((result) => result.status === 200));
    assert.equal(results[0].data.assignment.id, results[1].data.assignment.id);
    assignment = results[0].data.assignment;
    assert.equal(await database.trainingAssignment.count({ where: { trainingId: program.id } }), 1);
    const people = await request(`${root}/employees?pageSize=50`);
    assert.doesNotMatch(JSON.stringify(people.data), /password|email|mfa|secret/i);
  });
  await t.test('employee ownership, eligible content and read-only opening', async () => {
    const detail = await request(`${own}/${assignment.id}`, { actor: employee });
    assert.equal(detail.status, 200);
    assert.equal(detail.cache, 'no-store');
    assert.equal(detail.data.assignment.progress.status, 'NOT_STARTED');
    assert.equal(detail.data.contentAvailable, true);
    assert.doesNotMatch(JSON.stringify(detail.data), /createdBy|reviewedBy|employeeId|assignedBy|qualifyingAttempt/);
    assert.equal((await request(`${own}/${assignment.id}`, { actor: other })).status, 404);
    assert.equal((await request(`${own}/${assignment.id}/start`, { actor: other, body: {} })).status, 404);
    assert.equal((await request(own, { actor: other })).data.items.length, 0);
    assert.equal((await request(`${own}/${program.id}`, { actor: employee })).status, 404);
  });
  const advance = (body) => request(`${own}/${assignment.id}/sections`, { actor: employee, body });
  await t.test('start and sequential progress reject forged completion and skipped sections', async () => {
    assert.equal((await advance({ sectionKey: 'intro', acknowledged: true })).status, 409);
    assert.equal(
      (await request(`${own}/${assignment.id}/start`, { actor: employee, body: { status: 'COMPLETED' } })).status,
      400,
    );
    const start = await request(`${own}/${assignment.id}/start`, { actor: employee, body: {} });
    assert.equal(start.data.progress.status, 'IN_PROGRESS');
    assert.equal((await advance({ sectionKey: 'takeaways', acknowledged: true })).status, 409);
    assert.equal((await advance({ sectionKey: 'intro', acknowledged: false })).status, 400);
    assert.equal((await advance({ sectionKey: 'unknown', acknowledged: true })).status, 400);
    assert.equal((await advance({ sectionKey: 'intro', acknowledged: true, progressPercent: 100 })).status, 400);
    const repeated = await Promise.all([1, 2].map(() => advance({ sectionKey: 'intro', acknowledged: true })));
    assert.ok(repeated.every((result) => result.data.progress.progressPercent === 50));
    const resumed = await request(`${own}/${assignment.id}`, { actor: employee });
    assert.deepEqual(resumed.data.assignment.progress.completedSectionKeys, ['intro']);
    assert.equal(
      (await request(`${own}/${assignment.id}/start`, { actor: employee, body: {} })).data.progress.progressPercent,
      50,
    );
  });
  await t.test('material completion preserves future quiz gate and idempotency', async () => {
    const completed = await advance({ sectionKey: 'takeaways', acknowledged: true });
    assert.equal(completed.data.progress.progressPercent, 100);
    assert.equal(completed.data.progress.status, 'IN_PROGRESS');
    assert.ok(completed.data.progress.materialCompletedAt);
    assert.equal(completed.data.progress.completedAt, null);
    assert.deepEqual((await advance({ sectionKey: 'takeaways', acknowledged: true })).data, completed.data);
  });
  let materialCertificate;
  await t.test('explicit material-only course completes after all acknowledgements', async () => {
    const material = await create(false);
    await change(material, 'review');
    await change(material, 'publish');
    const result = await request(`${root}/${material.id}/assignments`, { body: { employeeId: employee.id } });
    const id = result.data.assignment.id;
    await request(`${own}/${id}/start`, { actor: employee, body: {} });
    await request(`${own}/${id}/sections`, { actor: employee, body: { sectionKey: 'intro', acknowledged: true } });
    const completions = await Promise.all(
      [1, 2].map(() =>
        request(`${own}/${id}/sections`, { actor: employee, body: { sectionKey: 'takeaways', acknowledged: true } }),
      ),
    );
    assert.ok(
      completions.every(
        (done) => done.status === 200 && done.data.progress.status === 'COMPLETED' && done.data.progress.completedAt,
      ),
    );
    assert.equal(await database.certificate.count({ where: { progress: { assignmentId: id } } }), 1);
    const certificates = await request('/api/certificates', { actor: employee });
    assert.equal(certificates.status, 200);
    assert.equal(certificates.data.items.length, 1);
    materialCertificate = certificates.data.items[0];
    assert.equal(materialCertificate.trainingId, material.id);
    assert.equal(materialCertificate.scorePercent, null);
    assert.equal(
      await database.certificate.count({ where: { progress: { assignment: { trainingId: program.id } } } }),
      0,
    );
  });
  await t.test(
    'certificate ownership, administrator MFA, verification, PDF, and historical reconciliation',
    async () => {
      const cert = materialCertificate,
        ownCert = `/api/certificates/${cert.id}`;
      assert.equal(
        (await request(ownCert, { actor: employee })).data.certificate.certificateNumber,
        cert.certificateNumber,
      );
      assert.equal((await request(ownCert, { actor: other })).status, 404);
      assert.equal((await request(`${ownCert}/pdf`, { actor: other })).status, 404);
      assert.equal((await request('/api/certificates', { actor: other })).data.items.length, 0);
      assert.equal(
        (await request(`/api/admin/certificates/verify/${cert.certificateNumber}`, { actor: employee })).status,
        403,
      );
      assert.equal(
        (await request(`/api/admin/certificates/verify/${cert.certificateNumber}`, { actor: noMfa })).status,
        401,
      );
      assert.equal(
        (await request(`/api/admin/certificates/verify/${cert.certificateNumber}`, { actor: null })).status,
        401,
      );
      const verified = await request(`/api/admin/certificates/verify/${cert.certificateNumber}`);
      assert.equal(verified.status, 200);
      assert.equal(verified.data.trainingCompletionConfirmed, true);
      const found = await request('/api/admin/certificates?search=Synthetic%20Training&status=ISSUED');
      assert.equal(found.status, 200);
      assert.ok(found.data.items.some((row) => row.id === cert.id));
      const response = await fetch(`http://127.0.0.1:${server.address().port}${ownCert}/pdf`, {
        headers: {
          Origin: config.frontendUrl,
          Cookie: `${authCookie(config).name}=${issueAccessToken(employee.id, config)}`,
        },
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^application\/pdf/);
      assert.match(response.headers.get('content-disposition'), /^attachment;/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(
        Buffer.from(await response.arrayBuffer())
          .subarray(0, 5)
          .toString(),
        '%PDF-',
      );
      await database.certificate.delete({ where: { id: cert.id } });
      const historical = await request('/api/certificates', { actor: employee });
      assert.equal(historical.data.items.length, 1);
      assert.notEqual(historical.data.items[0].certificateNumber, cert.certificateNumber);
      assert.equal((await request('/api/certificates', { actor: employee })).data.items.length, 1);
    },
  );
  await t.test('bounded server pagination, search, filters and progress reporting', async () => {
    const first = await request(`${root}?search=${marker}&pageSize=1&sort=title_asc`);
    const second = await request(`${root}?search=${marker}&pageSize=1&sort=title_asc&page=2`);
    assert.equal(first.data.hasMore, true);
    assert.notEqual(first.data.items[0].id, second.data.items[0].id);
    assert.equal((await request(`${root}?search=${marker}&status=DRAFT`)).data.items.length, 0);
    for (const query of [
      'page=0',
      'pageSize=51',
      'status=UNKNOWN',
      'topic=UNKNOWN',
      'sort=unknown',
      'search=a&search=b',
      'employeeId=' + other.id,
    ])
      assert.equal((await request(`${root}?${query}`)).status, 400);
    const report = await request(`${root}/${program.id}/assignments?status=IN_PROGRESS`);
    assert.equal(report.data.items[0].progress.progressPercent, 100);
    assert.equal(report.data.items[0].employee.id, employee.id);
    assert.doesNotMatch(JSON.stringify(report.data), /email|password|qualifyingAttempt/);
    assert.equal((await request(`${own}?status=COMPLETED`, { actor: employee })).data.items.length, 1);
  });
  await t.test('archival preserves progress, removes employee content and prevents new work', async () => {
    assert.equal((await change(program, 'archive')).status, 200);
    const archived = await request(`${own}/${assignment.id}`, { actor: employee });
    assert.equal(archived.data.contentAvailable, false);
    assert.equal(archived.data.assignment.training.content, undefined);
    assert.equal(archived.data.assignment.progress.progressPercent, 100);
    assert.equal((await advance({ sectionKey: 'intro', acknowledged: true })).status, 409);
    assert.equal((await request(`${root}/${program.id}/assignments`, { body: { employeeId: other.id } })).status, 409);
    assert.equal((await change(program, 'publish')).status, 409);
  });
  await t.test('audit records minimize content and transactional audit failure rolls back', async () => {
    const logs = await database.auditLog.findMany({ where: { resourceId: program.id } });
    assert.ok(logs.some((log) => log.action === 'TRAINING_ASSIGNED'));
    assert.doesNotMatch(JSON.stringify(logs.map((log) => log.metadata)), /Synthetic|Demonstration|takeaways/);
    const broken = new Proxy(database, {
      get(target, key) {
        if (key === '$transaction')
          return (fn) =>
            target.$transaction((tx) =>
              fn(
                new Proxy(tx, {
                  get(inner, property) {
                    return property === 'auditLog'
                      ? {
                          create: () => {
                            throw new Error('synthetic audit failure');
                          },
                        }
                      : inner[property];
                  },
                }),
              ),
            );
        return target[key];
      },
    });
    const count = await database.trainingProgram.count({ where: { createdById: admin.id } });
    await assert.rejects(createTrainingService(broken).create(admin, content()), /synthetic audit failure/);
    assert.equal(await database.trainingProgram.count({ where: { createdById: admin.id } }), count);
  });
});
