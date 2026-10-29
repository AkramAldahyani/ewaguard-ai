// Aggregate only operational columns. Never select submitted content or evidence.
const levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const types = ['EMAIL', 'URL', 'FILE', 'FILE_HASH'];
export async function analysisOverview(database, range) {
  return database.$transaction((tx) => aggregateAnalyses(tx, range), { isolationLevel: 'RepeatableRead' });
}

async function aggregateAnalyses(database, range) {
  const rows = await database.$queryRaw`
    WITH analyses AS (
      SELECT 'EMAIL' AS type, status, severity, COALESCE("analyzedAt", "createdAt") AS recorded,
        "analyzedAt" IS NOT NULL AS finalized FROM email_analyses
      UNION ALL SELECT 'URL', status, severity, COALESCE("analyzedAt", "createdAt"), "analyzedAt" IS NOT NULL FROM url_analyses
      UNION ALL SELECT CASE WHEN kind = 'HASH_LOOKUP' THEN 'FILE_HASH' ELSE 'FILE' END,
        status, severity, COALESCE("analyzedAt", "createdAt"), "analyzedAt" IS NOT NULL FROM file_analyses
    )
    SELECT type, status::text, severity::text, finalized, to_char(recorded AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      count(*)::int AS count FROM analyses
    WHERE recorded >= ${range.start} AND recorded < ${range.endExclusive}
    GROUP BY type, status, severity, finalized, day`;
  const isClassified = (r) => r.status === 'COMPLETED' && r.finalized && levels.includes(r.severity);
  const classified = rows.filter(isClassified);
  const sum = (items) => items.reduce((n, r) => n + r.count, 0);
  const severity = levels.map((value) => ({ value, count: sum(classified.filter((r) => r.severity === value)) }));
  const byType = types.map((value) => ({ value, count: sum(classified.filter((r) => r.type === value)) }));
  const daily = Array.from({ length: range.days }, (_, index) => {
    const day = new Date(range.start.getTime() + index * 86400000).toISOString().slice(0, 10);
    return { day, count: sum(classified.filter((r) => r.day === day)) };
  });
  const recent = await database.$queryRaw`
    WITH analyses AS (
      SELECT id, 'EMAIL' AS type, status, severity, "riskScore", "analyzedAt", "userId" FROM email_analyses
      UNION ALL SELECT id, 'URL', status, severity, "riskScore", "analyzedAt", "userId" FROM url_analyses
      UNION ALL SELECT id, CASE WHEN kind = 'HASH_LOOKUP' THEN 'FILE_HASH' ELSE 'FILE' END,
        status, severity, "riskScore", "analyzedAt", "userId" FROM file_analyses
    )
    SELECT a.id, a.type, a.status::text, a.severity::text, a."riskScore", a."analyzedAt", a."userId",
      CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object(
        'id', u.id, 'employeeIdentifier', u."employeeIdentifier",
        'firstName', u."firstName", 'lastName', u."lastName") END AS "submittedBy",
      i.id AS "incidentId", i.number AS "incidentNumber", i."createdAt" AS "incidentCreatedAt"
    FROM analyses a LEFT JOIN incidents i ON i."sourceKey" = (CASE WHEN a.type = 'FILE_HASH' THEN 'FILE' ELSE a.type END) || ':' || a.id::text
    LEFT JOIN users u ON u.id = a."userId"
    WHERE a."analyzedAt" >= ${range.start} AND a."analyzedAt" < ${range.endExclusive}
      AND a.status = 'COMPLETED' AND a.severity IS NOT NULL
    ORDER BY a."analyzedAt" DESC, a.type, a.id DESC LIMIT 20`;
  return { total: sum(classified), severity, byType, daily,
    unclassified: sum(rows.filter((r) => r.status === 'COMPLETED' && !isClassified(r))),
    failed: sum(rows.filter((r) => r.status === 'ERROR')),
    recent: recent.map(({ incidentNumber, incidentCreatedAt, ...row }) => ({ ...row,
      incidentReference: incidentNumber == null ? null : `INC-${incidentCreatedAt.getUTCFullYear()}-${String(incidentNumber).padStart(6, '0')}` })),
  };
}
