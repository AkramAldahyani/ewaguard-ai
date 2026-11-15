import { expected, fail, fields, identifier, pageInput, searchText, topics } from './training-policy.js';
import {
  adminQuiz,
  attemptSummary,
  employeeQuiz,
  quizQuestions,
  quizReview,
  validateQuizDraft,
} from './course-quiz-service.js';
import { MONTHLY_ELIGIBLE_EMPLOYEE } from '../analytics/monthly-eligibility.js';

const missing = () => fail('Monthly quiz not found.', 404, 'MONTHLY_QUIZ_NOT_FOUND');
const conflict = (message) => fail(message, 409, 'MONTHLY_QUIZ_CONFLICT');
const person = { id: true, firstName: true, lastName: true };
const month = (date) => date.toISOString().slice(0, 7);
const remaining = (record, attempts) => {
  const passed = attempts.some((attempt) => attempt.status === 'SUBMITTED' && attempt.passed === true);
  return { passed, attemptsRemaining: passed ? 0 : Math.max(0, record.quiz.maxAttempts - attempts.length) };
};
const periodDate = (value) => {
  if (typeof value !== 'string' || !/^(20\d\d|21\d\d)-(0[1-9]|1[0-2])$/.test(value))
    fail('Use a valid month in YYYY-MM format.');
  return new Date(`${value}-01T00:00:00.000Z`);
};
function windowInput(period, opensAt, closesAt) {
  const valid = (value) =>
    typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value);
  if (!valid(opensAt) || !valid(closesAt)) fail('Use ISO timestamps with a timezone.');
  const open = new Date(opensAt),
    close = new Date(closesAt);
  const end = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
  if (Number.isNaN(open.getTime()) || Number.isNaN(close.getTime()) || open < period || close > end || open >= close)
    fail('The opening and closing time must fall within the selected month.');
  return { opensAt: open, closesAt: close };
}
function input(body, edit = false, period = null) {
  const keys = [
    'title',
    'passingPercent',
    'maxAttempts',
    'questions',
    'opensAt',
    'closesAt',
    ...(edit ? ['expectedUpdatedAt'] : ['period']),
  ];
  fields(body, keys, keys);
  const selectedPeriod = edit ? period : periodDate(body.period);
  if (!Array.isArray(body.questions)) fail('Provide a valid question list.');
  const topicsByQuestion = body.questions.map((q) => q?.topic);
  if (topicsByQuestion.some((topic) => !topics.includes(topic))) fail('Select an approved topic for every question.');
  const validated = validateQuizDraft({
    title: body.title,
    passingPercent: body.passingPercent,
    maxAttempts: body.maxAttempts,
    questions: body.questions.map((q) => {
      fields(
        q,
        ['text', 'type', 'explanation', 'points', 'options', 'topic'],
        ['text', 'type', 'explanation', 'points', 'options', 'topic'],
      );
      return { text: q.text, type: q.type, explanation: q.explanation, points: q.points, options: q.options };
    }),
  });
  return {
    ...validated,
    questions: validated.questions.map((q, index) => ({ ...q, topic: topicsByQuestion[index] })),
    period: selectedPeriod,
    ...windowInput(selectedPeriod, body.opensAt, body.closesAt),
  };
}
const availability = (record, now = new Date()) =>
  record.quiz.status === 'ARCHIVED'
    ? 'ARCHIVED'
    : record.quiz.status !== 'PUBLISHED'
      ? 'UNPUBLISHED'
      : now < record.opensAt
        ? 'UPCOMING'
        : now >= record.closesAt
          ? 'CLOSED'
          : 'OPEN';
const meta = (record) => ({
  id: record.id,
  period: month(record.period),
  opensAt: record.opensAt,
  closesAt: record.closesAt,
  availability: availability(record),
  title: record.quiz.title,
  status: record.quiz.status,
  topics: [...new Set(record.quiz.questions.map((q) => q.topic))],
  updatedAt: record.quiz.updatedAt,
  publishedAt: record.quiz.publishedAt,
});
const full = (record) => ({
  ...meta(record),
  quiz: {
    ...adminQuiz(record.quiz),
    questions: adminQuiz(record.quiz).questions.map((q, index) => ({
      ...q,
      topic: record.quiz.questions[index].topic,
    })),
  },
});
async function loaded(tx, id) {
  const record = await tx.monthlyQuiz.findUnique({
    where: { id: identifier(id) },
    include: { quiz: { include: { questions: quizQuestions } } },
  });
  if (!record) missing();
  return record;
}
async function lockMonthly(tx, id) {
  id = identifier(id);
  await tx.$queryRaw`SELECT id FROM monthly_quizzes WHERE id = ${id}::uuid FOR UPDATE`;
  return loaded(tx, id);
}
async function audit(tx, actor, record, action, metadata = {}) {
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      action,
      resourceType: 'MONTHLY_QUIZ',
      resourceId: record.id,
      outcome: 'SUCCESS',
      metadata,
      retentionUntil: new Date(Date.now() + 90 * 86400000),
    },
  });
}
async function saveQuestions(tx, quizId, content) {
  for (const [position, q] of content.entries())
    await tx.quizQuestion.create({
      data: {
        quizId,
        position,
        text: q.text,
        type: q.type,
        explanation: q.explanation,
        topic: q.topic,
        points: q.points,
        options: { create: q.options.map((o, index) => ({ ...o, position: index })) },
      },
    });
}
// Orders by distance from the current UTC calendar month (periods are stored as UTC month starts).
// Equal distances prefer the later month; the id keeps the order stable across pages.
const monthIndex = (date) => date.getUTCFullYear() * 12 + date.getUTCMonth();
export function nearestMonthOrder(rows, now = new Date()) {
  const current = monthIndex(now);
  return [...rows].sort(
    (a, b) =>
      Math.abs(monthIndex(a.period) - current) - Math.abs(monthIndex(b.period) - current) ||
      b.period - a.period ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
// At most one quiz exists per month, so ranking the lightweight {id, period} candidates in memory stays small;
// only the requested page is then loaded with its relations.
async function nearestMonthPage(database, where, include, paging, now) {
  const candidates = await database.monthlyQuiz.findMany({ where, select: { id: true, period: true } });
  const ids = nearestMonthOrder(candidates, now)
    .slice(paging.skip, paging.skip + paging.pageSize + 1)
    .map((row) => row.id);
  const rows = ids.length ? await database.monthlyQuiz.findMany({ where: { id: { in: ids } }, include }) : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
const attemptsFor = (record, userId) => record.assignments?.find((a) => a.employeeId === userId)?.attempts ?? [];
const bestAttempt = (attempts) =>
  attempts
    .filter((a) => a.status === 'SUBMITTED')
    .reduce((best, a) => (!best || Number(a.scorePercent) > Number(best.scorePercent) ? a : best), null);
function submittedAnswers(body) {
  fields(body, ['answers'], ['answers']);
  if (!Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 30) fail();
  const selected = new Map();
  for (const answer of body.answers) {
    fields(answer, ['questionId', 'selectedOptionId'], ['questionId', 'selectedOptionId']);
    const questionId = identifier(answer.questionId),
      optionId = identifier(answer.selectedOptionId);
    if (selected.has(questionId)) fail('Duplicate question.');
    selected.set(questionId, optionId);
  }
  return selected;
}
export function createMonthlyQuizService(database) {
  return {
    async adminList(query, now = new Date()) {
      const paging = pageInput(query, ['status', 'period', 'search', 'sort']);
      if (query.status && !['DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED'].includes(query.status)) fail();
      if (query.sort && !['nearest', 'period_desc', 'period_asc'].includes(query.sort)) fail();
      const search = searchText(query.search);
      const where = {
        ...(query.period ? { period: periodDate(query.period) } : {}),
        quiz: {
          ...(query.status ? { status: query.status } : {}),
          ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
        },
      };
      const include = { quiz: { include: { questions: { select: { topic: true } } } } };
      // Nearest-to-current-month is the default; an explicit chronological sort overrides it.
      const rows =
        !query.sort || query.sort === 'nearest'
          ? await nearestMonthPage(database, where, include, paging, now)
          : await database.monthlyQuiz.findMany({
              where,
              include,
              orderBy: [{ period: query.sort === 'period_asc' ? 'asc' : 'desc' }, { id: 'asc' }],
              skip: paging.skip,
              take: paging.pageSize + 1,
            });
      return {
        items: rows.slice(0, paging.pageSize).map(meta),
        page: paging.page,
        pageSize: paging.pageSize,
        hasMore: rows.length > paging.pageSize,
      };
    },
    async adminDetail(id) {
      return { monthlyQuiz: full(await loaded(database, id)) };
    },
    async create(user, body) {
      const content = input(body);
      try {
        return await database.$transaction(async (tx) => {
          const quiz = await tx.quiz.create({
            data: {
              kind: 'MONTHLY',
              title: content.title,
              passingPercent: content.passingPercent,
              maxAttempts: content.maxAttempts,
              createdById: user.id,
            },
          });
          const record = await tx.monthlyQuiz.create({
            data: { quizId: quiz.id, period: content.period, opensAt: content.opensAt, closesAt: content.closesAt },
          });
          await saveQuestions(tx, quiz.id, content.questions);
          await audit(tx, user, record, 'MONTHLY_QUIZ_CREATED', { period: month(record.period), quizId: quiz.id });
          return { monthlyQuiz: full(await loaded(tx, record.id)) };
        });
      } catch (error) {
        if (error.code === 'P2002') conflict('A monthly quiz already exists for this month.');
        throw error;
      }
    },
    async edit(user, id, body) {
      return database.$transaction(async (tx) => {
        const record = await lockMonthly(tx, id);
        const content = input(body, true, record.period);
        expected(body, record.quiz);
        if (
          record.quiz.status !== 'DRAFT' ||
          record.quiz.publishedAt ||
          (await tx.quizAttempt.count({ where: { quizId: record.quizId } }))
        )
          conflict('Approved, published or attempted quiz content is immutable.');
        await tx.quizOption.deleteMany({ where: { question: { quizId: record.quizId } } });
        await tx.quizQuestion.deleteMany({ where: { quizId: record.quizId } });
        await tx.quiz.update({
          where: { id: record.quizId },
          data: {
            title: content.title,
            passingPercent: content.passingPercent,
            maxAttempts: content.maxAttempts,
            version: record.quiz.version + 1,
            updatedAt: new Date(Math.max(Date.now(), record.quiz.updatedAt.getTime() + 1)),
          },
        });
        await tx.monthlyQuiz.update({
          where: { id: record.id },
          data: { opensAt: content.opensAt, closesAt: content.closesAt },
        });
        await saveQuestions(tx, record.quizId, content.questions);
        await audit(tx, user, record, 'MONTHLY_QUIZ_EDITED', { period: month(record.period), quizId: record.quizId });
        return { monthlyQuiz: full(await loaded(tx, record.id)) };
      });
    },
    async action(user, id, action, body) {
      fields(body, ['expectedUpdatedAt'], ['expectedUpdatedAt']);
      return database.$transaction(async (tx) => {
        const record = await lockMonthly(tx, id);
        expected(body, record.quiz);
        if (
          (action === 'approve' && record.quiz.status !== 'DRAFT') ||
          (action === 'publish' && record.quiz.status !== 'APPROVED') ||
          (action === 'archive' && record.quiz.status === 'ARCHIVED')
        )
          conflict('Quiz lifecycle changed. Reload before continuing.');
        if (action === 'publish' && record.closesAt <= new Date()) conflict('The quiz closing time has passed.');
        const change =
          action === 'approve'
            ? { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() }
            : action === 'publish'
              ? { status: 'PUBLISHED', publishedAt: new Date() }
              : { status: 'ARCHIVED' };
        await tx.quiz.update({
          where: { id: record.quizId },
          data: { ...change, updatedAt: new Date(Math.max(Date.now(), record.quiz.updatedAt.getTime() + 1)) },
        });
        await audit(tx, user, record, `MONTHLY_QUIZ_${action.toUpperCase()}`, {
          period: month(record.period),
          quizId: record.quizId,
        });
        return { monthlyQuiz: full(await loaded(tx, record.id)) };
      });
    },
    async report(id, query) {
      const paging = pageInput(query);
      const record = await loaded(database, id);
      const where = { monthlyAssignment: { monthlyQuizId: record.id } };
      const rows = await database.quizAttempt.findMany({
        where,
        include: { employee: { select: person } },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.pageSize + 1,
      });
      const [startedEmployees, submittedEmployees, inProgressEmployees, activeEmployeesNow, expectedRows] =
        await Promise.all([
          database.monthlyQuizAssignment.count({ where: { monthlyQuizId: record.id } }),
          database.monthlyQuizAssignment.count({
            where: { monthlyQuizId: record.id, attempts: { some: { status: 'SUBMITTED' } } },
          }),
          // Employees with an attempt open right now (started, not yet submitted).
          database.monthlyQuizAssignment.count({
            where: { monthlyQuizId: record.id, attempts: { some: { status: 'IN_PROGRESS' } } },
          }),
          database.user.count({ where: { status: 'ACTIVE', deactivatedAt: null, role: { name: 'EMPLOYEE' } } }),
          // Same population as the participation-rate denominator in awareness analytics and the dashboard.
          database.$queryRaw`SELECT count(*)::int AS expected FROM monthly_quizzes mq JOIN users u ON ${MONTHLY_ELIGIBLE_EMPLOYEE}
          JOIN roles r ON r.id = u."roleId" WHERE mq.id = ${record.id}::uuid AND r.name = 'EMPLOYEE'`,
        ]);
      const expectedEmployees = expectedRows[0]?.expected ?? 0;
      return {
        items: rows.slice(0, paging.pageSize).map((a) => ({ ...attemptSummary(a), employee: a.employee })),
        page: paging.page,
        pageSize: paging.pageSize,
        hasMore: rows.length > paging.pageSize,
        participation: {
          expectedEmployees,
          startedEmployees,
          submittedEmployees,
          inProgressEmployees,
          activeEmployeesNow,
        },
      };
    },
    // Once an attempt is passed no further attempt can start, so nothing remains to offer the employee.
    // (start() refuses a new attempt after a pass with the same rule.)
    async employeeList(user, query, now = new Date()) {
      const paging = pageInput(query, ['period']);
      const rows = await nearestMonthPage(
        database,
        {
          ...(query.period ? { period: periodDate(query.period) } : {}),
          OR: [{ quiz: { status: 'PUBLISHED' } }, { assignments: { some: { employeeId: user.id } } }],
        },
        {
          quiz: { include: { questions: { select: { topic: true } } } },
          assignments: { where: { employeeId: user.id }, include: { attempts: { orderBy: { attemptNumber: 'asc' } } } },
        },
        paging,
        now,
      );
      return {
        items: rows.slice(0, paging.pageSize).map((record) => {
          const attempts = attemptsFor(record, user.id);
          return {
            ...meta(record),
            attemptCount: attempts.length,
            ...remaining(record, attempts),
            bestScorePercent: bestAttempt(attempts)?.scorePercent ?? null,
          };
        }),
        page: paging.page,
        pageSize: paging.pageSize,
        hasMore: rows.length > paging.pageSize,
      };
    },
    async employeeDetail(user, id) {
      const record = await database.monthlyQuiz.findUnique({
        where: { id: identifier(id) },
        include: {
          quiz: { include: { questions: quizQuestions } },
          assignments: {
            where: { employeeId: user.id },
            include: { attempts: { orderBy: { attemptNumber: 'desc' } } },
          },
        },
      });
      if (!record || (record.quiz.status !== 'PUBLISHED' && !record.assignments.length)) missing();
      const open = availability(record) === 'OPEN';
      const attempts = attemptsFor(record, user.id);
      return {
        ...meta(record),
        quiz: open ? employeeQuiz(record.quiz) : null,
        attempts: attempts.map(attemptSummary),
        ...remaining(record, attempts),
      };
    },
    async history(user, query) {
      const paging = pageInput(query);
      const rows = await database.monthlyQuiz.findMany({
        where: { assignments: { some: { employeeId: user.id, attempts: { some: { status: 'SUBMITTED' } } } } },
        include: {
          quiz: { select: { title: true } },
          assignments: {
            where: { employeeId: user.id },
            include: { attempts: { where: { status: 'SUBMITTED' }, orderBy: { attemptNumber: 'asc' } } },
          },
        },
        orderBy: [{ period: 'desc' }, { id: 'asc' }],
        skip: paging.skip,
        take: paging.pageSize + 1,
      });
      return {
        items: rows.slice(0, paging.pageSize).map((record, index) => {
          const own = attemptsFor(record, user.id);
          const older = rows[index + 1] ? bestAttempt(attemptsFor(rows[index + 1], user.id)) : null;
          return {
            period: month(record.period),
            title: record.quiz.title,
            attemptCount: own.length,
            bestAttempt: attemptSummary(bestAttempt(own)),
            deltaPointsFromPreviousRecordedMonth: older
              ? Number(bestAttempt(own).scorePercent) - Number(older.scorePercent)
              : null,
          };
        }),
        page: paging.page,
        pageSize: paging.pageSize,
        hasMore: rows.length > paging.pageSize,
      };
    },
    async start(user, id, body) {
      fields(body, []);
      return database.$transaction(async (tx) => {
        const record = await lockMonthly(tx, id);
        if (availability(record) !== 'OPEN') conflict('This monthly quiz is not open for attempts.');
        let assignment = await tx.monthlyQuizAssignment.findUnique({
          where: { monthlyQuizId_employeeId: { monthlyQuizId: record.id, employeeId: user.id } },
        });
        if (!assignment)
          assignment = await tx.monthlyQuizAssignment.create({
            data: { monthlyQuizId: record.id, employeeId: user.id, assignedById: record.quiz.createdById },
          });
        await tx.$queryRaw`SELECT id FROM monthly_quiz_assignments WHERE id = ${assignment.id}::uuid FOR UPDATE`;
        if (assignment.revokedAt) conflict('This monthly quiz assignment is unavailable.');
        const latest = await tx.quizAttempt.findFirst({
          where: { quizId: record.quizId, employeeId: user.id, monthlyAssignmentId: assignment.id },
          orderBy: { attemptNumber: 'desc' },
        });
        if (latest?.status === 'IN_PROGRESS')
          return { attempt: attemptSummary(latest), quiz: employeeQuiz(record.quiz) };
        if (latest?.passed) conflict('This monthly quiz is already passed.');
        if ((latest?.attemptNumber ?? 0) >= record.quiz.maxAttempts) conflict('No monthly quiz attempts remain.');
        const attempt = await tx.quizAttempt.create({
          data: {
            quizId: record.quizId,
            employeeId: user.id,
            monthlyAssignmentId: assignment.id,
            attemptNumber: (latest?.attemptNumber ?? 0) + 1,
            passingPercent: record.quiz.passingPercent,
          },
        });
        return { attempt: attemptSummary(attempt), quiz: employeeQuiz(record.quiz) };
      });
    },
    async result(user, id, attemptId) {
      const record = await loaded(database, id);
      const attempt = await database.quizAttempt.findFirst({
        where: {
          id: identifier(attemptId),
          quizId: record.quizId,
          employeeId: user.id,
          monthlyAssignment: { monthlyQuizId: record.id, employeeId: user.id, revokedAt: null },
        },
        include: { answers: true },
      });
      if (!attempt) missing();
      if (attempt.status !== 'SUBMITTED') conflict('This attempt has not been submitted.');
      return quizReview(attempt, record.quiz);
    },
    async submit(user, id, attemptId, body) {
      const selected = submittedAnswers(body);
      return database.$transaction(async (tx) => {
        const record = await lockMonthly(tx, id);
        const assignment = await tx.monthlyQuizAssignment.findUnique({
          where: { monthlyQuizId_employeeId: { monthlyQuizId: record.id, employeeId: user.id } },
        });
        if (!assignment || assignment.revokedAt) missing();
        await tx.$queryRaw`SELECT id FROM monthly_quiz_assignments WHERE id = ${assignment.id}::uuid FOR UPDATE`;
        const previous = await tx.quizAttempt.findFirst({
          where: {
            id: identifier(attemptId),
            quizId: record.quizId,
            employeeId: user.id,
            monthlyAssignmentId: assignment.id,
          },
        });
        if (!previous) missing();
        await tx.$queryRaw`SELECT id FROM quiz_attempts WHERE id = ${previous.id}::uuid FOR UPDATE`;
        const attempt = await tx.quizAttempt.findUnique({ where: { id: previous.id }, include: { answers: true } });
        if (attempt.status === 'SUBMITTED') {
          if (
            attempt.answers.length !== selected.size ||
            attempt.answers.some((a) => selected.get(a.questionId) !== a.selectedOptionId)
          )
            conflict('This attempt was submitted with different answers.');
          return quizReview(attempt, record.quiz);
        }
        if (availability(record) !== 'OPEN' || attempt.status !== 'IN_PROGRESS')
          conflict('This monthly quiz is no longer open.');
        if (selected.size !== record.quiz.questions.length) fail('Answer every question before submission.');
        let earned = 0,
          possible = 0;
        const answers = record.quiz.questions.map((q) => {
          const option = q.options.find((o) => o.id === selected.get(q.id));
          if (!option) fail('Invalid question or answer option.');
          const points = option.isCorrect ? q.points : 0;
          earned += points;
          possible += q.points;
          return { attemptId: attempt.id, questionId: q.id, selectedOptionId: option.id, awardedPoints: points };
        });
        await tx.quizAnswer.createMany({ data: answers });
        const passed = earned * 100 >= attempt.passingPercent * possible;
        await tx.quizAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
            earnedPoints: earned,
            possiblePoints: possible,
            scorePercent: Math.round((earned * 10000) / possible) / 100,
            passed,
          },
        });
        await audit(tx, user, record, 'MONTHLY_QUIZ_SUBMITTED', {
          quizId: record.quizId,
          attemptId: attempt.id,
          passed,
        });
        return quizReview(
          await tx.quizAttempt.findUnique({ where: { id: attempt.id }, include: { answers: true } }),
          record.quiz,
        );
      });
    },
  };
}
