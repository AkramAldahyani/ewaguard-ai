import { blankQuestion, blankQuiz, quizBody, quizDraftFromServer, validateQuizDraft } from '../training/quiz-model.js';
import { topics } from '../training/training-model.js';

export const monthName = (period) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(period ?? '')
    ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${period}-01T00:00:00Z`),
      )
    : 'Unknown month';
export const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Not set';
const nextPeriod = (period) =>
  new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 1)).toISOString().slice(0, 7);
export const blankMonthly = () => {
  const period = new Date().toISOString().slice(0, 7);
  return {
    ...blankQuiz(),
    period,
    opensAt: `${period}-01T00:00`,
    closesAt: `${nextPeriod(period)}-01T00:00`,
    questions: [{ ...blankQuestion(), topic: 'PHISHING' }],
  };
};
export function withPeriod(draft, period) {
  return { ...draft, period, opensAt: `${period}-01T00:00`, closesAt: `${nextPeriod(period)}-01T00:00` };
}
export function monthlyFromServer(record) {
  return {
    ...quizDraftFromServer(record.quiz),
    period: record.period,
    opensAt: record.opensAt.slice(0, 16),
    closesAt: record.closesAt.slice(0, 16),
    questions: record.quiz.questions.map((question, index) => ({
      ...quizDraftFromServer(record.quiz).questions[index],
      topic: question.topic,
    })),
  };
}
export function validateMonthly(draft) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.period)) return 'Select a valid month.';
  const opens = new Date(`${draft.opensAt}:00.000Z`),
    closes = new Date(`${draft.closesAt}:00.000Z`);
  const start = new Date(`${draft.period}-01T00:00:00Z`),
    end = new Date(`${nextPeriod(draft.period)}-01T00:00:00Z`);
  if (
    Number.isNaN(opens.getTime()) ||
    Number.isNaN(closes.getTime()) ||
    opens < start ||
    closes > end ||
    opens >= closes
  )
    return 'Choose a UTC opening and closing time within the selected month.';
  if (draft.questions.some((question) => !topics.includes(question.topic)))
    return 'Choose an approved topic for every question.';
  return validateQuizDraft(draft);
}
export function monthlyBody(draft, edit = false, expectedUpdatedAt) {
  return {
    ...quizBody(draft),
    questions: quizBody(draft).questions.map((question, index) => ({
      ...question,
      topic: draft.questions[index].topic,
    })),
    opensAt: `${draft.opensAt}:00.000Z`,
    closesAt: `${draft.closesAt}:00.000Z`,
    ...(edit ? { expectedUpdatedAt } : { period: draft.period }),
  };
}
export function monthlyError(error) {
  if (error?.status === 401) return 'Your session or administrator MFA verification expired. Sign in again.';
  if (error?.status === 403) return 'You are not authorized to access this monthly quiz.';
  if (error?.status === 404) return 'This monthly quiz or attempt is unavailable to your account.';
  if (error?.code === 'TRAINING_STALE')
    return 'Another administrator changed this quiz. Your local draft remains intact; review the latest saved version.';
  if (error?.code === 'MONTHLY_QUIZ_CONFLICT') {
    const specific = {
      'A monthly quiz already exists for this month.':
        'This month already has a quiz. Open the existing record instead.',
      'No monthly quiz attempts remain.': 'No attempts remain for this quiz.',
      'This monthly quiz is already passed.': 'You have already passed this monthly quiz.',
      'This monthly quiz is not open for attempts.': 'This quiz is not open for attempts. Refresh its schedule.',
      'This monthly quiz is no longer open.': 'The submission window has closed. Your answers were not graded.',
      'This attempt was submitted with different answers.':
        'This attempt was already submitted with different answers. Refresh its recorded result.',
    };
    return (
      specific[error.message] ?? 'This monthly quiz action is no longer available. Refresh the record before retrying.'
    );
  }
  if (error?.status === 429) return 'Too many requests. Wait briefly and try again.';
  if (error?.status === 400) return 'The request was rejected. Check the quiz fields and answers.';
  return 'The monthly quiz service could not complete the request. Try again.';
}
