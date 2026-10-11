import { apiRequest } from '../../services/api.js';

export const dashboardApi = {
  overview: (signal) => apiRequest('/api/admin/dashboard', { signal }),
};

export function dashboardError(error) {
  if (error?.status === 401) return 'Your administrator session has expired. Sign in and complete MFA again.';
  if (error?.status === 403) return 'Your current session does not have administrator access with verified MFA.';
  if (error?.status === 429) return 'Too many dashboard requests. Wait a moment before retrying.';
  return 'The dashboard could not be loaded. Check your connection and try again.';
}
