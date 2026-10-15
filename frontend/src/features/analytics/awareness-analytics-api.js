import { apiRequest } from '../../services/api.js';

const dayMs = 86_400_000;
const utcDay = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
};

export function validateAwarenessFilters(filters, now = new Date()) {
  if (!['30d', '90d', '365d', 'custom'].includes(filters.period)) return 'Choose a valid reporting period.';
  let from; let through;
  if (filters.period === 'custom') {
    from = utcDay(filters.start); through = utcDay(filters.end);
    if (!from || !through) return 'Enter valid start and end dates in UTC.';
    const days = (through - from) / dayMs + 1;
    if (days < 1) return 'End date must be on or after start date.';
    if (days > 366) return 'Choose a range of no more than 366 UTC days.';
  } else {
    through = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    from = new Date(through.getTime() - (Number.parseInt(filters.period, 10) - 1) * dayMs);
  }
  if (filters.monthlyPeriod) {
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(filters.monthlyPeriod) ? utcDay(`${filters.monthlyPeriod}-01`) : null;
    if (!month || month < from || month > through) return 'The monthly quiz period must begin within the selected UTC range.';
  }
  return '';
}

export const awarenessAnalyticsApi = {
  overview(filters, signal) {
    const query = new URLSearchParams({ period: filters.period });
    if (filters.period === 'custom') { query.set('start', filters.start); query.set('end', filters.end); }
    for (const key of ['programId', 'departmentId', 'completionStatus', 'monthlyPeriod']) {
      if (filters[key]) query.set(key, filters[key]);
    }
    return apiRequest(`/api/admin/analytics/awareness?${query}`, { signal, cache: 'no-store' });
  },
  programs(search, signal) {
    const query = new URLSearchParams({ sort: 'title_asc', pageSize: '50' });
    if (search.trim()) query.set('search', search.trim());
    return apiRequest(`/api/admin/training?${query}`, { signal, cache: 'no-store' });
  },
};

export function awarenessAnalyticsError(error) {
  if (error?.status === 401) return 'Your administrator session has expired. Sign in and complete MFA again.';
  if (error?.status === 403) return 'This session does not have administrator access with verified MFA.';
  if (error?.status === 429) return 'Too many analytics requests. Wait a moment and retry.';
  if (error?.status === 400) return 'The selected filters were not accepted. Check the UTC dates and department eligibility.';
  return 'Awareness analytics could not be loaded. Check your connection and try again.';
}
