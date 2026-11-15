import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { topics } from '../src/training/training-policy.js';
import { validateQuizDraft } from '../src/training/course-quiz-service.js';
import { ProvisioningError } from '../src/training/course-provisioning.js';
import { provisionMonthlyQuiz } from '../src/training/monthly-quiz-provisioning.js';
import { monthlyDraft } from '../src/training/content/monthly-quiz-builders.js';
import { monthlyQuizContent } from '../src/training/content/monthly-quizzes.js';
import { trainingContent } from '../src/training/content/index.js';

const calendar = [
  ['2026-11', 'Spot the Phishing Attempt', ['phishing-awareness']],
  ['2026-12', 'Browse Safely Online', ['safe-browsing']],
  ['2027-01', 'Protecting Personal Information', ['data-privacy']],
  ['2027-02', 'Security Starts at the Workplace', ['physical-security']],
  ['2027-03', 'Recognize It, Report It', ['reporting-security-incidents']],
  ['2027-04', 'Working Securely Anywhere', ['secure-remote-work']],
  ['2027-05', 'Using AI Responsibly', ['responsible-ai']],
  ['2027-06', 'Phishing, Links & Online Scams', ['phishing-awareness', 'safe-browsing']],
  ['2027-07', 'Privacy in the Age of AI', ['data-privacy', 'responsible-ai']],
  ['2027-08', 'Keeping Work Secure Everywhere', ['physical-security', 'secure-remote-work']],
  ['2027-09', 'Recognize and Respond to Threats', ['phishing-awareness', 'reporting-security-incidents']],
  ['2027-10', 'Cybersecurity Awareness Challenge', Object.keys(trainingContent)],
];
const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

test('monthly quiz content: calendar, structure, answer keys and course mapping', () => {
  assert.deepEqual(
    monthlyQuizContent.map(({ period, title, courses }) => [period, title, courses]),
    calendar,
  );
  const seen = new Map();
  const courseQuestions = new Set(
    Object.values(trainingContent).flatMap(({ quiz }) => quiz.questions.map((q) => normalize(q.text))),
  );
  for (const quiz of monthlyQuizContent) {
    const draft = monthlyDraft(quiz);
    const validated = validateQuizDraft({
      title: draft.title,
      passingPercent: draft.passingPercent,
      maxAttempts: draft.maxAttempts,
      questions: draft.questions.map(({ topic, ...question }) => {
        assert.ok(topics.includes(topic));
        return question;
      }),
    });
    assert.deepEqual(
      [validated.passingPercent, validated.maxAttempts, validated.questions.length],
      [80, 3, 15],
      quiz.period,
    );
    // Whole UTC month, following the existing administrator authoring default.
    const [year, month] = quiz.period.split('-').map(Number);
    assert.equal(draft.opensAt, new Date(Date.UTC(year, month - 1, 1)).toISOString());
    assert.equal(draft.closesAt, new Date(Date.UTC(year, month, 1)).toISOString());
    assert.deepEqual(
      quiz.questions.map((q) => q.type).filter((type) => type === 'MULTIPLE_CHOICE').length,
      10,
      quiz.period,
    );
    assert.deepEqual(quiz.questions.map((q) => q.type).filter((type) => type === 'TRUE_FALSE').length, 5, quiz.period);
    const applied = quiz.questions.filter((q) => q.level === 'APPLIED').length;
    assert.ok(
      applied >= 4 && applied <= 5 && quiz.questions.every((q) => ['BEGINNER', 'APPLIED'].includes(q.level)),
      `${quiz.period} levels`,
    );
    // Every question maps to a scheduled course, and every scheduled course is assessed.
    assert.ok(
      quiz.questions.every((q) => quiz.courses.includes(q.course)),
      `${quiz.period} course mapping`,
    );
    assert.deepEqual(
      [...new Set(quiz.questions.map((q) => q.course))].sort(),
      [...quiz.courses].sort(),
      `${quiz.period} course coverage`,
    );
    assert.ok(quiz.questions.every((q) => topics.includes(q.topic) && q.points === 1));
    // One correct answer; varied answer positions; both True and False used.
    const positions = quiz.questions
      .filter((q) => q.type === 'MULTIPLE_CHOICE')
      .map((q) => {
        assert.equal(q.options.length, 4, q.text);
        assert.equal(q.options.filter((o) => o.isCorrect).length, 1, q.text);
        return q.options.findIndex((o) => o.isCorrect);
      });
    assert.ok(
      new Set(positions).size >= 3 && [0, 1, 2, 3].every((p) => positions.filter((x) => x === p).length <= 4),
      `${quiz.period} positions ${positions}`,
    );
    const tfAnswers = quiz.questions
      .filter((q) => q.type === 'TRUE_FALSE')
      .map((q) => q.options.find((o) => o.isCorrect).text);
    assert.ok(tfAnswers.includes('True') && tfAnswers.includes('False'), `${quiz.period} true/false balance`);
    for (const q of quiz.questions) {
      const key = normalize(q.text);
      assert.ok(!seen.has(key), `Duplicate question in ${quiz.period} and ${seen.get(key)}: ${q.text}`);
      seen.set(key, quiz.period);
      assert.ok(!courseQuestions.has(key), `Copied from a course quiz: ${q.text}`);
      assert.ok(q.text.length <= 220 && q.explanation.length >= 20 && q.explanation.length <= 300, q.text);
    }
  }
  assert.equal(seen.size, 180);
});

test('monthly quiz content invents no contacts, legal obligations, products or EWAGuard AI guarantees', () => {
  const text = JSON.stringify(monthlyQuizContent);
  assert.doesNotMatch(
    text,
    /@|\+973|\b\d{3,4}[- ]\d{3,4}\b|within \d+ (days|hours)|Article \d|Law No|penalt|fine of|BHD|dinar/i,
  );
  assert.doesNotMatch(text, /AnyConnect|GlobalProtect|FortiClient|Zscaler|Intune|Copilot|ChatGPT|Gemini/i);
  assert.doesNotMatch(
    text,
    /EWAGuard AI (is|will) (always|guarantee)|guarantees (that )?(it|the link|the file) is safe/i,
  );
  const hosts = [
    ...text.matchAll(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|bh|io|co|ly|info|biz|example))\b/gi),
  ].map((m) => m[1].toLowerCase());
  for (const host of hosts) assert.match(host, /(^|\.)(example\.(com|net|org)|example)$/, host);
});

test('monthly quiz provisioning, secrecy, scoring, history and analytics through the existing engine', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  // Synthetic copies use otherwise unused 2094 months so they never collide with the real 2026–2027 drafts.
  // The in-process clock is pinned inside March 2094 so that month can be OPEN; only Date is mocked.
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2094, 2, 15, 12) });
  const synthetic = monthlyQuizContent.map((quiz, index) => ({
    ...quiz,
    period: `2094-${String(index + 1).padStart(2, '0')}`,
    title: `${quiz.title} (synthetic)`,
  }));
  const periods = synthetic.map((quiz) => new Date(`${quiz.period}-01T00:00:00.000Z`));
  const db = createDatabaseClient(),
    users = [];
  const config = parseConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-monthly-content-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173',
  });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    // Only the synthetic 2094 quizzes and users created here are removed; history triggers are disabled inside this
    // local-test transaction only.
    try {
      await db.$transaction(
        async (tx) => {
          const monthly = await tx.monthlyQuiz.findMany({
            where: { period: { in: periods } },
            select: { id: true, quizId: true },
          });
          const monthlyIds = monthly.map((row) => row.id),
            quizIds = monthly.map((row) => row.quizId);
          for (const [table, trigger] of [
            ['quiz_answers', 'answer_history'],
            ['quiz_attempts', 'submitted_history'],
            ['quiz_options', 'option_history'],
            ['quiz_questions', 'question_history'],
          ])
            await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
          await tx.auditLog.deleteMany({
            where: { OR: [{ actorId: { in: users } }, { resourceId: { in: monthlyIds } }] },
          });
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
        { timeout: 30000 },
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
  const employee = await user();
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
  const certificatesBefore = await db.certificate.count(),
    progressBefore = await db.trainingProgress.count();

  await t.test(
    'provisioning requires an MFA-enrolled administrator, creates drafts only and is idempotent',
    async () => {
      for (const email of [employee.email, noMfa.email, ''])
        await assert.rejects(provisionMonthlyQuiz(db, { adminEmail: email, content: synthetic[0] }), ProvisioningError);
      for (const content of synthetic) {
        const result = await provisionMonthlyQuiz(db, { adminEmail: admin.email, content });
        assert.deepEqual([result.outcome, result.status, result.period], ['CREATED', 'DRAFT', content.period]);
      }
      for (const content of synthetic)
        assert.equal((await provisionMonthlyQuiz(db, { adminEmail: admin.email, content })).outcome, 'ALREADY_EXISTS');
      const rows = await db.monthlyQuiz.findMany({
        where: { period: { in: periods } },
        include: { quiz: { include: { _count: { select: { questions: true, attempts: true } } } } },
      });
      assert.equal(rows.length, 12);
      assert.ok(
        rows.every(
          (row) =>
            row.quiz.status === 'DRAFT' &&
            !row.quiz.approvedAt &&
            !row.quiz.publishedAt &&
            row.quiz.createdById === admin.id,
        ),
      );
      assert.ok(rows.every((row) => row.quiz._count.questions === 15 && row.quiz._count.attempts === 0));
      assert.equal(
        await db.monthlyQuizAssignment.count({ where: { monthlyQuizId: { in: rows.map((row) => row.id) } } }),
        0,
      );
      const audits = await db.auditLog.findMany({
        where: { resourceId: { in: rows.map((row) => row.id) } },
        select: { action: true, actorId: true },
      });
      assert.equal(audits.length, 12);
      assert.ok(audits.every((a) => a.action === 'MONTHLY_QUIZ_CREATED' && a.actorId === admin.id));
    },
  );

  const march = await db.monthlyQuiz.findUnique({ where: { period: periods[2] } });
  const path = `/api/admin/monthly-quizzes/${march.id}`;
  await t.test(
    'drafts stay hidden until an administrator approves and publishes; published quizzes are never overwritten',
    async () => {
      assert.equal((await request('/api/monthly-quizzes?period=2094-03', { actor: employee })).data.items.length, 0);
      assert.equal((await request(`/api/monthly-quizzes/${march.id}`, { actor: employee })).status, 404);
      const draft = (await request(path)).data.monthlyQuiz;
      const approved = await request(`${path}/approve`, { body: { expectedUpdatedAt: draft.quiz.updatedAt } });
      assert.equal(
        (await request(`${path}/publish`, { body: { expectedUpdatedAt: approved.data.monthlyQuiz.quiz.updatedAt } }))
          .status,
        200,
      );
      const again = await provisionMonthlyQuiz(db, { adminEmail: admin.email, content: synthetic[2] });
      assert.deepEqual([again.outcome, again.status], ['ALREADY_EXISTS', 'PUBLISHED']);
      assert.equal(await db.quizQuestion.count({ where: { quizId: march.quizId } }), 15);
    },
  );

  await t.test(
    'answers stay secret before submission; scoring, history and analytics use the existing engine',
    async () => {
      const open = (await request(`/api/monthly-quizzes/${march.id}`, { actor: employee })).data;
      assert.equal(open.availability, 'OPEN');
      assert.equal(open.quiz.questions.length, 15);
      assert.doesNotMatch(JSON.stringify(open), /isCorrect|correctOption|explanation/i);
      const key = new Map(
        (await db.quizOption.findMany({ where: { isCorrect: true, question: { quizId: march.quizId } } })).map((o) => [
          o.questionId,
          o.id,
        ]),
      );
      const answers = (questions, wrong) =>
        questions.map((q, index) => ({
          questionId: q.id,
          selectedOptionId: index < wrong ? q.options.find((o) => o.id !== key.get(q.id)).id : key.get(q.id),
        }));
      const first = (await request(`/api/monthly-quizzes/${march.id}/attempts`, { actor: employee, body: {} })).data;
      const failed = await request(`/api/monthly-quizzes/${march.id}/attempts/${first.attempt.id}/submit`, {
        actor: employee,
        body: { answers: answers(first.quiz.questions, 4) },
      });
      assert.deepEqual([failed.data.attempt.passed, Number(failed.data.attempt.scorePercent)], [false, 73.33]);
      const second = (await request(`/api/monthly-quizzes/${march.id}/attempts`, { actor: employee, body: {} })).data;
      const passed = await request(`/api/monthly-quizzes/${march.id}/attempts/${second.attempt.id}/submit`, {
        actor: employee,
        body: { answers: answers(second.quiz.questions, 3) },
      });
      assert.deepEqual([passed.data.attempt.passed, Number(passed.data.attempt.scorePercent)], [true, 80]);
      assert.ok(passed.data.answers.every((answer) => answer.correctOptionId && answer.explanation));
      const history = (await request('/api/monthly-quizzes/history', { actor: employee })).data.items;
      assert.equal(history.length, 1);
      assert.equal(history[0].period, '2094-03');
      assert.equal(Number(history[0].bestAttempt.scorePercent), 80);
      const analytics = (
        await request(
          '/api/admin/analytics/awareness?period=custom&start=2094-03-01&end=2094-03-31&monthlyPeriod=2094-03',
        )
      ).data;
      assert.equal(analytics.monthlyQuizzes.submittedAssignments, 1);
      assert.equal(Number(analytics.monthlyQuizzes.averageBestScorePercent), 80);
      // Monthly quizzes never touch course progress or certificates.
      assert.equal(await db.certificate.count(), certificatesBefore);
      assert.equal(await db.trainingProgress.count(), progressBefore);
    },
  );
});
