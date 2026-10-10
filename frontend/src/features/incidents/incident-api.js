import { apiRequest } from '../../services/api.js';

export function createIncidentApi(admin = false, request = apiRequest) {
  const root = admin ? '/api/admin/incidents' : '/api/incidents';
  const get = (path, query, signal) => request(`${root}${path}${query ? `?${new URLSearchParams(query)}` : ''}`, { signal, cache: 'no-store' });
  const idPath = (id) => `/${encodeURIComponent(id)}`;
  return {
    list: (query, signal) => get('', query, signal),
    detail: (id, signal) => get(idPath(id), null, signal),
    history: (id, page, signal) => get(`${idPath(id)}/history`, { page, pageSize: 20 }, signal),
    notes: (id, page, signal) => get(`${idPath(id)}/notes`, { page, pageSize: 20 }, signal),
    assignees: (page, signal) => get('/assignees', { page, pageSize: 100 }, signal),
    mutate: (id, operation, body, signal) => {
      if (!admin || !['assignment', 'status', 'notes'].includes(operation)) throw new Error('Operation unavailable.');
      return request(`${root}${idPath(id)}/${operation}`, { method: 'POST', body: JSON.stringify(body), signal, cache: 'no-store' });
    },
  };
}
