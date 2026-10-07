import { apiRequest } from '../../services/api.js';

export const analyzeUrl = (url, signal) => apiRequest('/api/analysis/url', { method: 'POST', body: JSON.stringify({ url }), signal });
export function urlErrorMessage(error) {
  if (error.status === 401) return 'Your session has expired. Sign in again to continue.';
  if (error.status === 429) return 'Too many submissions. Wait a minute and try again.';
  if (error.status === 413) return 'Enter a URL of at most 4096 characters.';
  return ({
    URL_ACKNOWLEDGEMENT_REQUIRED: 'Please renew your acknowledgement before submitting a URL.',
    URL_TARGET_BLOCKED: 'Private, internal, local, and reserved targets cannot be analyzed.',
    INVALID_URL: 'Enter one valid HTTP or HTTPS URL without embedded credentials.',
    URL_BUSY: 'URL analysis is busy. Please try again shortly.',
  })[error.code] ?? 'URL analysis could not be completed. Please try again.';
}
export function validateUrlInput(value) {
  if (!value.trim() || value.length > 4096) return 'Enter a URL of at most 4096 characters.';
  if (!/^https?:\/\//i.test(value.trim())) return 'Include http:// or https:// in the URL.';
  return '';
}
const empty = { url: '', result: null, error: '', status: 'idle' };
export function createUrlFlow(submit = analyzeUrl) {
  let state = { ...empty, acknowledged: false, noticeKey: 0 };
  let controller;
  let generation = 0;
  const listeners = new Set();
  const set = (update) => { state = { ...state, ...update }; listeners.forEach((fn) => fn()); };
  return {
    getSnapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    acknowledge: () => set({ acknowledged: true, error: '' }),
    edit: (url) => { if (state.status !== 'submitting') set({ url, error: '' }); },
    reset: () => { generation += 1; controller?.abort(); set(empty); },
    dispose: () => { generation += 1; controller?.abort(); state = { ...state, ...empty }; },
    submit: async () => {
      if (state.status === 'submitting' || !state.acknowledged) return;
      const error = validateUrlInput(state.url);
      if (error) { set({ error, status: 'error' }); return; }
      const current = ++generation;
      controller = new AbortController();
      set({ error: '', result: null, status: 'submitting' });
      try {
        const result = await submit(state.url, controller.signal);
        if (generation === current) set({ ...empty, result, status: 'success' });
      } catch (failure) {
        if (generation !== current) return;
        const expired = failure.code === 'URL_ACKNOWLEDGEMENT_REQUIRED';
        set({ url: '', status: 'error', error: urlErrorMessage(failure), ...(expired ? { acknowledged: false, noticeKey: state.noticeKey + 1 } : {}) });
      }
    },
  };
}
