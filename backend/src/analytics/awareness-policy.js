const dayMs = 86_400_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AwarenessAnalyticsError extends Error {
  constructor(message = 'Choose valid awareness analytics filters.') {
    super(message);
    this.status = 400;
    this.code = 'AWARENESS_ANALYTICS_FILTER';
  }
}

function utcDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AwarenessAnalyticsError();
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new AwarenessAnalyticsError();
  return date;
}

export function awarenessFilters(query, now = new Date()) {
  if (
    !query ||
    typeof query !== 'object' ||
    Array.isArray(query) ||
    Object.keys(query).some(
      (key) =>
        !['period', 'start', 'end', 'programId', 'departmentId', 'completionStatus', 'monthlyPeriod'].includes(key),
    )
  )
    throw new AwarenessAnalyticsError();
  const period = query.period ?? '90d';
  if (!['30d', '90d', '365d', 'custom'].includes(period)) throw new AwarenessAnalyticsError();
  let start;
  let endExclusive;
  if (period === 'custom') {
    start = utcDay(query.start);
    endExclusive = new Date(utcDay(query.end).getTime() + dayMs);
  } else {
    if (query.start !== undefined || query.end !== undefined) throw new AwarenessAnalyticsError();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    endExclusive = new Date(today.getTime() + dayMs);
    start = new Date(endExclusive.getTime() - Number.parseInt(period, 10) * dayMs);
  }
  const days = (endExclusive.getTime() - start.getTime()) / dayMs;
  if (!Number.isSafeInteger(days) || days < 1 || days > 366) throw new AwarenessAnalyticsError();
  for (const key of ['programId', 'departmentId'])
    if (query[key] !== undefined && !uuid.test(query[key])) throw new AwarenessAnalyticsError();
  if (
    query.completionStatus !== undefined &&
    !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(query.completionStatus)
  )
    throw new AwarenessAnalyticsError();
  if (query.monthlyPeriod !== undefined) {
    const month = query.monthlyPeriod;
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !utcDay(`${month}-01`))
      throw new AwarenessAnalyticsError();
    const monthDate = new Date(`${month}-01T00:00:00.000Z`);
    if (monthDate < start || monthDate >= endExclusive)
      throw new AwarenessAnalyticsError('The monthly quiz period must fall within the selected UTC range.');
  }
  return {
    period,
    start,
    endExclusive,
    days,
    programId: query.programId ?? null,
    departmentId: query.departmentId ?? null,
    completionStatus: query.completionStatus ?? null,
    monthlyPeriod: query.monthlyPeriod ?? null,
  };
}
