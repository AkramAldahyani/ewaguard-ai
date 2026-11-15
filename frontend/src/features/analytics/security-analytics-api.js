import { apiRequest } from '../../services/api.js';

const dayMs = 86_400_000;

function utcDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function validateSecurityRange(period, start, end) {
  if (['7d', '30d', '90d'].includes(period)) return '';
  if (period !== 'custom') return 'Choose a valid reporting period.';
  const from = utcDay(start),
    through = utcDay(end);
  if (!from || !through) return 'Enter valid start and end dates in UTC.';
  const days = (through.getTime() - from.getTime()) / dayMs + 1;
  if (days < 1) return 'End date must be on or after start date.';
  if (days > 90) return 'Choose a range of no more than 90 UTC days.';
  return '';
}

export const securityAnalyticsApi = {
  overview: ({ period, start, end }, signal) => {
    const query = new URLSearchParams({ period });
    if (period === 'custom') {
      query.set('start', start);
      query.set('end', end);
    }
    return apiRequest(`/api/admin/analytics/security?${query}`, { signal });
  },
  analyses: ({ period, start, end }, page, signal) => {
    const query = new URLSearchParams({ period });
    if (period === 'custom') {
      query.set('start', start);
      query.set('end', end);
    }
    query.set('page', String(page));
    return apiRequest(`/api/admin/analytics/security/analyses?${query}`, { signal, cache: 'no-store' });
  },
};

export function securityAnalyticsError(error) {
  if (error?.status === 401) return 'Your administrator session has expired. Sign in and complete MFA again.';
  if (error?.status === 403) return 'Your current session does not have administrator access with verified MFA.';
  if (error?.status === 429) return 'Too many analytics requests. Wait a moment and retry.';
  if (error?.status === 400) return 'The selected UTC period was not accepted. Check the dates and try again.';
  return 'Security analytics could not be loaded. Check your connection and try again.';
}
