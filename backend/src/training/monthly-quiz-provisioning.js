import { createMonthlyQuizService } from './monthly-quiz-service.js';
import { TrainingError } from './training-policy.js';
import { findProvisioningAdmin } from './course-provisioning.js';
import { monthlyDraft } from './content/monthly-quiz-builders.js';

// Development-only provisioning of a monthly quiz draft through the existing monthly quiz service, so validation,
// the one-quiz-per-month constraint and MONTHLY_QUIZ_CREATED auditing match the administrator API.
// A month that already has a quiz is reported and never modified. Nothing is approved, published or attempted.
export async function provisionMonthlyQuiz(database, { adminEmail, content }) {
  const admin = await findProvisioningAdmin(database, adminEmail);
  const draft = monthlyDraft(content);
  const existing = await database.monthlyQuiz.findUnique({ where: { period: new Date(`${draft.period}-01T00:00:00.000Z`) },
    select: { id: true, quiz: { select: { title: true, status: true } } } });
  if (existing) return { outcome: 'ALREADY_EXISTS', period: draft.period, id: existing.id, title: existing.quiz.title, status: existing.quiz.status };
  try {
    const { monthlyQuiz } = await createMonthlyQuizService(database).create(admin, draft);
    return { outcome: 'CREATED', period: draft.period, id: monthlyQuiz.id, title: monthlyQuiz.title, status: monthlyQuiz.status };
  } catch (error) {
    // Another process created the month concurrently; report it rather than retrying or overwriting.
    if (error instanceof TrainingError && error.code === 'MONTHLY_QUIZ_CONFLICT') return { outcome: 'ALREADY_EXISTS', period: draft.period };
    throw error;
  }
}
