import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { courseInput } from '../src/training/training-policy.js';
import { validateQuizDraft } from '../src/training/course-quiz-service.js';
import { provisionCourse, ProvisioningError } from '../src/training/course-provisioning.js';
import { phishingAwarenessCourse, phishingAwarenessQuiz } from '../src/training/content/phishing-awareness.js';

const lessonKeys = ['what-is-phishing', 'warning-signs', 'real-world-scenario', 'protect-yourself', 'what-to-do'];

test('TC1 Phishing Awareness content satisfies the existing course and quiz contracts', () => {
  const course = courseInput(phishingAwarenessCourse);
  assert.equal(course.title, 'Phishing Awareness'); assert.equal(course.topic, 'PHISHING'); assert.equal(course.requiresQuiz, true);
  assert.ok(course.estimatedMinutes >= 7 && course.estimatedMinutes <= 10);
  assert.deepEqual(course.content.sections.map((section) => section.key), lessonKeys);
  assert.deepEqual(course.content.sections.map((section) => section.title.slice(0, 8)), [1, 2, 3, 4, 5].map((n) => `Lesson ${n}`));
  const quiz = validateQuizDraft(phishingAwarenessQuiz);
  assert.equal(quiz.passingPercent, 80); assert.equal(quiz.questions.length, 5);
  assert.deepEqual(quiz.questions.map((q) => q.type).sort(), ['MULTIPLE_CHOICE', 'MULTIPLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'TRUE_FALSE']);
  for (const q of quiz.questions) assert.ok(q.explanation.length > 20);
  // Only reserved example domains (RFC 2606) appear in addresses and links.
  const text = JSON.stringify([phishingAwarenessCourse, phishingAwarenessQuiz]);
  const hosts = [...text.matchAll(/(?:@|https:\/\/)([a-z0-9.-]+[a-z0-9])/gi)].map((match) => match[1].toLowerCase());
  assert.ok(hosts.length >= 5);
  for (const host of hosts) assert.match(host, /(^|\.)(example\.(com|net|org)|[a-z0-9-]+\.example)$/, host);
});

test('TC1 Phishing Awareness provisioning and employee lifecycle', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(), users = [];
  const title = `Phishing Awareness synthetic ${randomUUID()}`;
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-phishing-course-secret-at-least-32-characters', FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    // Delete only the synthetic program created here; history triggers are disabled inside this local-test transaction only.
    try { await db.$transaction(async (tx) => {
      const programs = (await tx.trainingProgram.findMany({ where: { title }, select: { id: true } })).map((p) => p.id);
      const quizIds = (await tx.trainingQuiz.findMany({ where: { trainingId: { in: programs } }, select: { quizId: true } })).map((q) => q.quizId);
      await tx.$executeRawUnsafe('ALTER TABLE quiz_answers DISABLE TRIGGER answer_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_attempts DISABLE TRIGGER submitted_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_options DISABLE TRIGGER option_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_questions DISABLE TRIGGER question_history');
      await tx.auditLog.deleteMany({ where: { actorId: { in: users } } });
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
      await tx.user.deleteMany({ where: { id: { in: users } } });
      await tx.$executeRawUnsafe('ALTER TABLE quiz_questions ENABLE TRIGGER question_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_options ENABLE TRIGGER option_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_attempts ENABLE TRIGGER submitted_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_answers ENABLE TRIGGER answer_history');
    }, { timeout: 15000 }); } finally { await db.$disconnect(); }
  });
  async function user(role = 'EMPLOYEE', extra = {}) {
    const row = await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Learner', email: `${randomUUID()}@example.invalid`,
      status: 'ACTIVE', passwordHash: 'synthetic-not-a-login-hash', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}), ...extra } });
    users.push(row.id); return row;
  }
  const admin = await user('IT_SECURITY_ADMIN'), noMfa = await user('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
  const employee = await user(), other = await user();
  async function request(path, { actor = admin, body } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: config.frontendUrl, Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  const course = { ...phishingAwarenessCourse, title };
  const provision = (adminEmail) => provisionCourse(db, { adminEmail, course, quiz: phishingAwarenessQuiz });
  let programId;

  await t.test('provisioning requires an MFA-enrolled administrator and is idempotent', async () => {
    for (const email of [employee.email, noMfa.email, 'missing@example.invalid', '']) await assert.rejects(provision(email), ProvisioningError);
    assert.equal(await db.trainingProgram.count({ where: { title } }), 0);
    const first = await provision(admin.email.toUpperCase());
    assert.equal(first.outcome, 'CREATED'); assert.equal(first.quizCreated, true); programId = first.programId;
    const again = await provision(admin.email);
    assert.deepEqual([again.outcome, again.courseCreated, again.quizCreated, again.programId], ['ALREADY_EXISTS', false, false, programId]);
    assert.equal(await db.trainingProgram.count({ where: { title } }), 1);
    const program = await db.trainingProgram.findUnique({ where: { id: programId }, include: { quiz: { include: { quiz: true } }, assignments: true } });
    assert.deepEqual([program.status, program.origin, program.reviewedAt, program.createdById, program.assignments.length], ['DRAFT', 'HUMAN', null, admin.id, 0]);
    assert.deepEqual([program.quiz.quiz.status, program.quiz.quiz.passingPercent, program.quiz.quiz.maxAttempts], ['DRAFT', 80, 3]);
    assert.equal(await db.quizQuestion.count({ where: { quizId: program.quiz.quizId } }), 5);
    const actions = (await db.auditLog.findMany({ where: { resourceId: programId }, select: { action: true, actorId: true } }));
    assert.deepEqual(actions.map((a) => a.action).sort(), ['COURSE_QUIZ_CREATED', 'TRAINING_CREATED']);
    assert.ok(actions.every((a) => a.actorId === admin.id));
  });

  const adminPath = () => `/api/admin/training/${programId}`;
  await t.test('publication and assignment remain deliberate administrator actions', async () => {
    assert.equal((await request('/api/admin/training', { actor: employee })).status, 403);
    assert.equal((await request(`${adminPath()}/assignments`, { body: { employeeId: employee.id } })).status, 409);
    const draft = (await request(adminPath())).data.program;
    assert.equal(draft.content.sections.length, 5);
    assert.equal((await request(`${adminPath()}/publish`, { body: { expectedUpdatedAt: draft.updatedAt } })).status, 409);
    assert.equal((await request(`${adminPath()}/review`, { actor: employee, body: { expectedUpdatedAt: draft.updatedAt } })).status, 403);
    assert.equal((await request(`${adminPath()}/review`, { body: { expectedUpdatedAt: draft.updatedAt } })).status, 200);
    const reviewed = (await request(adminPath())).data.program;
    assert.equal((await request(`${adminPath()}/publish`, { body: { expectedUpdatedAt: reviewed.updatedAt } })).status, 200);
    const quiz = (await request(`${adminPath()}/quiz`)).data.quiz;
    const approved = await request(`${adminPath()}/quiz/approve`, { body: { expectedUpdatedAt: quiz.updatedAt } });
    assert.equal((await request(`${adminPath()}/quiz/publish`, { body: { expectedUpdatedAt: approved.data.quiz.updatedAt } })).status, 200);
    assert.equal((await request(`${adminPath()}/assignments`, { body: { employeeId: employee.id } })).status, 200);
  });

  await t.test('employees read five lessons in order, resume, and complete only through the server-scored quiz', async () => {
    const mine = await request('/api/training', { actor: employee });
    const assignmentId = mine.data.items.find((item) => item.training.title === title).id;
    assert.equal((await request(`/api/training/${assignmentId}`, { actor: other })).status, 404);
    assert.equal((await request('/api/training', { actor: other })).data.items.some((item) => item.training.title === title), false);
    const own = `/api/training/${assignmentId}`;
    const detail = (await request(own, { actor: employee })).data;
    assert.deepEqual(detail.assignment.training.content.sections.map((s) => s.key), lessonKeys);
    assert.equal(detail.completionRequirement, 'MATERIAL_AND_QUIZ');
    const before = (await request(`${own}/quiz`, { actor: employee })).data;
    assert.deepEqual([before.reason, before.quiz], ['READING_INCOMPLETE', null]);
    assert.equal((await request(`${own}/start`, { actor: employee, body: {} })).status, 200);
    assert.equal((await request(`${own}/sections`, { actor: employee, body: { sectionKey: lessonKeys[1], acknowledged: true } })).status, 409);
    for (const sectionKey of lessonKeys.slice(0, 2)) assert.equal((await request(`${own}/sections`, { actor: employee, body: { sectionKey, acknowledged: true } })).status, 200);
    const resumed = (await request(own, { actor: employee })).data.assignment.progress;
    assert.deepEqual([resumed.status, resumed.progressPercent, resumed.completedSectionKeys], ['IN_PROGRESS', 40, lessonKeys.slice(0, 2)]);
    for (const sectionKey of lessonKeys.slice(2)) assert.equal((await request(`${own}/sections`, { actor: employee, body: { sectionKey, acknowledged: true } })).status, 200);
    const material = (await request(own, { actor: employee })).data.assignment.progress;
    assert.deepEqual([material.status, material.progressPercent, material.completedAt], ['IN_PROGRESS', 100, null]);
    assert.equal(await db.certificate.count({ where: { progress: { assignmentId } } }), 0);

    const ready = (await request(`${own}/quiz`, { actor: employee })).data;
    assert.equal(ready.quiz.questions.length, 5); assert.equal(ready.passingPercent, 80); assert.equal(ready.attemptsRemaining, 3);
    assert.doesNotMatch(JSON.stringify(ready), /isCorrect|correctOption|explanation/i);
    // Answer key read directly from the database: the employee API never exposes it before submission.
    const key = new Map((await db.quizOption.findMany({ where: { isCorrect: true, question: { quiz: { trainingQuiz: { trainingId: programId } } } } }))
      .map((o) => [o.questionId, o.id]));
    const answers = (questions, wrongCount) => questions.map((q, index) => ({ questionId: q.id,
      selectedOptionId: index < wrongCount ? q.options.find((o) => o.id !== key.get(q.id)).id : key.get(q.id) }));
    const first = (await request(`${own}/quiz/attempts`, { actor: employee, body: {} })).data;
    const failed = await request(`${own}/quiz/attempts/${first.attempt.id}/submit`, { actor: employee, body: { answers: answers(first.quiz.questions, 2) } });
    assert.deepEqual([failed.data.attempt.passed, Number(failed.data.attempt.scorePercent)], [false, 60]);
    assert.equal((await request(own, { actor: employee })).data.assignment.progress.status, 'IN_PROGRESS');
    assert.equal(await db.certificate.count({ where: { progress: { assignmentId } } }), 0);
    const second = (await request(`${own}/quiz/attempts`, { actor: employee, body: {} })).data;
    const passed = await request(`${own}/quiz/attempts/${second.attempt.id}/submit`, { actor: employee, body: { answers: answers(second.quiz.questions, 1) } });
    assert.deepEqual([passed.data.attempt.passed, Number(passed.data.attempt.scorePercent)], [true, 80]);
    const done = (await request(own, { actor: employee })).data.assignment.progress;
    assert.equal(done.status, 'COMPLETED'); assert.ok(done.completedAt);
    assert.equal(await db.certificate.count({ where: { progress: { assignmentId } } }), 1);
  });
});
