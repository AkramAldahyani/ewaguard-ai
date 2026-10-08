import { apiRequest } from '../../services/api.js';
import { FILE_EXTENSIONS, FILE_MAX_BYTES } from '../../../../shared/file-policy.js';

export function analyzeFile(file, signal) {
  const body = new FormData(); body.append('file', file);
  return apiRequest('/api/analysis/file', { method: 'POST', body, signal });
}
export function validateFile(file) {
  if (!file) return 'Choose one file to analyze.';
  if (!file.size) return 'The selected file is empty.';
  if (file.size > FILE_MAX_BYTES) return 'Choose a file no larger than 10 MiB.';
  if (!FILE_EXTENSIONS.includes(file.name.split('.').at(-1).toLowerCase())) return 'Choose a supported file type from the guidance below.';
  return '';
}
export function fileErrorMessage(error) {
  if (error.status === 401) return 'Your session has expired. Sign in again to continue.';
  if (error.status === 429) return 'Too many file submissions. Wait a minute and try again.';
  if (error.status === 413) return 'The file exceeds the 10 MiB upload limit.';
  return ({
    FILE_ACKNOWLEDGEMENT_REQUIRED: 'Please renew your acknowledgement before submitting a file.',
    INVALID_FILE_UPLOAD: 'Choose exactly one supported file and try again.',
    UNSUPPORTED_FILE: 'The file extension or detected content format is not supported.',
    EMPTY_FILE: 'The selected file is empty.',
    FILE_BUSY: 'File analysis is busy. Please try again shortly.',
    FILE_UPLOAD_TIMEOUT: 'The upload took too long. Try again with a stable connection.',
    FILE_CLEANUP_FAILED: 'Temporary file cleanup could not be confirmed. Contact IT/security before retrying.',
  })[error.code] ?? 'File analysis could not be completed. Please try again.';
}
const empty = { file: null, result: null, status: 'idle', error: '' };
export function createFileFlow(submit = analyzeFile) {
  let state = { ...empty, acknowledged: false, noticeKey: 0 };
  let controller; let generation = 0;
  const listeners = new Set();
  const set = (update) => { state = { ...state, ...update }; listeners.forEach((fn) => fn()); };
  return {
    getSnapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    acknowledge: () => set({ acknowledged: true, error: '' }),
    selectFiles: (files) => {
      if (state.status === 'submitting') return;
      const file = files.length === 1 ? files[0] : null;
      const error = files.length > 1 ? 'Choose exactly one file.' : file ? validateFile(file) : '';
      set({ ...empty, file: error ? null : file, error, status: error ? 'error' : 'idle' });
    },
    reset: () => { generation++; controller?.abort(); set(empty); },
    dispose: () => { generation++; controller?.abort(); state = { ...state, ...empty }; },
    submit: async () => {
      if (!state.acknowledged || state.status === 'submitting') return;
      const error = validateFile(state.file);
      if (error) { set({ error, status: 'error' }); return; }
      const current = ++generation;
      controller = new AbortController();
      set({ status: 'submitting', error: '', result: null });
      try {
        const result = await submit(state.file, controller.signal);
        if (current === generation) set({ ...empty, result, status: 'success' });
      } catch (failure) {
        if (current !== generation) return;
        const expired = failure.code === 'FILE_ACKNOWLEDGEMENT_REQUIRED';
        set({ ...empty, status: 'error', error: fileErrorMessage(failure), ...(expired ? { acknowledged: false, noticeKey: state.noticeKey + 1 } : {}) });
      }
    },
  };
}
