import { expected, fail, fields, identifier, pageInput } from './training-policy.js';
import { issueEligibleCertificate } from '../certificates/certificate-service.js';

const missing = () => fail('Quiz or assignment not found.', 404, 'QUIZ_NOT_FOUND');
const conflict = (message) => fail(message, 409, 'QUIZ_CONFLICT');
const person = { id: true, firstName: true, lastName: true };
const questions = { orderBy: { position: 'asc' }, include: { options: { orderBy: { position: 'asc' } } } };
const meta = (quiz) => ({ id: quiz.id, title: quiz.title, version: quiz.version, status: quiz.status,
  passingPercent: quiz.passingPercent, maxAttempts: quiz.maxAttempts, createdAt: quiz.createdAt,
  updatedAt: quiz.updatedAt, approvedAt: quiz.approvedAt, publishedAt: quiz.publishedAt });
const adminQuiz = (quiz) => ({ ...meta(quiz), questions: quiz.questions.map((q) => ({ id: q.id, text: q.text,
  type: q.type, explanation: q.explanation, points: q.points, position: q.position,
  options: q.options.map((o) => ({ id: o.id, text: o.text, position: o.position, isCorrect: o.isCorrect })) })) });
const employeeQuiz = (quiz) => ({ id: quiz.id, title: quiz.title, version: quiz.version,
  questions: quiz.questions.map((q) => ({ id: q.id, text: q.text, type: q.type, points: q.points,
    position: q.position, options: q.options.map((o) => ({ id: o.id, text: o.text, position: o.position })) })) });
const attemptSummary = (a) => ({ id: a.id, attemptNumber: a.attemptNumber, status: a.status,
  startedAt: a.startedAt, submittedAt: a.submittedAt, scorePercent: a.scorePercent,
  earnedPoints: a.earnedPoints, possiblePoints: a.possiblePoints, passed: a.passed });
const plain = (value, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>]/u.test(value)
    || Array.from(value).some((c) => { const n = c.codePointAt(0); return n === 127 || n < 32 && ![9, 10, 13].includes(n); })) fail('Use bounded plain text without HTML.');
  return value.trim();
};
function draft(body, edit = false) {
  fields(body, ['title', 'passingPercent', 'maxAttempts', 'questions', ...(edit ? ['expectedUpdatedAt'] : [])], ['title', 'passingPercent', 'maxAttempts', 'questions', ...(edit ? ['expectedUpdatedAt'] : [])]);
  if (!Number.isInteger(body.passingPercent) || body.passingPercent < 1 || body.passingPercent > 100
    || !Number.isInteger(body.maxAttempts) || body.maxAttempts < 1 || body.maxAttempts > 10
    || !Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 30) fail();
  const normalized = body.questions.map((q) => {
    fields(q, ['text', 'type', 'explanation', 'points', 'options'], ['text', 'type', 'explanation', 'points', 'options']);
    if (!['MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(q.type) || !Number.isInteger(q.points) || q.points < 1 || q.points > 20
      || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 || q.type === 'TRUE_FALSE' && q.options.length !== 2) fail();
    let correct = 0;
    const options = q.options.map((o) => {
      fields(o, ['text', 'isCorrect'], ['text', 'isCorrect']);
      if (typeof o.isCorrect !== 'boolean') fail();
      if (o.isCorrect) correct++;
      return { text: plain(o.text, 1000), isCorrect: o.isCorrect };
    });
    if (correct !== 1 || new Set(options.map((o) => o.text.toLocaleLowerCase())).size !== options.length) fail('Each question needs distinct options and one correct answer.');
    if (q.type === 'TRUE_FALSE' && options.map((o) => o.text.toLocaleLowerCase()).sort().join(',') !== 'false,true') fail('True/false choices must be True and False.');
    return { text: plain(q.text, 2000), type: q.type, explanation: plain(q.explanation, 2000), points: q.points, options };
  });
  return { title: plain(body.title, 200), passingPercent: body.passingPercent, maxAttempts: body.maxAttempts, questions: normalized };
}
async function lockProgram(tx, id) {
  id = identifier(id);
  await tx.$queryRaw`SELECT id FROM training_programs WHERE id = ${id}::uuid FOR UPDATE`;
  const program = await tx.trainingProgram.findUnique({ where: { id }, include: { quiz: true } });
  if (!program) missing();
  return program;
}
async function lockQuiz(tx, id) {
  await tx.$queryRaw`SELECT id FROM quizzes WHERE id = ${id}::uuid FOR UPDATE`;
  const quiz = await tx.quiz.findUnique({ where: { id } });
  if (!quiz) missing();
  return quiz;
}
async function audit(tx, actor, id, action, metadata = {}) {
  await tx.auditLog.create({ data: { actorId: actor.id, action, resourceType: 'TRAINING', resourceId: id,
    outcome: 'SUCCESS', metadata, retentionUntil: new Date(Date.now() + 90 * 86400000) } });
}
async function loadQuiz(tx, id) { return tx.quiz.findUnique({ where: { id }, include: { questions } }); }
async function owner(tx, user, id) {
  const assignment = await tx.trainingAssignment.findFirst({ where: { id: identifier(id), employeeId: user.id, revokedAt: null },
    include: { progress: true } });
  if (!assignment) missing();
  return assignment;
}
async function courseQuiz(tx, assignment) {
  const training = await tx.trainingProgram.findUnique({ where: { id: assignment.trainingId }, include: { quiz: true } });
  if (!training || !training.requiresQuiz || !training.quiz) return { training, quiz: null };
  return { training, quiz: await loadQuiz(tx, training.quiz.quizId) };
}
function review(a, quiz) {
  return { attempt: attemptSummary(a), answers: a.answers.map((answer) => {
    const q = quiz.questions.find((item) => item.id === answer.questionId);
    return { questionId: q.id, selectedOptionId: answer.selectedOptionId, awardedPoints: answer.awardedPoints,
      correctOptionId: q.options.find((o) => o.isCorrect).id, explanation: q.explanation };
  }) };
}
// Shared authoring and safe serialization rules for independent monthly quizzes.
export { questions as quizQuestions, adminQuiz, employeeQuiz, attemptSummary, draft as validateQuizDraft, review as quizReview };
export function createCourseQuizService(database) {
  return {
    async adminDetail(id) {
      const program = await database.trainingProgram.findUnique({ where: { id: identifier(id) }, include: { quiz: true } });
      if (!program) missing();
      return { quiz: program.quiz ? adminQuiz(await loadQuiz(database, program.quiz.quizId)) : null, requiresQuiz: program.requiresQuiz };
    },
    async save(user, id, body, edit = false) {
      const input = draft(body, edit);
      return database.$transaction(async (tx) => {
        const program = await lockProgram(tx, id);
        if (!program.requiresQuiz || program.status === 'ARCHIVED') conflict('This course does not accept a quiz.');
        if (edit !== Boolean(program.quiz)) conflict('Quiz draft state changed. Reload before saving.');
        let quiz;
        if (edit) {
          quiz = await lockQuiz(tx, program.quiz.quizId);
          expected(body, quiz);
          if (quiz.status !== 'DRAFT' || quiz.publishedAt || await tx.quizAttempt.count({ where: { quizId: quiz.id } })) conflict('Quiz content with attempts or approval cannot be edited.');
          await tx.quizOption.deleteMany({ where: { question: { quizId: quiz.id } } });
          await tx.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
          quiz = await tx.quiz.update({ where: { id: quiz.id }, data: { title: input.title, passingPercent: input.passingPercent,
            maxAttempts: input.maxAttempts, version: quiz.version + 1,
            updatedAt: new Date(Math.max(Date.now(), quiz.updatedAt.getTime() + 1)) } });
        } else {
          quiz = await tx.quiz.create({ data: { kind: 'COURSE', title: input.title, passingPercent: input.passingPercent,
            maxAttempts: input.maxAttempts, createdById: user.id } });
          await tx.trainingQuiz.create({ data: { trainingId: program.id, quizId: quiz.id } });
        }
        for (const [position, q] of input.questions.entries()) await tx.quizQuestion.create({ data: {
          quizId: quiz.id, position, text: q.text, type: q.type, explanation: q.explanation, topic: program.topic,
          points: q.points, options: { create: q.options.map((o, index) => ({ ...o, position: index })) } } });
        await audit(tx, user, program.id, edit ? 'COURSE_QUIZ_EDITED' : 'COURSE_QUIZ_CREATED', { quizId: quiz.id, version: quiz.version });
        return { quiz: adminQuiz(await loadQuiz(tx, quiz.id)) };
      });
    },
    async transition(user, id, action, body) {
      fields(body, ['expectedUpdatedAt'], ['expectedUpdatedAt']);
      return database.$transaction(async (tx) => {
        const program = await lockProgram(tx, id);
        if (!program.quiz || program.status === 'ARCHIVED' || !program.requiresQuiz) missing();
        const quiz = await lockQuiz(tx, program.quiz.quizId);
        expected(body, quiz);
        if (action === 'approve' && quiz.status !== 'DRAFT' || action === 'publish' && quiz.status !== 'APPROVED') conflict('Quiz lifecycle changed. Reload before continuing.');
        if (action === 'publish' && program.status !== 'PUBLISHED') conflict('Publish the training program first.');
        const update = action === 'approve' ? { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() }
          : { status: 'PUBLISHED', publishedAt: new Date() };
        await tx.quiz.update({ where: { id: quiz.id }, data: { ...update,
          updatedAt: new Date(Math.max(Date.now(), quiz.updatedAt.getTime() + 1)) } });
        await audit(tx, user, program.id, `COURSE_QUIZ_${action.toUpperCase()}`, { quizId: quiz.id, version: quiz.version });
        return { quiz: adminQuiz(await loadQuiz(tx, quiz.id)) };
      });
    },
    async adminAttempts(id, query) {
      const paging = pageInput(query); const program = await database.trainingProgram.findUnique({ where: { id: identifier(id) }, include: { quiz: true } });
      if (!program) missing();
      if (!program.quiz) return { items: [], page: paging.page, pageSize: paging.pageSize, hasMore: false };
      const rows = await database.quizAttempt.findMany({ where: { quizId: program.quiz.quizId, trainingAssignment: { trainingId: program.id } },
        include: { employee: { select: person } }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], skip: paging.skip, take: paging.pageSize + 1 });
      return { items: rows.slice(0, paging.pageSize).map((a) => ({ ...attemptSummary(a), employee: a.employee })), page: paging.page, pageSize: paging.pageSize, hasMore: rows.length > paging.pageSize };
    },
    async employeeDetail(user, id) {
      const assignment = await owner(database, user, id);
      const { training, quiz } = await courseQuiz(database, assignment);
      const attempts = quiz ? await database.quizAttempt.findMany({ where: { quizId: quiz.id, trainingAssignmentId: assignment.id, employeeId: user.id }, orderBy: { attemptNumber: 'desc' } }) : [];
      const available = training.status === 'PUBLISHED' && quiz?.status === 'PUBLISHED';
      const ready = Boolean(assignment.progress?.materialCompletedAt && assignment.progress.progressPercent === 100);
      return { available, reason: !training.requiresQuiz ? 'NOT_REQUIRED' : training.status !== 'PUBLISHED' ? 'COURSE_ARCHIVED'
        : !quiz || quiz.status !== 'PUBLISHED' ? 'UNPUBLISHED' : !ready ? 'READING_INCOMPLETE' : null,
      quiz: available && ready ? employeeQuiz(quiz) : null,
      passingPercent: available ? quiz.passingPercent : null,
      attempts: attempts.map(attemptSummary), attemptsRemaining: quiz ? Math.max(0, quiz.maxAttempts - attempts.length) : 0 };
    },
    async start(user, id, body) {
      fields(body, []);
      return database.$transaction(async (tx) => {
        const initial = await owner(tx, user, id);
        await lockProgram(tx, initial.trainingId);
        await tx.$queryRaw`SELECT id FROM training_assignments WHERE id = ${initial.id}::uuid FOR UPDATE`;
        const assignment = await owner(tx, user, id);
        const { training, quiz } = await courseQuiz(tx, assignment);
        if (training.status !== 'PUBLISHED' || quiz?.status !== 'PUBLISHED') conflict('The published quiz is unavailable.');
        if (!assignment.progress?.materialCompletedAt || assignment.progress.progressPercent !== 100) conflict('Finish the course material first.');
        const latest = await tx.quizAttempt.findFirst({ where: { quizId: quiz.id, employeeId: user.id, trainingAssignmentId: assignment.id }, orderBy: { attemptNumber: 'desc' } });
        if (latest?.status === 'IN_PROGRESS') return { attempt: attemptSummary(latest), quiz: employeeQuiz(quiz) };
        if (latest?.passed) conflict('This quiz is already passed.');
        if ((latest?.attemptNumber ?? 0) >= quiz.maxAttempts) conflict('No quiz attempts remain.');
        const attempt = await tx.quizAttempt.create({ data: { quizId: quiz.id, employeeId: user.id,
          trainingAssignmentId: assignment.id, attemptNumber: (latest?.attemptNumber ?? 0) + 1, passingPercent: quiz.passingPercent } });
        return { attempt: attemptSummary(attempt), quiz: employeeQuiz(quiz) };
      });
    },
    async result(user, id, attemptId) {
      const assignment = await owner(database, user, id);
      const a = await database.quizAttempt.findFirst({ where: { id: identifier(attemptId), employeeId: user.id, trainingAssignmentId: assignment.id }, include: { answers: true } });
      if (!a) missing();
      if (a.status !== 'SUBMITTED') conflict('This attempt has not been submitted.');
      return review(a, await loadQuiz(database, a.quizId));
    },
    async submit(user, id, attemptId, body) {
      fields(body, ['answers'], ['answers']);
      if (!Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 30) fail();
      const submitted = new Map();
      for (const answer of body.answers) {
        fields(answer, ['questionId', 'selectedOptionId'], ['questionId', 'selectedOptionId']);
        const q = identifier(answer.questionId), o = identifier(answer.selectedOptionId);
        if (submitted.has(q)) fail('Duplicate question.');
        submitted.set(q, o);
      }
      return database.$transaction(async (tx) => {
        const initial = await owner(tx, user, id);
        await lockProgram(tx, initial.trainingId);
        await tx.$queryRaw`SELECT id FROM training_assignments WHERE id = ${initial.id}::uuid FOR UPDATE`;
        const assignment = await owner(tx, user, id);
        const a = await tx.quizAttempt.findFirst({ where: { id: identifier(attemptId), employeeId: user.id, trainingAssignmentId: assignment.id } });
        if (!a) missing();
        await tx.$queryRaw`SELECT id FROM quiz_attempts WHERE id = ${a.id}::uuid FOR UPDATE`;
        const current = await tx.quizAttempt.findUnique({ where: { id: a.id }, include: { answers: true } });
        const quiz = await loadQuiz(tx, a.quizId);
        if (current.status === 'SUBMITTED') {
          if (current.answers.length !== submitted.size || current.answers.some((answer) => submitted.get(answer.questionId) !== answer.selectedOptionId)) conflict('This attempt was already submitted with different answers.');
          return review(current, quiz);
        }
        const training = await tx.trainingProgram.findUnique({ where: { id: assignment.trainingId } });
        if (training.status !== 'PUBLISHED' || quiz.status !== 'PUBLISHED' || current.status !== 'IN_PROGRESS') conflict('This attempt is no longer available.');
        if (!assignment.progress?.materialCompletedAt || assignment.progress.progressPercent !== 100) conflict('Finish the course material first.');
        if (submitted.size !== quiz.questions.length) fail('Answer every question before submission.');
        let earned = 0, possible = 0;
        const answers = quiz.questions.map((q) => {
          const selected = q.options.find((o) => o.id === submitted.get(q.id));
          if (!selected) fail('Invalid question or answer option.');
          const points = selected.isCorrect ? q.points : 0;
          earned += points; possible += q.points;
          return { attemptId: a.id, questionId: q.id, selectedOptionId: selected.id, awardedPoints: points };
        });
        await tx.quizAnswer.createMany({ data: answers });
        const passed = earned * 100 >= current.passingPercent * possible;
        await tx.quizAttempt.update({ where: { id: a.id }, data: { status: 'SUBMITTED', submittedAt: new Date(),
          earnedPoints: earned, possiblePoints: possible, scorePercent: Math.round(earned * 10000 / possible) / 100, passed } });
        if (passed && assignment.progress.status !== 'COMPLETED') await tx.trainingProgress.update({ where: { assignmentId: assignment.id }, data: {
          status: 'COMPLETED', completedAt: new Date(), lastActivityAt: new Date(), qualifyingAttemptId: a.id } });
        if (passed) await issueEligibleCertificate(tx, assignment.id);
        await audit(tx, user, training.id, 'COURSE_QUIZ_SUBMITTED', { quizId: quiz.id, attemptId: a.id, passed });
        return review(await tx.quizAttempt.findUnique({ where: { id: a.id }, include: { answers: true } }), quiz);
      });
    },
  };
}
