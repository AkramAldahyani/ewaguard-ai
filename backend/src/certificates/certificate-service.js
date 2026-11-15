import { randomUUID } from 'node:crypto';
import { fail, identifier, pageInput, searchText } from '../training/training-policy.js';

const missing = () => fail('Certificate not found.', 404, 'CERTIFICATE_NOT_FOUND');
const select = {
  id: true,
  certificateNumber: true,
  issuedAt: true,
  completedAt: true,
  employeeName: true,
  trainingTitle: true,
  scorePercent: true,
  revokedAt: true,
  progress: { select: { id: true, assignment: { select: { employeeId: true, trainingId: true } } } },
};
const serialize = (row) => ({
  id: row.id,
  certificateNumber: row.certificateNumber,
  issuedAt: row.issuedAt,
  completedAt: row.completedAt,
  employeeName: row.employeeName,
  trainingTitle: row.trainingTitle,
  scorePercent: row.scorePercent === null ? null : Number(row.scorePercent),
  status: row.revokedAt ? 'REVOKED' : 'ISSUED',
  trainingId: row.progress.assignment.trainingId,
  employeeId: row.progress.assignment.employeeId,
});

// Called inside the locked assignment completion transaction. Historical reconciliation
// takes the same program -> assignment lock order before invoking this function.
export async function issueEligibleCertificate(tx, assignmentId) {
  const assignment = await tx.trainingAssignment.findUnique({
    where: { id: assignmentId },
    include: { progress: true, training: true, employee: { select: { firstName: true, lastName: true } } },
  });
  if (
    !assignment?.progress ||
    assignment.progress.status !== 'COMPLETED' ||
    !assignment.progress.completedAt ||
    !assignment.progress.materialCompletedAt ||
    assignment.progress.progressPercent !== 100
  )
    return null;
  const progress = assignment.progress;
  let scorePercent = null;
  if (assignment.training.requiresQuiz) {
    if (!progress.qualifyingAttemptId) return null;
    const attempt = await tx.quizAttempt.findFirst({
      where: {
        id: progress.qualifyingAttemptId,
        trainingAssignmentId: assignment.id,
        employeeId: assignment.employeeId,
        status: 'SUBMITTED',
        passed: true,
        quiz: { kind: 'COURSE', trainingQuiz: { trainingId: assignment.trainingId } },
      },
      select: { scorePercent: true, submittedAt: true },
    });
    if (!attempt?.submittedAt || attempt.scorePercent === null) return null;
    scorePercent = attempt.scorePercent;
  } else if (progress.qualifyingAttemptId) return null;
  const previous = await tx.certificate.findUnique({ where: { progressId: progress.id }, select: { id: true } });
  if (previous) return previous;
  const certificate = await tx.certificate.create({
    data: {
      progressId: progress.id,
      certificateNumber: randomUUID(),
      completedAt: progress.completedAt,
      employeeName: `${assignment.employee.firstName} ${assignment.employee.lastName}`.trim(),
      trainingTitle: assignment.training.title,
      scorePercent,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: assignment.employeeId,
      action: 'TRAINING_CERTIFICATE_ISSUED',
      resourceType: 'CERTIFICATE',
      resourceId: certificate.id,
      outcome: 'SUCCESS',
      metadata: { progressId: progress.id, trainingId: assignment.trainingId },
      retentionUntil: new Date(Date.now() + 90 * 86400000),
    },
  });
  return certificate;
}

async function reconcile(database, employeeId) {
  const assignments = await database.trainingAssignment.findMany({
    where: { employeeId, progress: { status: 'COMPLETED', certificate: null } },
    select: { id: true, trainingId: true },
  });
  for (const assignment of assignments)
    await database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM training_programs WHERE id = ${assignment.trainingId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM training_assignments WHERE id = ${assignment.id}::uuid FOR UPDATE`;
      await issueEligibleCertificate(tx, assignment.id);
    });
}

export function createCertificateService(database) {
  return {
    async mine(user, query) {
      const paging = pageInput(query);
      await reconcile(database, user.id);
      const rows = await database.certificate.findMany({
        where: { progress: { assignment: { employeeId: user.id } } },
        select,
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.pageSize + 1,
      });
      return {
        items: rows.slice(0, paging.pageSize).map((row) => {
          const item = serialize(row);
          delete item.employeeId;
          return item;
        }),
        page: paging.page,
        pageSize: paging.pageSize,
        hasMore: rows.length > paging.pageSize,
      };
    },
    async adminList(query) {
      const paging = pageInput(query, ['search', 'status']);
      const search = searchText(query.search);
      if (query.status !== undefined && !['ISSUED', 'REVOKED'].includes(query.status)) fail();
      const rows = await database.certificate.findMany({
        where: {
          ...(query.status ? { revokedAt: query.status === 'REVOKED' ? { not: null } : null } : {}),
          ...(search
            ? {
                OR: [
                  { employeeName: { contains: search, mode: 'insensitive' } },
                  { trainingTitle: { contains: search, mode: 'insensitive' } },
                  ...(/^[0-9a-f-]{36}$/i.test(search) ? [{ certificateNumber: identifier(search) }] : []),
                ],
              }
            : {}),
        },
        select,
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.pageSize + 1,
      });
      return {
        items: rows.slice(0, paging.pageSize).map(serialize),
        page: paging.page,
        pageSize: paging.pageSize,
        hasMore: rows.length > paging.pageSize,
      };
    },
    async detail(user, id, admin = false) {
      const row = await database.certificate.findFirst({
        where: { id: identifier(id), ...(admin ? {} : { progress: { assignment: { employeeId: user.id } } }) },
        select,
      });
      if (!row) missing();
      const item = serialize(row);
      if (!admin) delete item.employeeId;
      return { certificate: item };
    },
    async verify(number) {
      const row = await database.certificate.findUnique({ where: { certificateNumber: identifier(number) }, select });
      if (!row) missing();
      const progress = await database.trainingProgress.findUnique({
        where: { id: row.progress.id },
        select: {
          status: true,
          progressPercent: true,
          completedAt: true,
          materialCompletedAt: true,
          qualifyingAttemptId: true,
          assignment: {
            select: { id: true, employeeId: true, trainingId: true, training: { select: { requiresQuiz: true } } },
          },
        },
      });
      let quizConfirmed = false;
      if (progress?.assignment.training.requiresQuiz && progress.qualifyingAttemptId) {
        const attempt = await database.quizAttempt.findFirst({
          where: {
            id: progress.qualifyingAttemptId,
            trainingAssignmentId: progress.assignment.id,
            employeeId: progress.assignment.employeeId,
            status: 'SUBMITTED',
            passed: true,
            quiz: { kind: 'COURSE', trainingQuiz: { trainingId: progress.assignment.trainingId } },
          },
          select: { scorePercent: true },
        });
        quizConfirmed =
          attempt?.scorePercent !== null &&
          attempt?.scorePercent !== undefined &&
          Number(attempt.scorePercent) === Number(row.scorePercent);
      } else if (progress && !progress.assignment.training.requiresQuiz)
        quizConfirmed = !progress.qualifyingAttemptId && row.scorePercent === null;
      return {
        certificate: serialize(row),
        trainingCompletionConfirmed:
          progress?.status === 'COMPLETED' &&
          progress.progressPercent === 100 &&
          Boolean(progress.completedAt && progress.materialCompletedAt) &&
          progress.completedAt.getTime() === row.completedAt.getTime() &&
          quizConfirmed,
      };
    },
  };
}
