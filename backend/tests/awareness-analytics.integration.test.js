import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { awarenessFilters, AwarenessAnalyticsError } from '../src/analytics/awareness-policy.js';

test('Phase 13C1 UTC awareness filters are bounded and reject incompatible values', () => {
  const now = new Date('2026-10-11T13:00:00Z');
  assert.equal(awarenessFilters({}, now).days, 90);
  assert.equal(awarenessFilters({ period: 'custom', start: '2091-01-01', end: '2091-02-28', monthlyPeriod: '2091-02' }, now).days, 59);
  for (const query of [{ period: '7d' }, { period: '365d', start: '2026-01-01' },
    { period: 'custom', start: '2091-02-30', end: '2091-03-01' },
    { period: 'custom', start: '2091-01-01', end: '2092-01-03' },
    { period: 'custom', start: '2091-02-01', end: '2091-01-31' },
    { period: 'custom', start: '2091-01-01', end: '2091-02-28', monthlyPeriod: '2091-03' },
    { completionStatus: 'PASSED' }, { departmentId: 'someone-else' }, { employeeId: randomUUID() }])
    assert.throws(() => awarenessFilters(query, now), AwarenessAnalyticsError);
});

test('Phase 13C1 awareness aggregates use authorized PostgreSQL records and preserve history', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient();
  const ids = { users: [], departments: [], programs: [], assignments: [], progresses: [], quizzes: [],
    trainingQuizzes: [], monthly: [], monthlyAssignments: [], questions: [], attempts: [] };
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-awareness-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    try { await db.$transaction(async (tx) => {
      for (const [table, trigger] of [['quiz_answers', 'answer_history'], ['quiz_attempts', 'submitted_history'],
        ['quiz_options', 'option_history'], ['quiz_questions', 'question_history']])
        await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
      await tx.certificate.deleteMany({ where: { progressId: { in: ids.progresses } } });
      await tx.quizAnswer.deleteMany({ where: { attemptId: { in: ids.attempts } } });
      await tx.quizAttempt.deleteMany({ where: { id: { in: ids.attempts } } });
      await tx.quizOption.deleteMany({ where: { questionId: { in: ids.questions } } });
      await tx.quizQuestion.deleteMany({ where: { id: { in: ids.questions } } });
      await tx.trainingProgress.deleteMany({ where: { id: { in: ids.progresses } } });
      await tx.monthlyQuizAssignment.deleteMany({ where: { id: { in: ids.monthlyAssignments } } });
      await tx.monthlyQuiz.deleteMany({ where: { id: { in: ids.monthly } } });
      await tx.trainingQuiz.deleteMany({ where: { id: { in: ids.trainingQuizzes } } });
      await tx.quiz.deleteMany({ where: { id: { in: ids.quizzes } } });
      await tx.trainingAssignment.deleteMany({ where: { id: { in: ids.assignments } } });
      await tx.trainingProgram.deleteMany({ where: { id: { in: ids.programs } } });
      await tx.user.deleteMany({ where: { id: { in: ids.users } } });
      await tx.department.deleteMany({ where: { id: { in: ids.departments } } });
      for (const [table, trigger] of [['quiz_answers', 'answer_history'], ['quiz_attempts', 'submitted_history'],
        ['quiz_options', 'option_history'], ['quiz_questions', 'question_history']])
        await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
    }, { timeout: 20000 }); } finally { await db.$disconnect(); }
  });
  async function department() {
    const row = await db.department.create({ data: { name: `Synthetic Analytics ${randomUUID()}`, code: randomUUID().slice(0, 20) } });
    ids.departments.push(row.id); return row;
  }
  async function user(role = 'EMPLOYEE', departmentId = null, mfa = true) {
    const row = await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Awareness',
      email: `${randomUUID()}@example.invalid`, status: 'ACTIVE', passwordHash: 'synthetic',
      ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
      role: { connect: { name: role } }, ...(role === 'IT_SECURITY_ADMIN' && mfa ?
        { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}) } });
    ids.users.push(row.id); return row;
  }
  async function request(query = '?period=custom&start=2091-01-01&end=2091-02-28', actor = admin, origin = config.frontendUrl, mfa = true) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/analytics/awareness${query}`, {
      headers: { Origin: origin, ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, mfa ? actor.mfaEnabledAt : null)}` } : {}) } });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  const largeDepartment = await department(), smallDepartment = await department();
  const admin = await user('IT_SECURITY_ADMIN'), noMfa = await user('IT_SECURITY_ADMIN', null, false);
  const employees = [];
  for (let index = 0; index < 5; index++) employees.push(await user('EMPLOYEE', largeDepartment.id));
  const smallEmployee = await user('EMPLOYEE', smallDepartment.id);
  await t.test('administrator role, MFA, origin, range and small-group enforcement', async () => {
    assert.equal((await request(undefined, null)).status, 401);
    assert.equal((await request(undefined, employees[0])).status, 403);
    assert.equal((await request(undefined, noMfa)).status, 401);
    assert.equal((await request(undefined, admin, config.frontendUrl, false)).status, 401);
    assert.equal((await request(undefined, admin, 'https://evil.invalid')).status, 403);
    assert.equal((await request('?period=custom&start=2091-01-01&end=2092-02-01')).status, 400);
    assert.equal((await request(`?period=custom&start=2091-01-01&end=2091-02-28&departmentId=${smallDepartment.id}`)).status, 400);
  });
  // totalIssued is an all-time count, so measure it relative to records that existed before these fixtures.
  const certificatesBefore = (await request()).data.certificates.totalIssued;
  async function program(requiresQuiz) {
    const row = await db.trainingProgram.create({ data: { title: `Synthetic ${requiresQuiz ? 'Quiz' : 'Material'} ${randomUUID()}`,
      description: 'Synthetic training', topic: 'PHISHING', learningObjectives: ['Recognize threats'],
      content: { version: 1, sections: [{ key: 'one', title: 'One', body: 'Synthetic' }, { key: 'two', title: 'Two', body: 'Synthetic' }] },
      status: 'PUBLISHED', requiresQuiz, createdById: admin.id, reviewedById: admin.id,
      reviewedAt: new Date('2090-12-01T00:00:00Z'), publishedAt: new Date('2090-12-01T00:00:00Z') } });
    ids.programs.push(row.id); return row;
  }
  const material = await program(false), courseProgram = await program(true);
  async function assignment(trainingId, employeeId, day, status = 'NOT_STARTED') {
    const row = await db.trainingAssignment.create({ data: { trainingId, employeeId, assignedById: admin.id,
      createdAt: new Date(`2091-01-${String(day).padStart(2, '0')}T08:00:00Z`) } });
    ids.assignments.push(row.id);
    if (status !== 'NOT_STARTED') {
      const progress = await db.trainingProgress.create({ data: { assignmentId: row.id, status,
        progressPercent: status === 'COMPLETED' ? 100 : 50,
        completedSectionKeys: status === 'COMPLETED' ? ['one', 'two'] : ['one'],
        startedAt: new Date('2091-01-02T09:00:00Z'),
        ...(status === 'COMPLETED' ? { materialCompletedAt: new Date('2091-01-03T09:00:00Z'),
          completedAt: new Date('2091-01-03T10:00:00Z') } : {}) } }); ids.progresses.push(progress.id);
      return { row, progress };
    }
    return { row };
  }
  const completed = await assignment(material.id, employees[0].id, 1, 'COMPLETED');
  await assignment(material.id, employees[1].id, 1, 'IN_PROGRESS');
  await assignment(material.id, employees[2].id, 1);
  const courseAssignment = await assignment(courseProgram.id, employees[0].id, 2, 'IN_PROGRESS');
  await db.certificate.create({ data: { progressId: completed.progress.id, employeeName: 'Synthetic Awareness',
    trainingTitle: material.title, completedAt: new Date('2091-01-03T10:00:00Z'), issuedAt: new Date('2091-01-04T10:00:00Z') } });
  async function quiz(kind, monthlyPeriod = null) {
    const row = await db.quiz.create({ data: { kind, title: `Synthetic ${kind} ${randomUUID()}`,
      createdById: admin.id, passingPercent: 75, maxAttempts: 3 } }); ids.quizzes.push(row.id);
    const question = await db.quizQuestion.create({ data: { quizId: row.id, text: 'Synthetic question',
      type: 'TRUE_FALSE', topic: 'PHISHING', explanation: 'Synthetic explanation', points: 1, position: 0,
      options: { create: [{ text: 'True', position: 0, isCorrect: true }, { text: 'False', position: 1, isCorrect: false }] } }, include: { options: true } });
    ids.questions.push(question.id);
    await db.quiz.update({ where: { id: row.id }, data: { status: 'PUBLISHED', approvedById: admin.id,
      approvedAt: new Date('2090-12-01T00:00:00Z'), publishedAt: new Date('2090-12-01T00:00:00Z') } });
    if (kind === 'COURSE') {
      const binding = await db.trainingQuiz.create({ data: { trainingId: courseProgram.id, quizId: row.id } });
      ids.trainingQuizzes.push(binding.id);
      return { quiz: row, question };
    }
    const period = new Date(`${monthlyPeriod}-01T00:00:00Z`);
    const monthly = await db.monthlyQuiz.create({ data: { quizId: row.id, period, opensAt: period,
      closesAt: new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1)) } });
    ids.monthly.push(monthly.id); return { quiz: row, question, monthly };
  }
  async function submit({ quiz: quizRow, question }, employeeId, attemptNumber, correct, link, submittedAt) {
    const attempt = await db.quizAttempt.create({ data: { quizId: quizRow.id, employeeId, attemptNumber,
      passingPercent: 75, ...link } }); ids.attempts.push(attempt.id);
    await db.quizAnswer.create({ data: { attemptId: attempt.id, questionId: question.id,
      selectedOptionId: question.options.find((option) => option.isCorrect === correct).id,
      awardedPoints: correct ? 1 : 0 } });
    await db.quizAttempt.update({ where: { id: attempt.id }, data: { status: 'SUBMITTED', submittedAt,
      earnedPoints: correct ? 1 : 0, possiblePoints: 1, scorePercent: correct ? 100 : 0, passed: correct } });
  }
  const course = await quiz('COURSE');
  await submit(course, employees[0].id, 1, false, { trainingAssignmentId: courseAssignment.row.id }, new Date('2091-01-06T09:00:00Z'));
  await submit(course, employees[0].id, 2, true, { trainingAssignmentId: courseAssignment.row.id }, new Date('2091-01-07T09:00:00Z'));
  const jan = await quiz('MONTHLY', '2091-01'), feb = await quiz('MONTHLY', '2091-02');
  async function monthlyAssignment(monthlyQuizId, employeeId) {
    const row = await db.monthlyQuizAssignment.create({ data: { monthlyQuizId, employeeId, assignedById: admin.id } });
    ids.monthlyAssignments.push(row.id); return row;
  }
  const janA = await monthlyAssignment(jan.monthly.id, employees[0].id), janB = await monthlyAssignment(jan.monthly.id, employees[1].id);
  const febA = await monthlyAssignment(feb.monthly.id, employees[0].id);
  await submit(jan, employees[0].id, 1, false, { monthlyAssignmentId: janA.id }, new Date('2091-01-08T10:00:00Z'));
  await submit(jan, employees[0].id, 2, true, { monthlyAssignmentId: janA.id }, new Date('2091-01-09T10:00:00Z'));
  await submit(jan, employees[1].id, 1, false, { monthlyAssignmentId: janB.id }, new Date('2091-01-10T10:00:00Z'));
  await submit(feb, employees[0].id, 1, false, { monthlyAssignmentId: febA.id }, new Date('2091-02-08T10:00:00Z'));
  await t.test('assignment denominator, attempt versus participant and monthly best scores', async () => {
    const response = await request(); assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.match(response.cache, /private.*no-store/);
    const { training, courseQuizzes, monthlyQuizzes, certificates, departments } = response.data;
    assert.deepEqual([training.assignedPrograms, training.assignments, training.assignedEmployees,
      training.completed, training.inProgress, training.notStarted, training.completionRatePercent, training.completedDuring],
    [2, 4, 3, 1, 2, 1, 25, 1]);
    assert.deepEqual([courseQuizzes.submittedAttempts, courseQuizzes.uniqueParticipants,
      courseQuizzes.passedAttempts, courseQuizzes.failedAttempts, courseQuizzes.passRatePercent,
      courseQuizzes.averageScorePercent], [2, 1, 1, 1, 50, 50]);
    assert.deepEqual([monthlyQuizzes.assignedAssignments, monthlyQuizzes.submittedAssignments,
      monthlyQuizzes.averageBestScorePercent], [3, 3, 33.33]);
    assert.deepEqual(monthlyQuizzes.trend.map((row) => [row.period, row.assigned, row.submitted,
      row.averageScorePercent, row.averageChangePoints]),
    [['2091-01', 2, 2, 50, null], ['2091-02', 1, 1, 0, -50]]);
    assert.deepEqual([certificates.totalIssued - certificatesBefore, certificates.issuedDuring], [1, 1]);
    assert.equal(departments.suppressed, true); assert.deepEqual(departments.rows, []);
    assert.deepEqual(response.data.filterOptions.departments, [{ id: largeDepartment.id, name: largeDepartment.name }]);
    assert.doesNotMatch(JSON.stringify(response.data), /example.invalid|passwordHash|Synthetic explanation|isCorrect|selectedOptionId|employeeId/);
  });
  await t.test('program, status, department and monthly period filters have documented scopes', async () => {
    const base = '?period=custom&start=2091-01-01&end=2091-02-28';
    const programResult = (await request(`${base}&programId=${material.id}`)).data;
    assert.equal(programResult.training.assignments, 3);
    assert.equal(programResult.courseQuizzes.submittedAttempts, 0);
    assert.equal(programResult.certificates.issuedDuring, 1);
    assert.equal(programResult.monthlyQuizzes.submittedAssignments, 3);
    const completedResult = (await request(`${base}&completionStatus=COMPLETED`)).data;
    assert.equal(completedResult.training.assignments, 1);
    assert.equal(completedResult.courseQuizzes.submittedAttempts, 2);
    const monthlyResult = (await request(`${base}&monthlyPeriod=2091-01`)).data;
    assert.equal(monthlyResult.monthlyQuizzes.months, 1);
    const departmentResult = await request(`${base}&departmentId=${largeDepartment.id}`);
    assert.equal(departmentResult.status, 200);
    assert.equal(departmentResult.data.training.assignments, 4);
    assert.equal(departmentResult.data.monthlyQuizzes.submittedAssignments, 3);
    assert.equal(smallEmployee.departmentId, smallDepartment.id);
  });
  await t.test('empty period gives zero counts and null rates', async () => {
    const response = await request('?period=custom&start=2092-01-01&end=2092-01-31');
    assert.equal(response.status, 200);
    assert.equal(response.data.training.assignments, 0);
    assert.equal(response.data.training.completionRatePercent, null);
    assert.equal(response.data.courseQuizzes.averageScorePercent, null);
    assert.equal(response.data.monthlyQuizzes.averageBestScorePercent, null);
    assert.deepEqual(response.data.monthlyQuizzes.trend, []);
    assert.equal(response.data.certificates.totalIssued, certificatesBefore + 1);
    assert.equal(response.data.certificates.issuedDuring, 0);
  });
  await t.test('department comparison remains private with sparse assignment and score cells', async () => {
    for (let index = 0; index < 4; index++) await user('EMPLOYEE', smallDepartment.id);
    const response = await request(); assert.equal(response.status, 200);
    if (response.data.departments.suppressed) {
      assert.deepEqual(response.data.departments.rows, []);
      return;
    }
    const row = response.data.departments.rows.find((item) => item.id === largeDepartment.id);
    assert.equal(row.activeEmployeesNow, 5);
    assert.equal(row.trainingAssignments, null);
    assert.equal(row.completionRatePercent, null);
    assert.equal(row.monthlyAverageScorePercent, null);
  });
});
