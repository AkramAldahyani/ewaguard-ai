import { createNotificationService } from '../notifications/notification-service.js';
import { analysisOverview } from '../analytics/analysis-analytics.js';
import { securityPeriod } from '../analytics/security-analytics.js';
import { identitySelect } from '../users/user-identity.js';
import { MONTHLY_ELIGIBLE_EMPLOYEE } from '../analytics/monthly-eligibility.js';

// The overview is a preview: full incident and notification histories remain on their own pages.
export const DASHBOARD_LIMITS = Object.freeze({ incidents: 2, notifications: 3 });
const openStatuses = ['NEW', 'UNDER_INVESTIGATION', 'CONTAINED'];
const activeEmployee = { status: 'ACTIVE', deactivatedAt: null, role: { name: 'EMPLOYEE' } };
const currentTraining = { revokedAt: null, employee: activeEmployee, training: { status: 'PUBLISHED' } };
const fullName = (person) => (person ? `${person.firstName} ${person.lastName}`.trim() : null);
const reference = (row) => `INC-${row.createdAt.getUTCFullYear()}-${String(row.number).padStart(6, '0')}`;

export function createDashboardService(database) {
  return {
    async overview(user) {
      const notifications = createNotificationService(database);
      const generatedAt = new Date();
      const analysisRange = securityPeriod({ period: '30d' }, generatedAt);
      const [
        analyses,
        activeEmployees,
        totalIncidents,
        openIncidents,
        highOpen,
        criticalOpen,
        awaitingAssignment,
        publishedPrograms,
        assignedEmployees,
        activeAssignments,
        completedAssignments,
        inProgressAssignments,
        publishedMonthlyQuizzes,
        monthlyRows,
        certificatesIssued,
        pendingPosts,
        recentIncidents,
        recentPendingPosts,
        unread,
        recentNotifications,
      ] = await Promise.all([
        analysisOverview(database, analysisRange),
        database.user.count({ where: activeEmployee }),
        database.incident.count(),
        database.incident.count({ where: { status: { in: openStatuses } } }),
        database.incident.count({ where: { status: { in: openStatuses }, severity: 'HIGH' } }),
        database.incident.count({ where: { status: { in: openStatuses }, severity: 'CRITICAL' } }),
        database.incident.count({ where: { status: { in: openStatuses }, assigneeId: null } }),
        database.trainingProgram.count({ where: { status: 'PUBLISHED' } }),
        database.user.count({
          where: {
            ...activeEmployee,
            trainingAssignments: {
              some: {
                revokedAt: null,
                training: { status: 'PUBLISHED' },
              },
            },
          },
        }),
        database.trainingAssignment.count({ where: currentTraining }),
        database.trainingProgress.count({ where: { assignment: currentTraining, status: 'COMPLETED' } }),
        database.trainingProgress.count({ where: { assignment: currentTraining, status: 'IN_PROGRESS' } }),
        database.monthlyQuiz.count({ where: { quiz: { status: 'PUBLISHED' } } }),
        // Expected employee-quiz pairs for every published or archived quiz that has opened, and how many of
        // those employees submitted. Employees who never started still count toward the denominator.
        database.$queryRaw`SELECT count(*)::int AS eligible,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM monthly_quiz_assignments ma
            JOIN quiz_attempts qa ON qa."monthlyAssignmentId" = ma.id
            WHERE ma."monthlyQuizId" = mq.id AND ma."employeeId" = u.id AND ma."revokedAt" IS NULL
            AND qa.status = 'SUBMITTED'))::int AS submitted
          FROM monthly_quizzes mq JOIN quizzes q ON q.id = mq."quizId"
          JOIN users u ON ${MONTHLY_ELIGIBLE_EMPLOYEE} JOIN roles r ON r.id = u."roleId"
          WHERE r.name = 'EMPLOYEE' AND q.status IN ('PUBLISHED', 'ARCHIVED') AND mq."opensAt" <= ${generatedAt}`,
        database.certificate.count({ where: { revokedAt: null } }),
        database.communityPost.count({ where: { status: 'PENDING_REVIEW' } }),
        database.incident.findMany({
          take: DASHBOARD_LIMITS.incidents,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            number: true,
            severity: true,
            status: true,
            createdAt: true,
            reporterId: true,
            reporter: { select: identitySelect },
            assignee: { select: { firstName: true, lastName: true } },
          },
        }),
        database.communityPost.findMany({
          where: { status: 'PENDING_REVIEW' },
          take: 5,
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            title: true,
            category: true,
            submittedAt: true,
            author: { select: { firstName: true, lastName: true } },
          },
        }),
        notifications.unread(user),
        notifications.list(user, { limit: String(DASHBOARD_LIMITS.notifications), unread: 'true' }),
      ]);
      const monthlyParticipations = monthlyRows[0]?.eligible ?? 0,
        monthlySubmitted = monthlyRows[0]?.submitted ?? 0;
      return {
        generatedAt: generatedAt.toISOString(),
        metrics: {
          analyses: {
            total: analyses.total,
            severity: analyses.severity,
            period: {
              key: analysisRange.period,
              days: analysisRange.days,
              start: analysisRange.start.toISOString().slice(0, 10),
              end: new Date(analysisRange.endExclusive.getTime() - 86400000).toISOString().slice(0, 10),
              timezone: 'UTC',
            },
          },
          employees: { active: activeEmployees },
          incidents: { total: totalIncidents, open: openIncidents, highOpen, criticalOpen, awaitingAssignment },
          awareness: {
            publishedPrograms,
            assignedEmployees,
            activeAssignments,
            completedAssignments,
            inProgressAssignments,
            publishedMonthlyQuizzes,
            monthlyParticipations,
            monthlySubmitted,
            certificatesIssued,
          },
          community: { pendingPosts },
        },
        recentIncidents: recentIncidents.map((row) => ({
          id: row.id,
          reference: reference(row),
          severity: row.severity,
          status: row.status,
          createdAt: row.createdAt,
          reporterId: row.reporterId,
          reporter: row.reporter,
          assigneeName: fullName(row.assignee),
          urgent: row.severity === 'HIGH' || row.severity === 'CRITICAL',
        })),
        pendingPosts: recentPendingPosts.map((row) => ({
          id: row.id,
          title: row.title,
          category: row.category,
          submittedAt: row.submittedAt,
          authorName: fullName(row.author),
        })),
        notifications: { unreadCount: unread.unreadCount, items: recentNotifications.items },
      };
    },
  };
}
