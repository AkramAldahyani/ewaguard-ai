import { useEffect, useState } from 'react';
import { apiRequest } from '../../services/api.js';

export function useUsersResource(path, revision = 0) {
  const key = `${path}:${revision}`;
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    apiRequest(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ key, error });
      });
    return () => controller.abort();
  }, [path, key]);
  return !path ? { loading: false } : result?.key === key ? { ...result, loading: false } : { loading: true };
}

export async function saveAccount(path, body) {
  const result = await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
  // Tokens may live only in the transient authorized issuance panel.
  const issuance = path === '/api/admin/users' || path.endsWith('/setup');
  return {
    user: result.user,
    setupRequired: result.setupRequired || result.user.status === 'INVITED',
    ...(issuance && result.setup ? { setup: result.setup } : {}),
  };
}
