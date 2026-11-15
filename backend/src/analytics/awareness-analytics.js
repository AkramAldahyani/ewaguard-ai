import { awarenessFilters, AwarenessAnalyticsError } from './awareness-policy.js';
import { MONTHLY_ELIGIBLE_EMPLOYEE } from './monthly-eligibility.js';

const rate = (part, whole) => (whole ? Math.round((part * 10000) / whole) / 100 : null);
const two = (value) => (value == null ? null : Math.round(Number(value) * 100) / 100);
const id = (value) => (value == null ? null : String(value));

export function createAwarenessAnalytics(database) {
  return {
    async overview(query, now = new Date()) {
      const filter = awarenessFilters(query, now);
      const { start, endExclusive, programId, departmentId, completionStatus, monthlyPeriod } = filter;
      const startDay = start.toISOString().slice(0, 10),
        endDay = endExclusive.toISOString().slice(0, 10);
      const month = monthlyPeriod == null ? null : `${monthlyPeriod}-01`;
      const population = await database.$queryRaw`SELECT u."departmentId" AS id, count(*)::int AS count
        FROM users u JOIN roles r ON r.id = u."roleId" WHERE r.name = 'EMPLOYEE'
        AND u.status = 'ACTIVE' AND u."deactivatedAt" IS NULL GROUP BY u."departmentId"`;
      const departmentSize = population.find((row) => row.id === departmentId)?.count ?? 0;
      if (departmentId && departmentSize < 5)
        throw new AwarenessAnalyticsError('Department analytics require at least five active employees.');

      const [
        trainingRows,
        completionRows,
        programRows,
        courseRows,
        courseProgramRows,
        monthlyRows,
        certificateRows,
        certificateProgramRows,
        trainingDepartments,
        monthlyDepartments,
        departmentNames,
      ] = await Promise.all([
        database.$queryRaw`SELECT count(*)::int AS assignments, count(DISTINCT ta."trainingId")::int AS programs,
          count(DISTINCT ta."employeeId")::int AS employees,
          count(*) FILTER (WHERE coalesce(tp.status::text, 'NOT_STARTED') = 'COMPLETED')::int AS completed,
          count(*) FILTER (WHERE coalesce(tp.status::text, 'NOT_STARTED') = 'IN_PROGRESS')::int AS "inProgress",
          count(*) FILTER (WHERE coalesce(tp.status::text, 'NOT_STARTED') = 'NOT_STARTED')::int AS "notStarted"
          FROM training_assignments ta JOIN users u ON u.id = ta."employeeId"
          JOIN roles r ON r.id = u."roleId" LEFT JOIN training_progress tp ON tp."assignmentId" = ta.id
          WHERE r.name = 'EMPLOYEE' AND ta."revokedAt" IS NULL
          AND ta."createdAt" >= ${start} AND ta."createdAt" < ${endExclusive}
          AND (${programId}::uuid IS NULL OR ta."trainingId" = ${programId}::uuid)
          AND (${departmentId}::uuid IS NULL OR u."departmentId" = ${departmentId}::uuid)
          AND (${completionStatus}::text IS NULL OR coalesce(tp.status::text, 'NOT_STARTED') = ${completionStatus}::text)`,
        database.$queryRaw`SELECT count(*)::int AS completed FROM training_progress tp
          JOIN training_assignments ta ON ta.id = tp."assignmentId"
          JOIN users u ON u.id = ta."employeeId" JOIN roles r ON r.id = u."roleId"
          WHERE r.name = 'EMPLOYEE' AND ta."revokedAt" IS NULL AND tp.status = 'COMPLETED'
          AND tp."completedAt" >= ${start} AND tp."completedAt" < ${endExclusive}
          AND (${programId}::uuid IS NULL OR ta."trainingId" = ${programId}::uuid)
          AND (${departmentId}::uuid IS NULL OR u."departmentId" = ${departmentId}::uuid)
          AND (${completionStatus}::text IS NULL OR ${completionStatus}::text = 'COMPLETED')`,
        database.$queryRaw`SELECT tr.id, tr.title, count(*)::int AS assignments,
          count(*) FILTER (WHERE coalesce(tp.status::text, 'NOT_STARTED') = 'COMPLETED')::int AS completed,
          count(*) FILTER (WHERE coalesce(tp.status::text, 'NOT_STARTED') = 'IN_PROGRESS')::int AS "inProgress",
          count(*) FILTER (WHERE coalesce(tp.status::text, 'NOT_STARTED') = 'NOT_STARTED')::int AS "notStarted"
          FROM training_assignments ta JOIN training_programs tr ON tr.id = ta."trainingId"
          JOIN users u ON u.id = ta."employeeId" JOIN roles r ON r.id = u."roleId"
          LEFT JOIN training_progress tp ON tp."assignmentId" = ta.id
          WHERE r.name = 'EMPLOYEE' AND ta."revokedAt" IS NULL
          AND ta."createdAt" >= ${start} AND ta."createdAt" < ${endExclusive}
          AND (${programId}::uuid IS NULL OR ta."trainingId" = ${programId}::uuid)
          AND (${departmentId}::uuid IS NULL OR u."departmentId" = ${departmentId}::uuid)
          AND (${completionStatus}::text IS NULL OR coalesce(tp.status::text, 'NOT_STARTED') = ${completionStatus}::text)
          GROUP BY tr.id, tr.title ORDER BY assignments DESC, tr.id LIMIT 21`,
        database.$queryRaw`SELECT count(*)::int AS attempts, count(DISTINCT qa."employeeId")::int AS participants,
          count(*) FILTER (WHERE qa.passed IS TRUE)::int AS passed,
          count(*) FILTER (WHERE qa.passed IS FALSE)::int AS failed,
          avg(qa."scorePercent")::double precision AS "averageScore"
          FROM quiz_attempts qa JOIN training_assignments ta ON ta.id = qa."trainingAssignmentId"
          JOIN users u ON u.id = qa."employeeId" JOIN roles r ON r.id = u."roleId"
          WHERE r.name = 'EMPLOYEE' AND qa.status = 'SUBMITTED' AND qa."scorePercent" IS NOT NULL
          AND qa."submittedAt" >= ${start} AND qa."submittedAt" < ${endExclusive}
          AND (${programId}::uuid IS NULL OR ta."trainingId" = ${programId}::uuid)
          AND (${departmentId}::uuid IS NULL OR u."departmentId" = ${departmentId}::uuid)`,
        database.$queryRaw`SELECT tr.id, tr.title, count(*)::int AS attempts,
          count(DISTINCT qa."employeeId")::int AS participants,
          count(*) FILTER (WHERE qa.passed IS TRUE)::int AS passed,
          avg(qa."scorePercent")::double precision AS "averageScore"
          FROM quiz_attempts qa JOIN training_assignments ta ON ta.id = qa."trainingAssignmentId"
          JOIN training_programs tr ON tr.id = ta."trainingId"
          JOIN users u ON u.id = qa."employeeId" JOIN roles r ON r.id = u."roleId"
          WHERE r.name = 'EMPLOYEE' AND qa.status = 'SUBMITTED' AND qa."scorePercent" IS NOT NULL
          AND qa."submittedAt" >= ${start} AND qa."submittedAt" < ${endExclusive}
          AND (${programId}::uuid IS NULL OR tr.id = ${programId}::uuid)
          AND (${departmentId}::uuid IS NULL OR u."departmentId" = ${departmentId}::uuid)
          GROUP BY tr.id, tr.title ORDER BY attempts DESC, tr.id LIMIT 21`,
        // Denominator: every employee expected to take the quiz (see monthly-eligibility.js), whether or not
        // they started it. Submissions count only for those expected employees, so submitted <= eligible.
        database.$queryRaw`WITH eligible AS (
            SELECT mq.id AS "monthlyQuizId", u.id AS "employeeId" FROM monthly_quizzes mq
            JOIN quizzes q ON q.id = mq."quizId" JOIN users u ON ${MONTHLY_ELIGIBLE_EMPLOYEE}
            JOIN roles r ON r.id = u."roleId"
            WHERE r.name = 'EMPLOYEE' AND q.status IN ('PUBLISHED', 'ARCHIVED')
            AND mq.period >= ${startDay}::date AND mq.period < ${endDay}::date
            AND (${month}::date IS NULL OR mq.period = ${month}::date)
            AND (${departmentId}::uuid IS NULL OR u."departmentId" = ${departmentId}::uuid)
          ), best AS (
            SELECT ma."monthlyQuizId", ma."employeeId", qa."scorePercent",
              row_number() OVER (PARTITION BY qa."monthlyAssignmentId"
                ORDER BY qa."scorePercent" DESC, qa."submittedAt" ASC, qa."attemptNumber" ASC) AS rank
            FROM quiz_attempts qa JOIN monthly_quiz_assignments ma ON ma.id = qa."monthlyAssignmentId"
            JOIN eligible e ON e."monthlyQuizId" = ma."monthlyQuizId" AND e."employeeId" = ma."employeeId"
            WHERE qa.status = 'SUBMITTED' AND qa."scorePercent" IS NOT NULL
          ) SELECT to_char(mq.period, 'YYYY-MM') AS period,
            count(e."employeeId")::int AS eligible, count(best."employeeId")::int AS submitted,
            avg(best."scorePercent")::double precision AS "averageScore"
          FROM monthly_quizzes mq JOIN quizzes q ON q.id = mq."quizId"
          LEFT JOIN eligible e ON e."monthlyQuizId" = mq.id
          LEFT JOIN best ON best."monthlyQuizId" = e."monthlyQuizId" AND best."employeeId" = e."employeeId" AND best.rank = 1
          WHERE q.status IN ('PUBLISHED', 'ARCHIVED')
          AND mq.period >= ${startDay}::date AND mq.period < ${endDay}::date
          AND (${month}::date IS NULL OR mq.period = ${month}::date)
          GROUP BY mq.period ORDER BY mq.period LIMIT 13`,
        database.$queryRaw`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE c."issuedAt" >= ${start} AND c."issuedAt" < ${endExclusive})::int AS "issuedDuring"
          FROM certificates c JOIN training_progress tp ON tp.id = c."progressId"
          JOIN training_assignments ta ON ta.id = tp."assignmentId"
          JOIN users u ON u.id = ta."employeeId" JOIN roles r ON r.id = u."roleId"
          WHERE r.name = 'EMPLOYEE' AND c."revokedAt" IS NULL
          AND (${programId}::uuid IS NULL OR ta."trainingId" = ${programId}::uuid)
          AND (${departmentId}::uuid IS NULL OR u."departmentId" = ${departmentId}::uuid)`,
        database.$queryRaw`SELECT tr.id, tr.title, count(*)::int AS total,
          count(*) FILTER (WHERE c."issuedAt" >= ${start} AND c."issuedAt" < ${endExclusive})::int AS "issuedDuring"
          FROM certificates c JOIN training_progress tp ON tp.id = c."progressId"
          JOIN training_assignments ta ON ta.id = tp."assignmentId"
          JOIN training_programs tr ON tr.id = ta."trainingId"
          JOIN users u ON u.id = ta."employeeId" JOIN roles r ON r.id = u."roleId"
          WHERE r.name = 'EMPLOYEE' AND c."revokedAt" IS NULL
          AND (${programId}::uuid IS NULL OR tr.id = ${programId}::uuid)
          AND (${departmentId}::uuid IS NULL OR u."departmentId" = ${departmentId}::uuid)
          GROUP BY tr.id, tr.title ORDER BY "issuedDuring" DESC, tr.id LIMIT 21`,
        database.$queryRaw`SELECT u."departmentId" AS id, count(*)::int AS assignments,
          count(*) FILTER (WHERE tp.status = 'COMPLETED')::int AS completed
          FROM training_assignments ta JOIN users u ON u.id = ta."employeeId"
          JOIN roles r ON r.id = u."roleId" LEFT JOIN training_progress tp ON tp."assignmentId" = ta.id
          WHERE r.name = 'EMPLOYEE' AND ta."revokedAt" IS NULL AND u."departmentId" IS NOT NULL
          AND ta."createdAt" >= ${start} AND ta."createdAt" < ${endExclusive}
          AND (${programId}::uuid IS NULL OR ta."trainingId" = ${programId}::uuid)
          AND (${completionStatus}::text IS NULL OR coalesce(tp.status::text, 'NOT_STARTED') = ${completionStatus}::text)
          GROUP BY u."departmentId" LIMIT 101`,
        database.$queryRaw`WITH eligible AS (
            SELECT mq.id AS "monthlyQuizId", u.id AS "employeeId", u."departmentId" FROM monthly_quizzes mq
            JOIN quizzes q ON q.id = mq."quizId" JOIN users u ON ${MONTHLY_ELIGIBLE_EMPLOYEE}
            JOIN roles r ON r.id = u."roleId"
            WHERE r.name = 'EMPLOYEE' AND u."departmentId" IS NOT NULL
            AND q.status IN ('PUBLISHED', 'ARCHIVED')
            AND mq.period >= ${startDay}::date AND mq.period < ${endDay}::date
            AND (${month}::date IS NULL OR mq.period = ${month}::date)
          ), best AS (
            SELECT ma."monthlyQuizId", ma."employeeId", qa."scorePercent",
              row_number() OVER (PARTITION BY qa."monthlyAssignmentId"
                ORDER BY qa."scorePercent" DESC, qa."submittedAt" ASC, qa."attemptNumber" ASC) AS rank
            FROM quiz_attempts qa JOIN monthly_quiz_assignments ma ON ma.id = qa."monthlyAssignmentId"
            JOIN eligible e ON e."monthlyQuizId" = ma."monthlyQuizId" AND e."employeeId" = ma."employeeId"
            WHERE qa.status = 'SUBMITTED' AND qa."scorePercent" IS NOT NULL
          ) SELECT e."departmentId" AS id, count(e."employeeId")::int AS eligible,
            count(best."employeeId")::int AS submitted,
            avg(best."scorePercent")::double precision AS "averageScore"
          FROM eligible e LEFT JOIN best ON best."monthlyQuizId" = e."monthlyQuizId"
            AND best."employeeId" = e."employeeId" AND best.rank = 1
          GROUP BY e."departmentId" LIMIT 101`,
        database.department.findMany({
          where: { active: true },
          take: 101,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: { id: true, name: true },
        }),
      ]);
      const training = trainingRows[0],
        course = courseRows[0],
        certificates = certificateRows[0];
      let previousRecordedScore = null;
      const monthly = monthlyRows.map((row) => {
        const averageChangePoints =
          row.averageScore != null && previousRecordedScore != null
            ? two(row.averageScore - previousRecordedScore)
            : null;
        if (row.averageScore != null) previousRecordedScore = row.averageScore;
        return {
          period: row.period,
          assigned: row.eligible,
          submitted: row.submitted,
          participationRatePercent: rate(row.submitted, row.eligible),
          averageScorePercent: two(row.averageScore),
          averageChangePoints,
        };
      });
      const submitted = monthly.reduce((sum, row) => sum + row.submitted, 0);
      const monthlyScoreSum = monthlyRows.reduce(
        (sum, row) => sum + (row.averageScore == null ? 0 : row.averageScore * row.submitted),
        0,
      );
      const populationMap = new Map(population.map((row) => [id(row.id), row.count]));
      const safeDepartments = departmentNames.length <= 100 && population.every((row) => row.count >= 5);
      const eligibleDepartmentOptions =
        departmentNames.length <= 100
          ? departmentNames
              .filter((row) => populationMap.get(row.id) >= 5)
              .map(({ id: departmentId, name }) => ({ id: departmentId, name }))
          : [];
      const trainingDepartmentMap = new Map(trainingDepartments.map((row) => [id(row.id), row]));
      const monthlyDepartmentMap = new Map(monthlyDepartments.map((row) => [id(row.id), row]));
      const departments =
        safeDepartments && !departmentId && trainingDepartments.length <= 100 && monthlyDepartments.length <= 100
          ? departmentNames
              .filter((row) => populationMap.get(row.id) >= 5)
              .map((row) => {
                const tr = trainingDepartmentMap.get(row.id),
                  mo = monthlyDepartmentMap.get(row.id);
                return {
                  id: row.id,
                  name: row.name,
                  activeEmployeesNow: populationMap.get(row.id),
                  trainingAssignments: (tr?.assignments ?? 0) >= 5 ? tr.assignments : null,
                  completedAssignments: (tr?.assignments ?? 0) >= 5 ? tr.completed : null,
                  completionRatePercent: (tr?.assignments ?? 0) >= 5 ? rate(tr.completed, tr.assignments) : null,
                  monthlyAssigned: (mo?.eligible ?? 0) >= 5 ? mo.eligible : null,
                  monthlySubmitted: (mo?.eligible ?? 0) >= 5 ? mo.submitted : null,
                  monthlyParticipationRatePercent: (mo?.eligible ?? 0) >= 5 ? rate(mo.submitted, mo.eligible) : null,
                  monthlyAverageScorePercent: (mo?.submitted ?? 0) >= 5 ? two(mo.averageScore) : null,
                };
              })
          : [];
      return {
        generatedAt: now.toISOString(),
        range: {
          period: filter.period,
          start: startDay,
          end: new Date(endExclusive.getTime() - 86_400_000).toISOString().slice(0, 10),
          timezone: 'UTC',
          days: filter.days,
        },
        filters: {
          programId,
          departmentId,
          completionStatus,
          monthlyPeriod,
          scopes: {
            programId: ['training', 'courseQuizzes', 'certificates'],
            completionStatus: ['training'],
            monthlyPeriod: ['monthlyQuizzes'],
            departmentId: ['all'],
          },
        },
        filterOptions: { departments: eligibleDepartmentOptions, departmentsTruncated: departmentNames.length > 100 },
        training: {
          assignedPrograms: training.programs,
          assignments: training.assignments,
          assignedEmployees: training.employees,
          completed: training.completed,
          inProgress: training.inProgress,
          notStarted: training.notStarted,
          completionRatePercent: rate(training.completed, training.assignments),
          completedDuring: completionRows[0].completed,
          byProgram: programRows.slice(0, 20).map((row) => ({
            id: row.id,
            title: row.title,
            assignments: row.assignments,
            completed: row.completed,
            inProgress: row.inProgress,
            notStarted: row.notStarted,
            completionRatePercent: rate(row.completed, row.assignments),
          })),
          programsTruncated: programRows.length > 20,
        },
        courseQuizzes: {
          submittedAttempts: course.attempts,
          uniqueParticipants: course.participants,
          passedAttempts: course.passed,
          failedAttempts: course.failed,
          passRatePercent: rate(course.passed, course.attempts),
          failRatePercent: rate(course.failed, course.attempts),
          averageScorePercent: two(course.averageScore),
          byProgram: courseProgramRows.slice(0, 20).map((row) => ({
            id: row.id,
            title: row.title,
            submittedAttempts: row.attempts,
            uniqueParticipants: row.participants,
            passedAttempts: row.passed,
            averageScorePercent: two(row.averageScore),
          })),
          programsTruncated: courseProgramRows.length > 20,
        },
        monthlyQuizzes: {
          months: monthly.length,
          assignedAssignments: monthly.reduce((sum, row) => sum + row.assigned, 0),
          submittedAssignments: submitted,
          averageBestScorePercent: submitted ? two(monthlyScoreSum / submitted) : null,
          trend: monthly,
        },
        certificates: {
          totalIssued: certificates.total,
          issuedDuring: certificates.issuedDuring,
          byProgram: certificateProgramRows
            .slice(0, 20)
            .map((row) => ({ id: row.id, title: row.title, totalIssued: row.total, issuedDuring: row.issuedDuring })),
          programsTruncated: certificateProgramRows.length > 20,
        },
        departments: { suppressed: !safeDepartments, minimumGroupSize: 5, rows: departments },
      };
    },
  };
}
