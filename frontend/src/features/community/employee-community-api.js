import { apiRequest } from '../../services/api.js';

const root = '/api/community';
export function createEmployeeCommunityApi(request = apiRequest) {
  return {
    mediaOptions: (signal) => request(`${root}/media-options`, { signal, cache: 'no-store' }),
    feed: (query, signal) => request(`${root}?${new URLSearchParams(query)}`, { signal, cache: 'no-store' }),
    mine: (query, signal) => request(`${root}/mine?${new URLSearchParams(query)}`, { signal, cache: 'no-store' }),
    saved: (query, signal) => request(`${root}/saved?${new URLSearchParams(query)}`, { signal, cache: 'no-store' }),
    engage: (id, kind, active, signal) => request(`${root}/${encodeURIComponent(id)}/${kind}`, {
      method: 'PUT', body: JSON.stringify({ active }), signal, cache: 'no-store',
    }),
    detail: (id, own, signal) => request(`${root}/${own ? 'mine/' : ''}${encodeURIComponent(id)}`, { signal, cache: 'no-store' }),
    acknowledge: (signal) => request('/api/disclaimers/acknowledge', { signal, method: 'POST', body: JSON.stringify({ context: 'COMMUNITY_POST' }), cache: 'no-store' }),
    submit: (post, acknowledgementId, signal) => request(root, { signal, method: 'POST', body: JSON.stringify({
      title: post.title.trim(), body: post.body.trim(), category: post.category, acknowledgementId,
    }), cache: 'no-store' }),
  };
}
