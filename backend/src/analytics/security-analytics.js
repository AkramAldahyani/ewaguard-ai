import { STATUSES } from '../incidents/management-policy.js';
import { analysisOverview, recentAnalyses } from './analysis-analytics.js';

const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const types = ['PHISHING', 'MALWARE', 'CREDENTIAL_COMPROMISE', 'DATA_EXPOSURE', 'SUSPICIOUS_ACTIVITY', 'OTHER'];
const sources = ['EMAIL_ANALYSIS', 'URL_ANALYSIS', 'FILE_ANALYSIS', 'INCIDENT_ASSISTANCE', 'MANUAL_REPORT'];
const openStatuses = ['NEW', 'UNDER_INVESTIGATION', 'CONTAINED'];
const dayMs = 86_400_000;

export class SecurityAnalyticsError extends Error {
  constructor() { super('Choose a valid UTC period of 1–90 days.'); this.status = 400; this.code = 'SECURITY_ANALYTICS_PERIOD'; }
}

function utcDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new SecurityAnalyticsError();
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new SecurityAnalyticsError();
  return date;
}

export function securityPeriod(query, now = new Date()) {
  if (!query || typeof query !== 'object' || Array.isArray(query) ||
      Object.keys(query).some((key) => !['period', 'start', 'end'].includes(key))) throw new SecurityAnalyticsError();
  const period = query.period ?? '30d';
  if (!['7d', '30d', '90d', 'custom'].includes(period)) throw new SecurityAnalyticsError();
  let start; let endExclusive;
  if (period === 'custom') {
    start = utcDay(query.start); endExclusive = new Date(utcDay(query.end).getTime() + dayMs);
  } else {
    if (query.start !== undefined || query.end !== undefined) throw new SecurityAnalyticsError();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    endExclusive = new Date(today.getTime() + dayMs);
    start = new Date(endExclusive.getTime() - Number.parseInt(period, 10) * dayMs);
  }
  const days = (endExclusive.getTime() - start.getTime()) / dayMs;
  if (!Number.isSafeInteger(days) || days < 1 || days > 90) throw new SecurityAnalyticsError();
  return { period, start, endExclusive, days };
}

const bucket = (rows, field, values) => {
  const found = new Map(rows.map((row) => [row[field], row._count._all]));
  return values.map((value) => ({ value, count: found.get(value) ?? 0 }));
};
const countOf = (rows, value) => rows.find((row) => row.value === value)?.count ?? 0;
const reference = (row) => `INC-${row.createdAt.getUTCFullYear()}-${String(row.number).padStart(6, '0')}`;

export function createSecurityAnalytics(database) {
  return {
    async overview(query, now = new Date()) {
      const range = securityPeriod(query, now);
      const where = { createdAt: { gte: range.start, lt: range.endExclusive } };
      const [severityRows, statusRows, typeRows, sourceRows, assigned, trendRows, resolutionRows, recent] = await Promise.all([
        database.incident.groupBy({ by: ['severity'], where, _count: { _all: true } }),
        database.incident.groupBy({ by: ['status'], where, _count: { _all: true } }),
        database.incident.groupBy({ by: ['type'], where, _count: { _all: true } }),
        database.incident.groupBy({ by: ['detectionSource'], where, _count: { _all: true } }),
        database.incident.count({ where: { ...where, assigneeId: { not: null } } }),
        database.$queryRaw`SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
          count(*)::int AS count FROM incidents WHERE "createdAt" >= ${range.start} AND "createdAt" < ${range.endExclusive}
          GROUP BY 1 ORDER BY 1`,
        // Resolution time uses the recorded resolvedAt. It counts incidents resolved now and incidents closed after
        // being resolved (closing keeps resolvedAt). False positives, and closures that followed a false-positive
        // decision, are not resolutions. Reopening clears resolvedAt, so reopened incidents drop out until resolved again.
        database.$queryRaw`SELECT count(*)::int AS count,
          avg(EXTRACT(EPOCH FROM (i."resolvedAt" - i."createdAt")))::double precision AS "averageSeconds"
          FROM incidents i WHERE i."createdAt" >= ${range.start} AND i."createdAt" < ${range.endExclusive}
          AND i."resolvedAt" IS NOT NULL AND i."resolvedAt" >= i."createdAt"
          AND (i.status = 'RESOLVED' OR (i.status = 'CLOSED' AND (SELECT e.details->>'fromStatus' FROM incident_events e
            WHERE e."incidentId" = i.id AND e.type = 'STATUS_CHANGED' AND e.details->>'toStatus' = 'CLOSED'
            ORDER BY e."createdAt" DESC, e.id DESC LIMIT 1) = 'RESOLVED'))`,
        database.incident.findMany({ where, take: 8, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, number: true, severity: true, status: true, type: true,
            detectionSource: true, createdAt: true, assigneeId: true } }),
      ]);
      const severity = bucket(severityRows, 'severity', severities);
      const status = bucket(statusRows, 'status', STATUSES);
      const categories = bucket(typeRows, 'type', types);
      const detectionSources = bucket(sourceRows, 'detectionSource', sources);
      const total = severity.reduce((sum, row) => sum + row.count, 0);
      const openCurrent = openStatuses.reduce((sum, value) => sum + countOf(status, value), 0);
      const trend = new Map(trendRows.map((row) => [row.day, row.count]));
      const daily = Array.from({ length: range.days }, (_, index) => {
        const day = new Date(range.start.getTime() + index * dayMs).toISOString().slice(0, 10);
        return { day, count: trend.get(day) ?? 0 };
      });
      const validResolutionCount = resolutionRows[0]?.count ?? 0;
      return {
        analyses: await analysisOverview(database, range),
        generatedAt: now.toISOString(),
        range: { period: range.period, start: range.start.toISOString().slice(0, 10),
          end: new Date(range.endExclusive.getTime() - dayMs).toISOString().slice(0, 10),
          timezone: 'UTC', days: range.days },
        metrics: { created: total, high: countOf(severity, 'HIGH'), critical: countOf(severity, 'CRITICAL'),
          openCurrent, resolvedCurrent: countOf(status, 'RESOLVED'),
          closedCurrent: countOf(status, 'CLOSED'), falsePositiveCurrent: countOf(status, 'FALSE_POSITIVE'),
          assignedCurrent: assigned, unassignedCurrent: total - assigned,
          resolution: { eligibleCount: validResolutionCount,
            averageSeconds: validResolutionCount ? resolutionRows[0].averageSeconds : null } },
        distributions: { severity, currentStatus: status, category: categories, detectionSource: detectionSources },
        dailyCreated: daily,
        recentCreated: recent.map((row) => ({ id: row.id, reference: reference(row), severity: row.severity,
          status: row.status, category: row.type, detectionSource: row.detectionSource,
          createdAt: row.createdAt, assigned: Boolean(row.assigneeId) })),
      };
    },
    // Recent analyses page for the same reporting window; `page` is validated separately from the period keys.
    async recentAnalyses(query, now = new Date()) {
      if (!query || typeof query !== 'object' || Array.isArray(query)) throw new SecurityAnalyticsError();
      const { page = '1', ...period } = query;
      if (typeof page !== 'string' || !/^[1-9]\d{0,4}$/.test(page)) throw new SecurityAnalyticsError();
      const result = await recentAnalyses(database, securityPeriod(period, now), Number(page));
      return { items: result.items, ...result.pagination };
    },
  };
}
