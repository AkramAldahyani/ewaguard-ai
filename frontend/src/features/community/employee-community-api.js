import { apiRequest } from '../../services/api.js';

const root = '/api/community';
export function createEmployeeCommunityApi(request = apiRequest) {
  return {
    feed: (query, signal) => request(`${root}?${new URLSearchParams(query)}`, { signal, cache: 'no-store' }),
    mine: (query, signal) => request(`${root}/mine?${new URLSearchParams(query)}`, { signal, cache: 'no-store' }),
    detail: (id, own, signal) => request(`${root}/${own ? 'mine/' : ''}${encodeURIComponent(id)}`, { signal, cache: 'no-store' }),
    acknowledge: () => request('/api/disclaimers/acknowledge', { method: 'POST', body: JSON.stringify({ context: 'COMMUNITY_POST' }), cache: 'no-store' }),
    submit: (post, acknowledgementId) => request(root, { method: 'POST', body: JSON.stringify({
      title: post.title.trim(), body: post.body.trim(), category: post.category, acknowledgementId,
    }), cache: 'no-store' }),
  };
}
