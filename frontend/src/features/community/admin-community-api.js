import { apiRequest } from '../../services/api.js';

const root = '/api/admin/community';
export function createAdminCommunityApi(request = apiRequest) {
  return {
    list: (query, signal) => request(`${root}?${new URLSearchParams(query)}`, { signal, cache: 'no-store' }),
    detail: (id, signal) => request(`${root}/${encodeURIComponent(id)}`, { signal, cache: 'no-store' }),
    decide: (id, action, reason, expectedUpdatedAt, reviewedAttachmentIds) =>
      request(`${root}/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          expectedUpdatedAt,
          ...(reviewedAttachmentIds ? { reviewedAttachmentIds } : {}),
        }),
        cache: 'no-store',
      }),
  };
}
