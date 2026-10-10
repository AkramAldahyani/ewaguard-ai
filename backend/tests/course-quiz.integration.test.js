import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';

test('Phase 11B1 course quizzes: authenticated HTTP and PostgreSQL', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(), users = [], programs = [], quizIds = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-course-quiz-secret-at-least-32-characters', FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    // Historical rows are immutable in production. Disable only their history triggers
    // inside this local-test transaction, delete only IDs made here, then restore them.
    try { await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE quiz_answers DISABLE TRIGGER answer_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_attempts DISABLE TRIGGER submitted_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_options DISABLE TRIGGER option_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_questions DISABLE TRIGGER question_history');
      await tx.auditLog.deleteMany({ where: { actorId: { in: users } } });
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
    const row = await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Quiz', email: `${randomUUID()}@example.invalid`,
      status: 'ACTIVE', passwordHash: 'synthetic-not-a-login-hash', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}), ...extra } });
    users.push(row.id); return row;
  }
  const admin = await user('IT_SECURITY_ADMIN'), noMfa = await user('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
  const employee = await user(), other = await user(), exhaustedEmployee = await user();
  const root = '/api/admin/training', own = '/api/training';
  async function request(path, { actor = admin, body, origin = config.frontendUrl } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  const content = { title: 'Synthetic quiz training', description: 'Test only.', topic: 'PHISHING', learningObjectives: ['Recognize test signals.'],
    estimatedMinutes: 6, requiresQuiz: true, content: { version: 1, sections: [
      { key: 'intro', title: 'Intro', body: 'Test introduction.' }, { key: 'actions', title: 'Actions', body: 'Test actions.' } ] } };
  const quizDraft = (maxAttempts = 2) => ({ title: 'Synthetic course assessment', passingPercent: 75, maxAttempts, questions: [
    { text: 'Which choice is correct?', type: 'MULTIPLE_CHOICE', explanation: 'The first choice is correct.', points: 3,
      options: [{ text: 'Correct example', isCorrect: true }, { text: 'Wrong example', isCorrect: false }, { text: 'Another wrong example', isCorrect: false }] },
    { text: 'Is this statement true?', type: 'TRUE_FALSE', explanation: 'It is false.', points: 1,
      options: [{ text: 'True', isCorrect: false }, { text: 'False', isCorrect: true }] } ] });
  const created = await request(root, { body: content }); assert.equal(created.status, 200); const programId = created.data.program.id; programs.push(programId);
  const adminPath = `${root}/${programId}/quiz`;
  const ownPath = (id) => `${own}/${id}/quiz`;
  await t.test('authoring RBAC, MFA, origin and bounded input validation', async () => {
    for (const actor of [null, noMfa]) assert.equal((await request(adminPath, { actor })).status, 401);
    assert.equal((await request(adminPath, { actor: employee })).status, 403);
    assert.equal((await request(adminPath, { body: quizDraft(), actor: employee })).status, 403);
    assert.equal((await request(adminPath, { body: quizDraft(), origin: 'https://evil.invalid' })).status, 403);
    for (const body of [{ ...quizDraft(), passingPercent: 101 }, { ...quizDraft(), maxAttempts: 0 },
      { ...quizDraft(), questions: [{ ...quizDraft().questions[0], text: '<script>bad</script>' }] },
      { ...quizDraft(), questions: [{ ...quizDraft().questions[0], options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: true }] }] },
      { ...quizDraft(), status: 'PUBLISHED' }]) assert.equal((await request(adminPath, { body })).status, 400);
  });
  const draft = await request(adminPath, { body: quizDraft() }); assert.equal(draft.status, 200, JSON.stringify(draft.data)); quizIds.push(draft.data.quiz.id);
  await t.test('draft editing, reorder, preview and approval/publish lifecycle', async () => {
    assert.equal(draft.data.quiz.status, 'DRAFT'); assert.equal(draft.data.quiz.questions[0].options[0].isCorrect, true);
    assert.equal((await request(`${adminPath}/publish`, { body: { expectedUpdatedAt: draft.data.quiz.updatedAt } })).status, 409);
    const edit = await request(`${adminPath}/edit`, { body: { ...quizDraft(), questions: quizDraft().questions.reverse(), expectedUpdatedAt: draft.data.quiz.updatedAt } });
    assert.equal(edit.status, 200, JSON.stringify(edit.data)); assert.equal(edit.data.quiz.questions[0].type, 'TRUE_FALSE');
    assert.equal((await request(`${adminPath}/edit`, { body: { ...quizDraft(), expectedUpdatedAt: draft.data.quiz.updatedAt } })).status, 409);
    const approved = await request(`${adminPath}/approve`, { body: { expectedUpdatedAt: edit.data.quiz.updatedAt } });
    assert.equal(approved.status, 200, JSON.stringify(approved.data));
    assert.equal((await request(`${adminPath}/edit`, { body: { ...quizDraft(), expectedUpdatedAt: approved.data.quiz.updatedAt } })).status, 409);
    assert.equal((await request(`${adminPath}/publish`, { body: { expectedUpdatedAt: approved.data.quiz.updatedAt } })).status, 409);
    const course = (await request(`${root}/${programId}`)).data.program;
    assert.equal((await request(`${root}/${programId}/review`, { body: { expectedUpdatedAt: course.updatedAt } })).status, 200);
    const reviewed = (await request(`${root}/${programId}`)).data.program;
    assert.equal((await request(`${root}/${programId}/publish`, { body: { expectedUpdatedAt: reviewed.updatedAt } })).status, 200);
    const published = await request(`${adminPath}/publish`, { body: { expectedUpdatedAt: approved.data.quiz.updatedAt } });
    assert.equal(published.status, 200, JSON.stringify(published.data));
    assert.equal((await request(`${adminPath}/edit`, { body: { ...quizDraft(), expectedUpdatedAt: published.data.quiz.updatedAt } })).status, 409);
  });
  const assigned = await request(`${root}/${programId}/assignments`, { body: { employeeId: employee.id } }); assert.equal(assigned.status, 200); const assignmentId = assigned.data.assignment.id;
  await t.test('ownership, prerequisites and answer-key confidentiality', async () => {
    assert.equal((await request(ownPath(assignmentId), { actor: other })).status, 404);
    assert.equal((await request(ownPath(assignmentId), { actor: admin })).status, 403);
    assert.equal((await request(ownPath(assignmentId), { actor: noMfa })).status, 401);
    assert.equal((await request(ownPath(assignmentId), { actor: null })).status, 401);
    const pre = await request(ownPath(assignmentId), { actor: employee });
    assert.equal(pre.data.reason, 'READING_INCOMPLETE'); assert.equal(pre.data.quiz, null);
    assert.equal((await request(`${ownPath(assignmentId)}/attempts`, { actor: employee, body: {} })).status, 409);
    assert.equal((await request(`${own}/${assignmentId}/start`, { actor: employee, body: {} })).status, 200);
    for (const sectionKey of ['intro', 'actions']) assert.equal((await request(`${own}/${assignmentId}/sections`, { actor: employee, body: { sectionKey, acknowledged: true } })).status, 200);
    const ready = await request(ownPath(assignmentId), { actor: employee });
    assert.equal(ready.data.quiz.questions.length, 2); assert.equal(ready.data.attemptsRemaining, 2);
    assert.doesNotMatch(JSON.stringify(ready.data), /isCorrect|correctOption|explanation|approvedBy|email|password/i);
    assert.equal(ready.cache, 'no-store');
  });
  const first = await request(`${ownPath(assignmentId)}/attempts`, { actor: employee, body: {} }); assert.equal(first.status, 200, JSON.stringify(first.data));
  await t.test('failed scoring, duplicate validation, retries and history', async () => {
    const questions = first.data.quiz.questions;
    const wrong = questions.map((q) => ({ questionId: q.id, selectedOptionId: q.options[0].id }));
    // Reordered draft: first TRUE_FALSE (True wrong), second MULTIPLE_CHOICE (first correct) -> 75%, threshold boundary passes.
    const bad = questions.map((q) => ({ questionId: q.id, selectedOptionId: q.options[q.type === 'TRUE_FALSE' ? 0 : 1].id }));
    const submitPath = `${ownPath(assignmentId)}/attempts/${first.data.attempt.id}/submit`;
    assert.equal((await request(submitPath, { actor: other, body: { answers: bad } })).status, 404);
    assert.equal((await request(submitPath, { actor: employee, body: { answers: [bad[0]] } })).status, 400);
    assert.equal((await request(submitPath, { actor: employee, body: { answers: [bad[0], bad[0]] } })).status, 400);
    assert.equal((await request(submitPath, { actor: employee, body: { answers: [{ ...bad[0], selectedOptionId: randomUUID() }, bad[1]] } })).status, 400);
    assert.equal((await request(submitPath, { actor: employee, body: { answers: bad, scorePercent: 100 } })).status, 400);
    const failed = await request(submitPath, { actor: employee, body: { answers: bad } });
    assert.equal(failed.status, 200, JSON.stringify(failed.data)); assert.equal(failed.data.attempt.passed, false); assert.equal(Number(failed.data.attempt.scorePercent), 0);
    assert.equal((await request(`${own}/${assignmentId}`, { actor: employee })).data.assignment.progress.status, 'IN_PROGRESS');
    assert.equal((await request(submitPath, { actor: employee, body: { answers: bad } })).data.attempt.id, first.data.attempt.id);
    assert.equal((await request(submitPath, { actor: employee, body: { answers: wrong } })).status, 409);
    assert.equal((await request(`${ownPath(assignmentId)}/attempts/${first.data.attempt.id}`, { actor: other })).status, 404);
    assert.equal((await request(`${ownPath(assignmentId)}/attempts/${first.data.attempt.id}`, { actor: employee })).data.answers.length, 2);
    const retry = await request(`${ownPath(assignmentId)}/attempts`, { actor: employee, body: {} });
    assert.equal(retry.data.attempt.attemptNumber, 2);
    const correct = retry.data.quiz.questions.map((q) => ({ questionId: q.id, selectedOptionId: q.options[q.type === 'TRUE_FALSE' ? 1 : 0].id }));
    const passed = await request(`${ownPath(assignmentId)}/attempts/${retry.data.attempt.id}/submit`, { actor: employee, body: { answers: correct } });
    assert.equal(passed.status, 200, JSON.stringify(passed.data)); assert.equal(passed.data.attempt.passed, true);
    assert.equal(Number(passed.data.attempt.scorePercent), 100);
    const progress = (await request(`${own}/${assignmentId}`, { actor: employee })).data.assignment.progress;
    assert.equal(progress.status, 'COMPLETED'); assert.ok(progress.completedAt);
    assert.equal((await request(`${ownPath(assignmentId)}/attempts`, { actor: employee, body: {} })).status, 409);
    assert.equal((await request(ownPath(assignmentId), { actor: employee })).data.attemptsRemaining, 0);
    const report = await request(`${adminPath}/attempts?pageSize=1`);
    assert.equal(report.data.items.length, 1); assert.equal(report.data.hasMore, true);
    assert.equal((await request(`${adminPath}/attempts?pageSize=1&page=2`)).data.items.length, 1);
    assert.doesNotMatch(JSON.stringify(report.data), /email|password|isCorrect|explanation/i);
    assert.equal(await db.quizAttempt.count({ where: { quizId: quizIds[0] } }), 2);
    assert.equal(await db.quizAnswer.count({ where: { attempt: { quizId: quizIds[0] } } }), 4);
  });
  await t.test('weighted passing boundary and exhausted attempt limit', async () => {
    const added = await request(`${root}/${programId}/assignments`, { body: { employeeId: other.id } });
    assert.equal(added.status, 200); const id = added.data.assignment.id;
    await request(`${own}/${id}/start`, { actor: other, body: {} });
    for (const sectionKey of ['intro', 'actions']) await request(`${own}/${id}/sections`, { actor: other, body: { sectionKey, acknowledged: true } });
    const a = await request(`${ownPath(id)}/attempts`, { actor: other, body: {} });
    const boundary = a.data.quiz.questions.map((q) => ({ questionId: q.id, selectedOptionId: q.options[q.type === 'TRUE_FALSE' ? 0 : 0].id }));
    const boundaryResult = await request(`${ownPath(id)}/attempts/${a.data.attempt.id}/submit`, { actor: other, body: { answers: boundary } });
    assert.equal(boundaryResult.status, 200); assert.equal(Number(boundaryResult.data.attempt.scorePercent), 75);
    assert.equal(boundaryResult.data.attempt.passed, true);
    assert.equal((await request(`${own}/${id}`, { actor: other })).data.assignment.progress.status, 'COMPLETED');
    assert.equal((await request(`${ownPath(id)}/attempts`, { actor: other, body: {} })).status, 409);
    const limited = await request(`${root}/${programId}/assignments`, { body: { employeeId: exhaustedEmployee.id } });
    const limitedId = limited.data.assignment.id;
    await request(`${own}/${limitedId}/start`, { actor: exhaustedEmployee, body: {} });
    for (const sectionKey of ['intro', 'actions']) await request(`${own}/${limitedId}/sections`, { actor: exhaustedEmployee, body: { sectionKey, acknowledged: true } });
    for (let number = 1; number <= 2; number++) {
      const next = await request(`${ownPath(limitedId)}/attempts`, { actor: exhaustedEmployee, body: {} });
      assert.equal(next.data.attempt.attemptNumber, number);
      const wrong = next.data.quiz.questions.map((q) => ({ questionId: q.id, selectedOptionId: q.options[0].id }));
      wrong[1].selectedOptionId = next.data.quiz.questions[1].options[1].id;
      const failed = await request(`${ownPath(limitedId)}/attempts/${next.data.attempt.id}/submit`, { actor: exhaustedEmployee, body: { answers: wrong } });
      assert.equal(failed.data.attempt.passed, false);
    }
    assert.equal((await request(`${ownPath(limitedId)}/attempts`, { actor: exhaustedEmployee, body: {} })).status, 409);
    assert.equal((await request(`${own}/${limitedId}`, { actor: exhaustedEmployee })).data.assignment.progress.status, 'IN_PROGRESS');
  });
  await t.test('publication and history remain immutable at the database boundary', async () => {
    const quiz = await db.quiz.findUnique({ where: { id: quizIds[0] }, include: { questions: true } });
    await assert.rejects(db.quizQuestion.update({ where: { id: quiz.questions[0].id }, data: { text: 'Tampered' } }));
    const attempt = await db.quizAttempt.findFirst({ where: { quizId: quiz.id, status: 'SUBMITTED' } });
    await assert.rejects(db.quizAttempt.update({ where: { id: attempt.id }, data: { earnedPoints: 999 } }));
    const logs = await db.auditLog.findMany({ where: { resourceId: programId } });
    assert.ok(logs.some((log) => log.action === 'COURSE_QUIZ_PUBLISH'));
    assert.doesNotMatch(JSON.stringify(logs.map((log) => log.metadata)), /Correct example|Wrong example|questionId|selectedOptionId/);
  });
});
