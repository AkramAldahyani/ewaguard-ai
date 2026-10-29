import { actorKind, identitySelect } from './user-identity.js';

const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const incidentStatuses = ['NEW', 'UNDER_INVESTIGATION', 'CONTAINED', 'RESOLVED', 'FALSE_POSITIVE', 'CLOSED'];

const distribution = (values, rows, field) => {
  const counts = new Map(rows.map((row) => [row[field], row._count._all]));
  return values.map((value) => ({ value, count: counts.get(value) ?? 0 }));
};
const percent = (part, total) => total ? Math.round(part / total * 100) : 0;
const incidentReference = (row) => `INC-${row.createdAt.getUTCFullYear()}-${String(row.number).padStart(6, '0')}`;

function setupState(user, now) {
  if (user.passwordHash) return 'COMPLETE';
  if (user.deletedAt || user.status === 'DEACTIVATED' || user.status === 'SUSPENDED') return 'UNAVAILABLE';
  if (!user.setupTokenHash || !user.setupTokenExpiresAt) return 'NOT_ISSUED';
  return user.setupTokenExpiresAt > now ? 'PENDING' : 'EXPIRED';
}

export async function loadUserProfile(database, id, now = new Date()) {
  return database.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id }, select: {
      id: true, employeeIdentifier: true, firstName: true, lastName: true, email: true,
      status: true, deactivatedAt: true, deletedAt: true, createdAt: true, updatedAt: true, lastLoginAt: true,
      passwordHash: true, mfaEnabledAt: true, setupTokenHash: true, setupTokenExpiresAt: true,
      role: { select: { name: true } }, department: { select: { id: true, name: true, code: true } },
    } });
    if (!user) return null;
    const account = { id: user.id, employeeIdentifier: user.employeeIdentifier, firstName: user.firstName,
      lastName: user.lastName, email: user.email, status: user.status, deactivatedAt: user.deactivatedAt,
      deletedAt: user.deletedAt, createdAt: user.createdAt, updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt, role: user.role, department: user.department };
    const [emailCount, urlCount, fileCount, incidentCount, severityRows, statusRows, recentIncidents,
      trainingAssignments, monthlyAssigned, monthlyParticipated, certificateCount, recentCertificates, securityEvents] = await Promise.all([
      tx.emailAnalysis.count({ where: { userId: id } }),
      tx.urlAnalysis.count({ where: { userId: id } }),
      tx.fileAnalysis.count({ where: { userId: id } }),
      tx.incident.count({ where: { reporterId: id } }),
      tx.incident.groupBy({ by: ['severity'], where: { reporterId: id }, _count: { _all: true } }),
      tx.incident.groupBy({ by: ['status'], where: { reporterId: id }, _count: { _all: true } }),
      tx.incident.findMany({ where: { reporterId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 5,
        select: { id: true, number: true, title: true, severity: true, status: true, createdAt: true } }),
      tx.trainingAssignment.findMany({ where: { employeeId: id, revokedAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, dueAt: true, createdAt: true, training: { select: { id: true, title: true } },
          progress: { select: { status: true, progressPercent: true, completedAt: true, lastActivityAt: true } } } }),
      tx.monthlyQuizAssignment.count({ where: { employeeId: id, revokedAt: null } }),
      tx.monthlyQuizAssignment.count({ where: { employeeId: id, revokedAt: null, attempts: { some: { status: 'SUBMITTED' } } } }),
      tx.certificate.count({ where: { revokedAt: null, progress: { assignment: { employeeId: id } } } }),
      tx.certificate.findMany({ where: { revokedAt: null, progress: { assignment: { employeeId: id } } },
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], take: 4,
        select: { id: true, certificateNumber: true, trainingTitle: true, issuedAt: true, completedAt: true } }),
      tx.auditLog.findMany({ where: { resourceId: id, resourceType: { in: ['USER', 'AUTHENTICATION'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 8,
        select: { id: true, actorId: true, actor: { select: identitySelect }, action: true, outcome: true,
          resourceType: true, createdAt: true, metadata: true } }),
    ]);
    const completedTraining = trainingAssignments.filter((row) => row.progress?.status === 'COMPLETED').length;
    return {
      user: account,
      profile: {
        accountSecurity: {
          credentialStatus: user.passwordHash ? 'CONFIGURED' : 'NOT_CONFIGURED',
          mfaStatus: user.role.name === 'IT_SECURITY_ADMIN' ? user.mfaEnabledAt ? 'ENROLLED' : 'NOT_ENROLLED' : 'NOT_REQUIRED',
          setupState: setupState(user, now),
          setupExpiresAt: !user.passwordHash && user.setupTokenHash ? user.setupTokenExpiresAt : null,
          events: securityEvents.map(({ metadata, ...event }) => ({ ...event, actorKind: actorKind(event.actorId, metadata?.system) })),
        },
        security: {
          analyses: { total: emailCount + urlCount + fileCount, email: emailCount, url: urlCount, file: fileCount },
          incidents: { total: incidentCount, bySeverity: distribution(severities, severityRows, 'severity'),
            byStatus: distribution(incidentStatuses, statusRows, 'status'),
            recent: recentIncidents.map((row) => ({ ...row, reference: incidentReference(row) })) },
        },
        awareness: {
          training: { assigned: trainingAssignments.length, completed: completedTraining,
            completionPercent: percent(completedTraining, trainingAssignments.length),
            recent: trainingAssignments.slice(0, 5).map((row) => ({ id: row.id, trainingId: row.training.id,
              title: row.training.title, dueAt: row.dueAt, assignedAt: row.createdAt,
              status: row.progress?.status ?? 'NOT_STARTED', progressPercent: row.progress?.progressPercent ?? 0,
              completedAt: row.progress?.completedAt ?? null, lastActivityAt: row.progress?.lastActivityAt ?? null })) },
          monthlyQuizzes: { assigned: monthlyAssigned, participated: monthlyParticipated,
            participationPercent: percent(monthlyParticipated, monthlyAssigned) },
          certificates: { earned: certificateCount, recent: recentCertificates },
        },
      },
    };
  }, { isolationLevel: 'RepeatableRead' });
}
