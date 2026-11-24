import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { databaseUrl } from '../src/config/env.js';
import { createDatabaseClient } from '../src/config/database.js';

// Opt-in integration suite. All fixture writes roll back, including on failure.
test('PostgreSQL architecture invariants', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Local test database required');
  assert.equal(url.pathname, '/ewaguard_ai', 'Explicit development database required');
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  t.after(async () => {
    await client.query('ROLLBACK');
    await client.end();
  });
  await client.query('BEGIN');
  const now = new Date();
  const expiresAt = new Date(Date.now() + 86400000);
  // Table/column names below are exclusively developer-authored test constants.
  async function insert(table, data, mutable = true) {
    const row = { id: randomUUID(), ...data, ...(mutable ? { updatedAt: now } : {}) };
    const keys = Object.keys(row);
    const result = await client.query(
      `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      Object.values(row),
    );
    return result.rows[0];
  }
  async function reject(name, operation, code = '23514') {
    await t.test(name, async () => {
      await client.query('SAVEPOINT negative_case');
      try {
        await assert.rejects(operation, { code });
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT negative_case');
      }
    });
  }
  const role = (await client.query("SELECT id FROM roles WHERE name = 'EMPLOYEE'")).rows[0];
  assert.ok(role, 'Run development reference seed first');
  const department = (await client.query("SELECT id FROM departments WHERE code = 'IT'")).rows[0];
  const employee = await insert('users', {
    email: `${randomUUID()}@example.invalid`,
    firstName: 'Test',
    lastName: 'Employee',
    roleId: role.id,
    departmentId: department.id,
  });
  const other = await insert('users', {
    email: `${randomUUID()}@example.invalid`,
    firstName: 'Test',
    lastName: 'Other',
    roleId: role.id,
  });
  await reject('email normalization prevents case variants', () =>
    insert('users', { email: 'Mixed@Example.invalid', firstName: 'Test', lastName: 'Case', roleId: role.id }),
  );
  await reject('active accounts require a password hash', () =>
    client.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [employee.id]),
  );

  const ack = await insert(
    'disclaimer_acknowledgements',
    { userId: employee.id, version: 'test-v1', context: 'EMAIL_ANALYSIS' },
    false,
  );
  const email = await insert('email_analyses', { userId: employee.id, acknowledgementId: ack.id, expiresAt });
  await reject('analysis requires acknowledgement owner', () =>
    insert('email_analyses', { userId: other.id, acknowledgementId: ack.id, expiresAt }),
  );
  const urlAck = await insert(
    'disclaimer_acknowledgements',
    { userId: employee.id, version: 'test-v1', context: 'URL_ANALYSIS' },
    false,
  );
  await reject('analysis requires acknowledgement context', () =>
    insert('email_analyses', { userId: employee.id, acknowledgementId: urlAck.id, expiresAt }),
  );
  // Migrations 20261017000100/200 made the per-submission acknowledgement optional for URL and file analysis.
  await t.test('URL analysis no longer requires an acknowledgement', async () => {
    const row = await insert('url_analyses', {
      userId: employee.id,
      hostname: 'example.invalid',
      urlSha256: 'a'.repeat(64),
      expiresAt,
    });
    assert.equal(row.acknowledgementId, null);
  });
  await reject('analysis risk cannot be partly populated', () =>
    client.query('UPDATE email_analyses SET "riskScore" = 50 WHERE id = $1', [email.id]),
  );
  const incident = await insert('incidents', {
    reporterId: employee.id,
    title: 'Test incident',
    description: 'Synthetic test evidence',
    severity: 'HIGH',
    riskScore: 80,
    riskRuleVersion: 'test-v1',
    type: 'PHISHING',
    detectionSource: 'EMAIL_ANALYSIS',
  });
  await insert('incident_events', { incidentId: incident.id, actorId: employee.id, type: 'CREATED' }, false);
  await reject('risk scores are bounded', () =>
    client.query('UPDATE incidents SET "riskScore" = 101 WHERE id = $1', [incident.id]),
  );
  await reject(
    'incident history blocks cascading deletion',
    () => client.query('DELETE FROM incidents WHERE id = $1', [incident.id]),
    '23001',
  );
  await insert(
    'incident_evidence',
    { incidentId: incident.id, emailAnalysisId: email.id, summary: 'Minimized evidence', snapshot: '{}' },
    false,
  );
  await client.query('DELETE FROM email_analyses WHERE id = $1', [email.id]);
  await t.test('evidence snapshot survives source retention cleanup', async () => {
    const row = (await client.query('SELECT * FROM incident_evidence WHERE "incidentId" = $1', [incident.id])).rows[0];
    assert.equal(row.emailAnalysisId, null);
    assert.equal(row.summary, 'Minimized evidence');
  });
  await reject('active knowledge must be approved', () =>
    insert('knowledge_documents', {
      kind: 'PDPL',
      documentKey: randomUUID(),
      title: 'Test draft',
      source: 'example.invalid',
      uploadedById: employee.id,
      active: true,
    }),
  );

  const training = await insert('training_programs', {
    title: 'Test course',
    description: 'Test only',
    topic: 'PHISHING',
    learningObjectives: ['Recognize warning signs'],
    content: '{}',
    createdById: employee.id,
  });
  const assignment = await insert('training_assignments', {
    employeeId: employee.id,
    trainingId: training.id,
    assignedById: employee.id,
  });
  const progress = await insert('training_progress', { assignmentId: assignment.id });
  await reject(
    'assignment is unique per employee/course',
    () =>
      insert('training_assignments', { employeeId: employee.id, trainingId: training.id, assignedById: employee.id }),
    '23505',
  );
  const quiz = await insert('quizzes', { kind: 'COURSE', title: 'Test quiz', createdById: employee.id });
  await insert('training_quizzes', { trainingId: training.id, quizId: quiz.id });
  const question = await insert('quiz_questions', {
    quizId: quiz.id,
    text: 'Synthetic question',
    type: 'MULTIPLE_CHOICE',
    explanation: 'Synthetic explanation',
    topic: 'PHISHING',
    position: 0,
    origin: 'AI_DRAFT',
  });
  const correct = await insert('quiz_options', {
    questionId: question.id,
    text: 'Correct',
    position: 0,
    isCorrect: true,
  });
  await insert('quiz_options', { questionId: question.id, text: 'Incorrect', position: 1 });
  await reject('quiz publication requires approval', () =>
    client.query('UPDATE quizzes SET status = \'PUBLISHED\', "publishedAt" = $2 WHERE id = $1', [quiz.id, now]),
  );
  await reject('AI questions require review before publication', () =>
    client.query(
      'UPDATE quizzes SET status = \'PUBLISHED\', "publishedAt" = $2, "approvedById" = $3, "approvedAt" = $2 WHERE id = $1',
      [quiz.id, now, employee.id],
    ),
  );
  await client.query('UPDATE quiz_questions SET "reviewedById" = $2, "reviewedAt" = $3 WHERE id = $1', [
    question.id,
    employee.id,
    now,
  ]);
  await client.query(
    'UPDATE quizzes SET status = \'PUBLISHED\', "publishedAt" = $2, "approvedById" = $3, "approvedAt" = $2 WHERE id = $1',
    [quiz.id, now, employee.id],
  );
  await reject('published quiz content is immutable', () =>
    client.query('UPDATE quiz_options SET "isCorrect" = false WHERE id = $1', [correct.id]),
  );
  const attemptData = {
    quizId: quiz.id,
    employeeId: employee.id,
    trainingAssignmentId: assignment.id,
    attemptNumber: 1,
    passingPercent: 80,
  };
  await reject('cross-user attempt rejected', () => insert('quiz_attempts', { ...attemptData, employeeId: other.id }));
  const attempt = await insert('quiz_attempts', attemptData);
  const anotherQuiz = await insert('quizzes', { kind: 'MONTHLY', title: 'Monthly test', createdById: employee.id });
  await reject('course/monthly quiz bindings cannot be interchanged', () =>
    insert('monthly_quizzes', { quizId: quiz.id, period: '2099-01-01', opensAt: now, closesAt: expiresAt }),
  );
  const monthly = await insert('monthly_quizzes', {
    quizId: anotherQuiz.id,
    period: '2099-01-01',
    opensAt: now,
    closesAt: expiresAt,
  });
  const monthlyAssignment = await insert('monthly_quiz_assignments', {
    monthlyQuizId: monthly.id,
    employeeId: employee.id,
    assignedById: employee.id,
  });
  await reject('monthly attempts validate employee ownership', () =>
    insert('quiz_attempts', {
      quizId: anotherQuiz.id,
      employeeId: other.id,
      monthlyAssignmentId: monthlyAssignment.id,
      attemptNumber: 1,
      passingPercent: 80,
    }),
  );
  const foreignQuestion = await insert('quiz_questions', {
    quizId: anotherQuiz.id,
    text: 'Other',
    type: 'TRUE_FALSE',
    explanation: 'Test',
    topic: 'MFA',
    position: 0,
  });
  const foreignOption = await insert('quiz_options', {
    questionId: foreignQuestion.id,
    text: 'True',
    position: 0,
    isCorrect: true,
  });
  await reject('answers cannot select another question option', () =>
    insert('quiz_answers', { attemptId: attempt.id, questionId: question.id, selectedOptionId: foreignOption.id }),
  );
  await insert('quiz_answers', {
    attemptId: attempt.id,
    questionId: question.id,
    selectedOptionId: correct.id,
    awardedPoints: 1,
  });
  await reject('submitted score must agree with earned points', () =>
    client.query(
      'UPDATE quiz_attempts SET status = \'SUBMITTED\', "submittedAt" = $2, "earnedPoints" = 1, "possiblePoints" = 1, "scorePercent" = 50, passed = true WHERE id = $1',
      [attempt.id, now],
    ),
  );
  await client.query(
    'UPDATE quiz_attempts SET status = \'SUBMITTED\', "submittedAt" = $2, "earnedPoints" = 1, "possiblePoints" = 1, "scorePercent" = 100, passed = true WHERE id = $1',
    [attempt.id, now],
  );
  await reject('submitted historical score is immutable', () =>
    client.query('UPDATE quiz_attempts SET "scorePercent" = 0 WHERE id = $1', [attempt.id]),
  );
  const certificateData = {
    progressId: progress.id,
    certificateNumber: randomUUID(),
    completedAt: now,
    employeeName: 'Test Employee',
    trainingTitle: 'Test course',
    scorePercent: 100,
  };
  await reject('certificate requires completed progress', () => insert('certificates', certificateData));
  await reject('page access cannot complete training', () =>
    client.query('UPDATE training_progress SET status = \'COMPLETED\', "completedAt" = $2 WHERE id = $1', [
      progress.id,
      now,
    ]),
  );
  await reject('quiz-required completion needs passing attempt', () =>
    client.query(
      'UPDATE training_progress SET status = \'COMPLETED\', "completedAt" = $2, "startedAt" = $2, "materialCompletedAt" = $2, "progressPercent" = 100 WHERE id = $1',
      [progress.id, now],
    ),
  );
  await client.query(
    'UPDATE training_progress SET status = \'COMPLETED\', "completedAt" = $2, "startedAt" = $2, "materialCompletedAt" = $2, "progressPercent" = 100, "qualifyingAttemptId" = $3 WHERE id = $1',
    [progress.id, now, attempt.id],
  );
  await t.test('valid completed course can receive certificate', async () => {
    const certificate = await insert('certificates', certificateData);
    assert.equal(certificate.progressId, progress.id);
  });
  const postAck = await insert(
    'disclaimer_acknowledgements',
    { userId: employee.id, version: 'test-v1', context: 'COMMUNITY_POST' },
    false,
  );
  const post = await insert('community_posts', {
    authorId: employee.id,
    acknowledgementId: postAck.id,
    title: 'Test post',
    body: 'Synthetic awareness text',
    category: 'SECURITY_TIP',
  });
  await t.test('community submissions default to pending review', () => assert.equal(post.status, 'PENDING_REVIEW'));
  await reject('approved posts require approval timestamp', () =>
    client.query("UPDATE community_posts SET status = 'APPROVED' WHERE id = $1", [post.id]),
  );
  await client.query('ROLLBACK');
});

test('generated Prisma Client reads database with PostgreSQL adapter', async () => {
  const db = createDatabaseClient();
  try {
    assert.equal(await db.role.count(), 2);
    assert.equal(await db.department.count(), 4);
  } finally {
    await db.$disconnect();
  }
});
