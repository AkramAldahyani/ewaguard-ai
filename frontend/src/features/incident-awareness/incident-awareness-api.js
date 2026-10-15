import { apiRequest } from '../../services/api.js';
import { validateSecurityRange } from '../analytics/security-analytics-api.js';

export { validateSecurityRange };

export function createIncidentAwarenessApi(request = apiRequest) {
  return {
    patterns: (range, signal) => {
      const query = new URLSearchParams({ period: range.period });
      if (range.period === 'custom') { query.set('start', range.start); query.set('end', range.end); }
      return request(`/api/admin/incident-awareness?${query}`, { signal, cache: 'no-store' });
    },
    acknowledge: () => request('/api/disclaimers/acknowledge', {
      method: 'POST', body: JSON.stringify({ context: 'COMMUNITY_POST' }), cache: 'no-store',
    }),
    prepareWarning: (range, warning, acknowledgementId) => request('/api/admin/incident-awareness/warnings', {
      method: 'POST', cache: 'no-store', body: JSON.stringify({
        incidentCategory: warning.incidentCategory,
        period: range.period,
        ...(range.period === 'custom' ? { start: range.start, end: range.end } : {}),
        title: warning.title.trim(), body: warning.body.trim(),
        ...(warning.trainingId ? { trainingId: warning.trainingId } : {}),
        acknowledgementId, reviewed: true,
      }),
    }),
  };
}

export function incidentAwarenessError(error) {
  if (error?.status === 401) return 'Your administrator session has expired. Sign in and complete MFA again.';
  if (error?.code === 'AWARENESS_ACKNOWLEDGEMENT_REQUIRED') return 'The sensitive-information acknowledgement expired. Review the notice and try again.';
  if (error?.status === 403) return 'This session does not have administrator access with verified MFA.';
  if (error?.status === 429) return 'Too many requests. Wait a moment and retry.';
  if (error?.code === 'AWARENESS_PATTERN_CHANGED') return 'The incident pattern changed. Refresh the summary before preparing a warning.';
  if (error?.code === 'AWARENESS_TRAINING_UNAVAILABLE') return 'The linked training program is no longer available. Choose another published program.';
  if (error?.status === 400) return 'The warning was not accepted. Remove sensitive details and check the title and guidance.';
  return 'The awareness request could not be completed. Check your connection and try again.';
}
