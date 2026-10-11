import { apiRequest } from '../../services/api.js';

export function createCertificateApi(admin = false, request = apiRequest) {
  const root = admin ? '/api/admin/certificates' : '/api/certificates';
  const path = (id) => `${root}/${encodeURIComponent(id)}`;
  return {
    list: (query = {}, signal) => request(`${root}?${new URLSearchParams(query)}`, { signal, cache: 'no-store' }),
    detail: (id, signal) => request(path(id), { signal, cache: 'no-store' }),
    download: (id, signal) => request(`${path(id)}/pdf`, { signal, cache: 'no-store', responseType: 'blob' }),
    ...(admin ? { verify: (number, signal) => request(`${root}/verify/${encodeURIComponent(number)}`, { signal, cache: 'no-store' }) } : {}),
  };
}
