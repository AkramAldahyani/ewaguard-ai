import { apiRequest } from '../../services/api.js';

const conversation = (id) => `/api/chat/conversations/${encodeURIComponent(id)}`;
const approval = (id, request) => `/api/tool-approvals/conversations/${encodeURIComponent(id)}/requests/${encodeURIComponent(request)}`;
const post = (path, body, signal) => apiRequest(path, { method: 'POST', body: JSON.stringify(body), signal });
export const chatApi = {
  privacy: (signal) => apiRequest('/api/chat/privacy', { signal }),
  list: (before, signal) => apiRequest(`/api/chat/conversations${before ? `?before=${encodeURIComponent(before)}` : ''}`, { signal }),
  create: (signal) => post('/api/chat/conversations', {}, signal),
  history: (id, before, signal) => apiRequest(`${conversation(id)}${before !== null && before !== undefined ? `?before=${before}` : ''}`, { signal }),
  send: (id, body, signal) => post(`${conversation(id)}/messages`, body, signal),
  recover: (id, request, signal) => apiRequest(`${conversation(id)}/requests/${encodeURIComponent(request)}`, { signal }),
  approval: (id, request, signal) => apiRequest(approval(id, request), { signal }),
  review: (id, request, signal) => apiRequest(`${approval(id, request)}/review`, { signal }),
  decide: (id, request, decision, signal) => post(`${approval(id, request)}/decision`, { decision }, signal),
  explain: (id, request, privacyNoticeVersion, signal) => post(`${conversation(id)}/approvals/${encodeURIComponent(request)}/explanation`, { privacyNoticeVersion }, signal),
};
