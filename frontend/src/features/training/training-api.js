import { apiRequest } from '../../services/api.js';

export function createTrainingApi(admin = false, request = apiRequest) {
  const root = admin ? '/api/admin/training' : '/api/training';
  const path = (id) => `${root}/${encodeURIComponent(id)}`;
  const get = (url, query = {}, signal) => request(`${url}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`, { signal, cache: 'no-store' });
  const post = (url, body, signal) => request(url, { method: 'POST', body: JSON.stringify(body), signal, cache: 'no-store' });
  return admin ? {
    programs: (query, signal) => get(root, query, signal),
    detail: (id, signal) => get(path(id), {}, signal),
    create: (body, signal) => post(root, body, signal),
    change: (id, operation, body, signal) => {
      if (!['edit', 'review', 'publish', 'archive'].includes(operation)) throw new Error('Unsupported training action.');
      return post(`${path(id)}/${operation}`, body, signal);
    },
    employees: (query, signal) => get(`${root}/employees`, query, signal),
    assignments: (id, query, signal) => get(`${path(id)}/assignments`, query, signal),
    assign: (id, employeeId, signal) => post(`${path(id)}/assignments`, { employeeId }, signal),
    assignMany: (id, selection, signal) => post(`${path(id)}/assignments/bulk`,
      selection === 'ALL' ? { allEligible: true } : { employeeIds: [...selection] }, signal),
    quiz: (id, signal) => get(`${path(id)}/quiz`, {}, signal),
    saveQuiz: (id, body, edit, signal) => post(`${path(id)}/quiz${edit ? '/edit' : ''}`, body, signal),
    quizAction: (id, action, expectedUpdatedAt, signal) => {
      if (!['approve', 'publish'].includes(action)) throw new Error('Unsupported quiz action.');
      return post(`${path(id)}/quiz/${action}`, { expectedUpdatedAt }, signal);
    },
    quizAttempts: (id, query, signal) => get(`${path(id)}/quiz/attempts`, query, signal),
  } : {
    mine: (query, signal) => get(root, query, signal),
    detail: (id, signal) => get(path(id), {}, signal),
    start: (id, signal) => post(`${path(id)}/start`, {}, signal),
    acknowledge: (id, sectionKey, signal) => post(`${path(id)}/sections`, { sectionKey, acknowledged: true }, signal),
    quiz: (id, signal) => get(`${path(id)}/quiz`, {}, signal),
    startQuiz: (id, signal) => post(`${path(id)}/quiz/attempts`, {}, signal),
    submitQuiz: (id, attemptId, answers, signal) => post(`${path(id)}/quiz/attempts/${encodeURIComponent(attemptId)}/submit`, { answers }, signal),
    quizResult: (id, attemptId, signal) => get(`${path(id)}/quiz/attempts/${encodeURIComponent(attemptId)}`, {}, signal),
  };
}
