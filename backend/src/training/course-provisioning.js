import { createTrainingService } from './training-service.js';
import { createCourseQuizService } from './course-quiz-service.js';

export class ProvisioningError extends Error {}

// The named author must be an active IT/security administrator with MFA enrolled.
export async function findProvisioningAdmin(database, adminEmail) {
  if (typeof adminEmail !== 'string' || !adminEmail.trim()) throw new ProvisioningError('Provide an administrator email address.');
  const admin = await database.user.findFirst({ where: { email: adminEmail.trim().toLowerCase(), status: 'ACTIVE', deactivatedAt: null,
    role: { name: 'IT_SECURITY_ADMIN' }, mfaEnabledAt: { not: null } }, select: { id: true } });
  if (!admin) throw new ProvisioningError('An active IT/security administrator account with MFA enrolled is required.');
  return admin;
}

// Development-only content provisioning through the same services the administrator API uses.
// A program with the same title (any topic, case-insensitive) counts as existing.
// It only ever creates a draft course and a draft quiz attributed to a named administrator.
// Existing programs, quizzes, assignments, progress, attempts and certificates are never modified,
// and review, publication and assignment remain deliberate administrator actions in the UI.
export async function provisionCourse(database, { adminEmail, course, quiz }) {
  const admin = await findProvisioningAdmin(database, adminEmail);
  const existing = await database.trainingProgram.findMany({ where: { title: { equals: course.title, mode: 'insensitive' } },
    select: { id: true, status: true, requiresQuiz: true, quiz: { select: { id: true } } }, take: 2 });
  if (existing.length > 1) return { outcome: 'MULTIPLE_EXISTING', courseCreated: false, quizCreated: false };
  let program = existing[0], courseCreated = false;
  if (!program) {
    ({ program } = await createTrainingService(database).create(admin, course));
    courseCreated = true;
  }
  if (program.status === 'ARCHIVED' || !program.requiresQuiz || program.quiz) {
    return { outcome: courseCreated ? 'CREATED' : 'ALREADY_EXISTS', programId: program.id, status: program.status, courseCreated, quizCreated: false };
  }
  // Completes a previous partial run; save() itself refuses if another quiz was attached concurrently.
  await createCourseQuizService(database).save(admin, program.id, quiz);
  return { outcome: courseCreated ? 'CREATED' : 'QUIZ_ADDED', programId: program.id, status: program.status, courseCreated, quizCreated: true };
}
