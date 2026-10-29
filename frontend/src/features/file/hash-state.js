import { apiRequest } from '../../services/api.js';
import { createSubmissionKey } from '../analysis-submission.js';

export function validateSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
    ? '' : 'Enter exactly 64 hexadecimal characters (0–9 and a–f).';
}
export function lookupFileHash(sha256, signal, key) {
  return apiRequest('/api/analysis/file/hash', { method: 'POST', body: JSON.stringify({ sha256: sha256.trim().toLowerCase() }), signal,
    headers: key ? { 'Idempotency-Key': key } : {} });
}
export function createHashFlow(submit = lookupFileHash) {
  const submission = createSubmissionKey();
  const empty = { hash: '', result: null, error: '', status: 'idle' };
  let state = { ...empty }, controller, generation = 0;
  const listeners = new Set();
  const set = (update) => { state = { ...state, ...update }; listeners.forEach((fn) => fn()); };
  return {
    getSnapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    edit: (hash) => { if (state.status !== 'submitting') set({ ...empty, hash }); },
    reset: () => { submission.clear(); generation++; controller?.abort(); set(empty); },
    dispose: () => { submission.clear(); generation++; controller?.abort(); state = { ...empty }; },
    submit: async () => {
      if (state.status === 'submitting') return;
      const error = validateSha256(state.hash);
      if (error) { set({ error, status: 'error' }); return; }
      const current = ++generation;
      controller = new AbortController();
      set({ error: '', result: null, status: 'submitting' });
      try {
        const hash = state.hash.trim().toLowerCase();
        const key = await submission.forInput(hash);
        if (current !== generation) return;
        const result = await submit(hash, controller.signal, key);
        if (current === generation) { submission.clear(); set({ result, status: 'success' }); }
      } catch (failure) {
        if (current !== generation) return;
        set({ status: 'error', error: failure.status === 401 ? 'Your session has expired. Sign in again.'
          : failure.status === 429 ? 'Too many lookups. Wait a minute and try again.'
            : 'Hash lookup could not be completed. Please try again.' });
      }
    },
  };
}
