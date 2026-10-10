import { apiRequest } from '../../services/api.js';

export const notificationApi = {
  list: (before, signal) => apiRequest(`/api/notifications?limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`, { signal }),
  unread: (signal) => apiRequest('/api/notifications/unread-count', { signal }),
  read: (id, signal) => apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}', signal }),
  session: (signal) => apiRequest('/api/auth/me', { signal }),
};
