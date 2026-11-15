import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';

test('Phase 11C1 monthly quiz lifecycle, scoring and history', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  // Only one monthly quiz may exist per month, and only the current month can be OPEN. Pin the in-process clock to
  // an otherwise unused month so this test never depends on, or collides with, real drafts for the actual current
  // month. Only Date is mocked; timers and the database clock are unaffected.
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2093, 5, 15, 12) });
  const db = createDatabaseClient(),
    users = [],
    monthlyIds = [],
    quizIds = [];
  const config = parseConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-monthly-quiz-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173',
  });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    // Only synthetic IDs created by this test are removed. Production history triggers
    // remain enabled before commit and no pre-existing records are selected.
    try {
      await db.$transaction(
        async (tx) => {
          for (const [table, trigger] of [
            ['quiz_answers', 'answer_history'],
            ['quiz_attempts', 'submitted_history'],
            ['quiz_options', 'option_history'],
            ['quiz_questions', 'question_history'],
          ])
            await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
          await tx.auditLog.deleteMany({ where: { actorId: { in: users }, resourceId: { in: monthlyIds } } });
          await tx.quizAnswer.deleteMany({ where: { attempt: { quizId: { in: quizIds } } } });
          await tx.quizAttempt.deleteMany({ where: { quizId: { in: quizIds } } });
          await tx.quizOption.deleteMany({ where: { question: { quizId: { in: quizIds } } } });
          await tx.quizQuestion.deleteMany({ where: { quizId: { in: quizIds } } });
          await tx.monthlyQuizAssignment.deleteMany({ where: { monthlyQuizId: { in: monthlyIds } } });
          await tx.monthlyQuiz.deleteMany({ where: { id: { in: monthlyIds } } });
          await tx.quiz.deleteMany({ where: { id: { in: quizIds } } });
          await tx.user.deleteMany({ where: { id: { in: users } } });
          for (const [table, trigger] of [
            ['quiz_questions', 'question_history'],
            ['quiz_options', 'option_history'],
            ['quiz_attempts', 'submitted_history'],
            ['quiz_answers', 'answer_history'],
          ])
            await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
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
        lastName: 'Monthly',
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
  const employee = await user(),
    other = await user(),
    third = await user();
  const adminRoot = '/api/admin/monthly-quizzes',
    ownRoot = '/api/monthly-quizzes';
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
  const now = new Date(),
    year = now.getUTCFullYear(),
    monthIndex = now.getUTCMonth();
  const period = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const open = new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    close = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString();
  const draft = () => ({
    period,
    opensAt: open,
    closesAt: close,
    title: 'Synthetic awareness month',
    passingPercent: 75,
    maxAttempts: 2,
    questions: [
      {
        text: 'Which action is appropriate?',
        type: 'MULTIPLE_CHOICE',
        topic: 'PHISHING',
        explanation: 'Use approved reporting.',
        points: 3,
        options: [
          { text: 'Report it', isCorrect: true },
          { text: 'Ignore it', isCorrect: false },
        ],
      },
      {
        text: 'Is this safe?',
        type: 'TRUE_FALSE',
        topic: 'MFA',
        explanation: 'Do not share MFA codes.',
        points: 1,
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: true },
        ],
      },
    ],
  });
  const editBody = (expectedUpdatedAt, changes = {}) => {
    const body = { ...draft(), ...changes, expectedUpdatedAt };
    delete body.period;
    return body;
  };
  await t.test('RBAC, MFA, origin, validation and month uniqueness', async () => {
    for (const actor of [null, noMfa]) assert.equal((await request(adminRoot, { actor })).status, 401);
    assert.equal((await request(adminRoot, { actor: employee })).status, 403);
    assert.equal((await request(ownRoot)).status, 403);
    assert.equal((await request(adminRoot, { body: draft(), origin: 'https://evil.invalid' })).status, 403);
    for (const body of [
      { ...draft(), period: '2026-13' },
      { ...draft(), maxAttempts: 0 },
      { ...draft(), questions: {} },
      { ...draft(), questions: [{ ...draft().questions[0], topic: 'UNKNOWN' }] },
      { ...draft(), questions: [{ ...draft().questions[0], text: '<script>bad</script>' }] },
      {
        ...draft(),
        questions: [
          {
            ...draft().questions[0],
            options: [
              { text: 'A', isCorrect: true },
              { text: 'B', isCorrect: true },
            ],
          },
        ],
      },
      { ...draft(), closesAt: open },
      { ...draft(), status: 'PUBLISHED' },
    ])
      assert.equal((await request(adminRoot, { body })).status, 400);
  });
  const created = await request(adminRoot, { body: draft() });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const id = created.data.monthlyQuiz.id,
    quizId = created.data.monthlyQuiz.quiz.id;
  monthlyIds.push(id);
  quizIds.push(quizId);
  await t.test('draft edit, explicit approval, publish, filtering and immutable content', async () => {
    assert.equal(created.data.monthlyQuiz.period, period);
    assert.equal(created.data.monthlyQuiz.availability, 'UNPUBLISHED');
    assert.equal(created.data.monthlyQuiz.quiz.questions[0].topic, 'PHISHING');
    assert.equal((await request(adminRoot, { body: draft() })).status, 409);
    assert.equal(
      (
        await request(`${adminRoot}/${id}/publish`, {
          body: { expectedUpdatedAt: created.data.monthlyQuiz.quiz.updatedAt },
        })
      ).status,
      409,
    );
    const edit = await request(`${adminRoot}/${id}/edit`, {
      body: editBody(created.data.monthlyQuiz.quiz.updatedAt, { questions: draft().questions.reverse() }),
    });
    assert.equal(edit.status, 200, JSON.stringify(edit.data));
    assert.equal(edit.data.monthlyQuiz.quiz.questions[0].topic, 'MFA');
    assert.equal(
      (await request(`${adminRoot}/${id}/edit`, { body: editBody(created.data.monthlyQuiz.quiz.updatedAt) })).status,
      409,
    );
    const approved = await request(`${adminRoot}/${id}/approve`, {
      body: { expectedUpdatedAt: edit.data.monthlyQuiz.quiz.updatedAt },
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.data));
    assert.equal(
      (await request(`${adminRoot}/${id}/edit`, { body: editBody(approved.data.monthlyQuiz.quiz.updatedAt) })).status,
      409,
    );
    const published = await request(`${adminRoot}/${id}/publish`, {
      body: { expectedUpdatedAt: approved.data.monthlyQuiz.quiz.updatedAt },
    });
    assert.equal(published.status, 200, JSON.stringify(published.data));
    assert.equal(
      (await request(`${adminRoot}/${id}/edit`, { body: editBody(published.data.monthlyQuiz.quiz.updatedAt) })).status,
      409,
    );
    await assert.rejects(
      db.quizQuestion.update({
        where: { id: published.data.monthlyQuiz.quiz.questions[0].id },
        data: { text: 'Tampered' },
      }),
    );
    const listing = await request(
      `${adminRoot}?period=${period}&status=PUBLISHED&search=Synthetic&sort=period_desc&pageSize=1`,
    );
    assert.equal(listing.data.items[0].id, id);
    assert.equal(listing.data.hasMore, false);
    for (const query of ['status=INVALID', 'sort=wrong', 'page=0', 'pageSize=51', 'period=2026-13'])
      assert.equal((await request(`${adminRoot}?${query}`)).status, 400);
  });
  await t.test('employee delivery omits keys; ownership and eligibility enforced', async () => {
    const listing = await request(ownRoot, { actor: employee });
    assert.equal(listing.status, 200);
    assert.equal(listing.data.items[0].id, id);
    const detail = await request(`${ownRoot}/${id}`, { actor: employee });
    assert.equal(detail.status, 200);
    assert.equal(detail.cache, 'no-store');
    assert.equal(detail.data.availability, 'OPEN');
    assert.deepEqual(detail.data.topics, ['MFA', 'PHISHING']);
    assert.doesNotMatch(JSON.stringify(detail.data), /isCorrect|correctOption|explanation|approvedBy|email|password/i);
    assert.equal((await request(`${ownRoot}/${id}`, { actor: null })).status, 401);
    assert.equal((await request(`${ownRoot}/${id}`, { actor: admin })).status, 403);
    assert.equal(
      (await request(`${ownRoot}/${id}/attempts`, { actor: other, body: { employeeId: employee.id } })).status,
      400,
    );
  });
  const started = await request(`${ownRoot}/${id}/attempts`, { actor: employee, body: {} });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  await t.test('weighted scoring, duplicate submission, retry and isolation', async () => {
    const same = await request(`${ownRoot}/${id}/attempts`, { actor: employee, body: {} });
    assert.equal(same.data.attempt.id, started.data.attempt.id);
    const questions = started.data.quiz.questions;
    const bad = questions.map((q) => ({
      questionId: q.id,
      selectedOptionId: q.options[q.type === 'TRUE_FALSE' ? 0 : 1].id,
    }));
    const path = `${ownRoot}/${id}/attempts/${started.data.attempt.id}/submit`;
    assert.equal((await request(path, { actor: other, body: { answers: bad } })).status, 404);
    assert.equal((await request(path, { actor: employee, body: { answers: [bad[0]] } })).status, 400);
    assert.equal((await request(path, { actor: employee, body: { answers: [bad[0], bad[0]] } })).status, 400);
    assert.equal(
      (
        await request(path, {
          actor: employee,
          body: { answers: [{ ...bad[0], selectedOptionId: randomUUID() }, bad[1]] },
        })
      ).status,
      400,
    );
    assert.equal((await request(path, { actor: employee, body: { answers: bad, scorePercent: 100 } })).status, 400);
    const concurrent = await Promise.all([
      request(path, { actor: employee, body: { answers: bad } }),
      request(path, { actor: employee, body: { answers: bad } }),
    ]);
    assert.ok(
      concurrent.every((response) => response.status === 200),
      JSON.stringify(concurrent),
    );
    const failed = concurrent[0];
    assert.equal(concurrent[1].data.attempt.id, failed.data.attempt.id);
    assert.equal(failed.data.attempt.passed, false);
    assert.equal(Number(failed.data.attempt.scorePercent), 0);
    assert.equal(
      (await request(path, { actor: employee, body: { answers: bad } })).data.attempt.id,
      started.data.attempt.id,
    );
    const altered = questions.map((q) => ({ questionId: q.id, selectedOptionId: q.options[0].id }));
    assert.equal((await request(path, { actor: employee, body: { answers: altered } })).status, 409);
    const retry = await request(`${ownRoot}/${id}/attempts`, { actor: employee, body: {} });
    assert.equal(retry.data.attempt.attemptNumber, 2);
    const correct = retry.data.quiz.questions.map((q) => ({
      questionId: q.id,
      selectedOptionId: q.options[q.type === 'TRUE_FALSE' ? 1 : 0].id,
    }));
    const passed = await request(`${ownRoot}/${id}/attempts/${retry.data.attempt.id}/submit`, {
      actor: employee,
      body: { answers: correct },
    });
    assert.equal(passed.status, 200, JSON.stringify(passed.data));
    assert.equal(passed.data.attempt.passed, true);
    assert.equal(Number(passed.data.attempt.scorePercent), 100);
    assert.equal((await request(`${ownRoot}/${id}/attempts/${retry.data.attempt.id}`, { actor: other })).status, 404);
    assert.equal(
      (await request(`${ownRoot}/${id}/attempts/${retry.data.attempt.id}`, { actor: employee })).data.answers.length,
      2,
    );
    assert.equal((await request(`${ownRoot}/${id}/attempts`, { actor: employee, body: {} })).status, 409);
    // BUG-018: once passed, the employee is shown no remaining attempts (the server refuses another one).
    const afterPass = await request(`${ownRoot}/${id}`, { actor: employee });
    assert.deepEqual([afterPass.data.passed, afterPass.data.attemptsRemaining], [true, 0]);
    const listed = (await request(ownRoot, { actor: employee })).data.items.find((item) => item.id === id);
    assert.deepEqual([listed.passed, listed.attemptsRemaining], [true, 0]);
    assert.equal((await request(`${ownRoot}/${id}`, { actor: other })).data.passed, false);
    assert.equal(await db.trainingProgress.count({ where: { qualifyingAttemptId: retry.data.attempt.id } }), 0);
    await assert.rejects(db.quizAttempt.update({ where: { id: retry.data.attempt.id }, data: { earnedPoints: 999 } }));
  });
  await t.test('attempt limit, participation reporting and minimal identity', async () => {
    for (let number = 1; number <= 2; number++) {
      const attempt = await request(`${ownRoot}/${id}/attempts`, { actor: other, body: {} });
      assert.equal(attempt.data.attempt.attemptNumber, number);
      const bad = attempt.data.quiz.questions.map((q) => ({ questionId: q.id, selectedOptionId: q.options[0].id }));
      bad[1].selectedOptionId = attempt.data.quiz.questions[1].options[1].id;
      const failed = await request(`${ownRoot}/${id}/attempts/${attempt.data.attempt.id}/submit`, {
        actor: other,
        body: { answers: bad },
      });
      assert.equal(failed.data.attempt.passed, false);
    }
    assert.equal((await request(`${ownRoot}/${id}/attempts`, { actor: other, body: {} })).status, 409);
    const report = await request(`${adminRoot}/${id}/report?pageSize=1`);
    assert.equal(report.status, 200);
    assert.equal(report.data.items.length, 1);
    assert.equal(report.data.hasMore, true);
    assert.equal(report.data.participation.startedEmployees, 2);
    assert.equal(report.data.participation.submittedEmployees, 2);
    // BUG-005: "in progress" counts open attempts, not active employees; "expected" covers employees who never started.
    assert.equal(report.data.participation.inProgressEmployees, 0);
    assert.ok(report.data.participation.expectedEmployees >= report.data.participation.startedEmployees);
    const open = await request(`${ownRoot}/${id}/attempts`, { actor: third, body: {} });
    assert.equal(open.status, 200, JSON.stringify(open.data));
    const during = await request(`${adminRoot}/${id}/report`);
    assert.deepEqual(
      [
        during.data.participation.startedEmployees,
        during.data.participation.inProgressEmployees,
        during.data.participation.submittedEmployees,
      ],
      [3, 1, 2],
    );
    assert.doesNotMatch(JSON.stringify(report.data), /email|password|isCorrect|explanation/i);
  });
  await t.test('monthly score history uses best submitted result and prior recorded month', async () => {
    const prior = new Date(Date.UTC(year, monthIndex - 1, 1));
    const previousQuiz = await db.quiz.create({
      data: {
        kind: 'MONTHLY',
        title: 'Synthetic previous month',
        passingPercent: 75,
        maxAttempts: 2,
        createdById: admin.id,
      },
    });
    quizIds.push(previousQuiz.id);
    const previous = await db.monthlyQuiz.create({
      data: {
        period: prior,
        opensAt: prior,
        closesAt: new Date(Date.UTC(year, monthIndex, 1)),
        quizId: previousQuiz.id,
      },
    });
    monthlyIds.push(previous.id);
    const question = await db.quizQuestion.create({
      data: {
        quizId: previousQuiz.id,
        text: 'Historical question',
        type: 'TRUE_FALSE',
        explanation: 'Historical explanation',
        topic: 'MFA',
        points: 1,
        position: 0,
        options: {
          create: [
            { text: 'True', position: 0, isCorrect: true },
            { text: 'False', position: 1, isCorrect: false },
          ],
        },
      },
      include: { options: true },
    });
    await db.quiz.update({
      where: { id: previousQuiz.id },
      data: { status: 'APPROVED', approvedById: admin.id, approvedAt: prior },
    });
    await db.quiz.update({ where: { id: previousQuiz.id }, data: { status: 'PUBLISHED', publishedAt: prior } });
    const assignment = await db.monthlyQuizAssignment.create({
      data: { monthlyQuizId: previous.id, employeeId: employee.id, assignedById: admin.id },
    });
    const attempt = await db.quizAttempt.create({
      data: {
        quizId: previousQuiz.id,
        employeeId: employee.id,
        monthlyAssignmentId: assignment.id,
        attemptNumber: 1,
        passingPercent: 75,
      },
    });
    await db.quizAnswer.create({
      data: {
        attemptId: attempt.id,
        questionId: question.id,
        selectedOptionId: question.options.find((o) => !o.isCorrect).id,
        awardedPoints: 0,
      },
    });
    await db.quizAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: prior,
        earnedPoints: 0,
        possiblePoints: 1,
        scorePercent: 0,
        passed: false,
      },
    });
    const history = await request(`${ownRoot}/history?pageSize=1`, { actor: employee });
    assert.equal(history.status, 200, JSON.stringify(history.data));
    assert.equal(history.data.items[0].period, period);
    assert.equal(history.data.items[0].attemptCount, 2);
    assert.equal(Number(history.data.items[0].bestAttempt.scorePercent), 100);
    assert.equal(history.data.items[0].deltaPointsFromPreviousRecordedMonth, 100);
    assert.equal(history.data.hasMore, true);
    const older = await request(`${ownRoot}/history?page=2&pageSize=1`, { actor: employee });
    assert.equal(older.data.items[0].period, prior.toISOString().slice(0, 7));
    assert.equal(older.data.items[0].deltaPointsFromPreviousRecordedMonth, null);
    assert.equal((await request(`${ownRoot}/history`, { actor: other })).data.items.length, 1);
    const detail = await request(`${ownRoot}/${previous.id}`, { actor: employee });
    assert.equal(detail.data.availability, 'CLOSED');
    assert.equal(detail.data.quiz, null);
    assert.equal((await request(`${ownRoot}/${previous.id}/attempts`, { actor: employee, body: {} })).status, 409);
  });
  await t.test('archiving stops new attempts but preserves own submitted review', async () => {
    const current = (await request(`${adminRoot}/${id}`)).data.monthlyQuiz.quiz;
    const archived = await request(`${adminRoot}/${id}/archive`, { body: { expectedUpdatedAt: current.updatedAt } });
    assert.equal(archived.status, 200, JSON.stringify(archived.data));
    assert.equal((await request(`${ownRoot}/${id}/attempts`, { actor: employee, body: {} })).status, 409);
    assert.equal((await request(`${ownRoot}/${id}`, { actor: employee })).data.quiz, null);
    const ownAttempt = await db.quizAttempt.findFirst({ where: { quizId, employeeId: employee.id, passed: true } });
    assert.equal((await request(`${ownRoot}/${id}/attempts/${ownAttempt.id}`, { actor: employee })).status, 200);
    const logs = await db.auditLog.findMany({ where: { resourceId: id } });
    assert.ok(logs.some((log) => log.action === 'MONTHLY_QUIZ_PUBLISH'));
    assert.doesNotMatch(
      JSON.stringify(logs.map((log) => log.metadata)),
      /Report it|Historical question|selectedOptionId/,
    );
  });
});
