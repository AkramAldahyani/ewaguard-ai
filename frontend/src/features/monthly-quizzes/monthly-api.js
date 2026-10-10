import { apiRequest } from '../../services/api.js';

export function createMonthlyApi(admin = false, request = apiRequest) {
  const root = admin ? '/api/admin/monthly-quizzes' : '/api/monthly-quizzes';
  const path = (id) => `${root}/${encodeURIComponent(id)}`;
  const get = (url, query = {}, signal) => request(`${url}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`, { signal, cache: 'no-store' });
  const post = (url, body) => request(url, { method: 'POST', body: JSON.stringify(body), cache: 'no-store' });
  return admin ? {
    list: (query, signal) => get(root, query, signal),
    detail: (id, signal) => get(path(id), {}, signal),
    create: (body) => post(root, body),
    edit: (id, body) => post(`${path(id)}/edit`, body),
    action: (id, operation, expectedUpdatedAt) => {
      if (!['approve', 'publish', 'archive'].includes(operation)) throw new Error('Unsupported monthly quiz action.');
      return post(`${path(id)}/${operation}`, { expectedUpdatedAt });
    },
    report: (id, query, signal) => get(`${path(id)}/report`, query, signal),
  } : {
    list: (query, signal) => get(root, query, signal),
    history: (query, signal) => get(`${root}/history`, query, signal),
    detail: (id, signal) => get(path(id), {}, signal),
    start: (id) => post(`${path(id)}/attempts`, {}),
    submit: (id, attemptId, answers) => post(`${path(id)}/attempts/${encodeURIComponent(attemptId)}/submit`, { answers }),
    result: (id, attemptId, signal) => get(`${path(id)}/attempts/${encodeURIComponent(attemptId)}`, {}, signal),
  };
}
