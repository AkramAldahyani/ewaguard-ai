import { apiRequest } from '../../services/api.js';

export const analyzePastedEmail = ({ body, headers }, signal, key) =>
  apiRequest('/api/analysis/email/text', {
    method: 'POST',
    body: JSON.stringify({ body, headers }),
    signal,
    headers: key ? { 'Idempotency-Key': key } : {},
  });

export function analyzeEml(file, signal, key) {
  const body = new FormData();
  body.append('file', file);
  return apiRequest('/api/analysis/email/eml', {
    method: 'POST',
    body,
    signal,
    headers: key ? { 'Idempotency-Key': key } : {},
  });
}
