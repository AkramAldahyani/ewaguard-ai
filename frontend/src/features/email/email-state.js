import { analyzePastedEmail, analyzeEml } from './email-api.js';
import { createSubmissionKey } from '../analysis-submission.js';

// UX mirrors the API byte limits; the server remains authoritative.
export const EMAIL_INPUT_LIMITS = { body: 24 * 1024, headers: 8 * 1024, file: 1024 * 1024 };
export const byteLength = (value) => new TextEncoder().encode(value).length;
export const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

export function validateEmailInput({ mode, body, headers, file }) {
  if (mode === 'paste') {
    if (!body.trim()) return 'Enter the email body before analyzing.';
    if (byteLength(body) > EMAIL_INPUT_LIMITS.body)
      return 'The email body exceeds 24 KiB. Shorten it before analyzing.';
    if (byteLength(headers) > EMAIL_INPUT_LIMITS.headers)
      return 'The headers exceed 8 KiB. Shorten them before analyzing.';
  } else {
    if (!file) return 'Choose one .eml file before analyzing.';
    if (!/\.eml$/i.test(file.name)) return 'Choose an email file with the .eml extension.';
    if (file.size > EMAIL_INPUT_LIMITS.file) return 'The .eml file exceeds 1 MiB. Choose a smaller file.';
    if (!file.size) return 'The selected file is empty. Choose an email containing a message.';
  }
  return '';
}

export function emailErrorMessage(error) {
  if (error.status === 401) return 'Your session has expired. Sign in again to continue.';
  if (error.code === 'EMAIL_ACKNOWLEDGEMENT_REQUIRED')
    return 'Your confirmation needs to be renewed. Please acknowledge the notice again, then submit your email.';
  if (error.status === 429) return 'You have submitted several emails recently. Wait a minute and try again.';
  if (error.status === 413)
    return 'This email exceeds the supported limits: 24 KiB body, 8 KiB headers, or 1 MiB for an .eml file.';
  const messages = {
    INVALID_EMAIL_UPLOAD: 'Choose one valid .eml file, no larger than 1 MiB.',
    MALFORMED_EMAIL: 'This email could not be read. Check the headers or export the message as .eml again.',
    EMAIL_PARSE_FAILED: 'The email could not be parsed. Try pasting a plain-text copy instead.',
    EMPTY_EMAIL: 'The email is empty. Add message text or choose a different .eml file.',
    INVALID_EMAIL_INPUT: 'Check the message and optional headers, then try again.',
    EMAIL_BUSY: 'Email analysis is busy. Please try again shortly.',
  };
  return (
    messages[error.code] ??
    (error.status === 403
      ? 'This action is not available for your current session.'
      : 'Email analysis could not be completed. Please try again.')
  );
}

const emptyContent = { body: '', headers: '', file: null, result: null, error: '' };

// One ephemeral store per mounted page. A synchronous status guard prevents double
// submits; generation checks prevent late responses restoring cleared content.
export function createEmailFlow(api = { analyzePastedEmail, analyzeEml }) {
  const submission = createSubmissionKey();
  let state = { ...emptyContent, mode: 'paste', status: 'idle', acknowledged: false, noticeKey: 0 };
  let generation = 0;
  let controller;
  const listeners = new Set();
  const set = (update) => {
    state = { ...state, ...update };
    listeners.forEach((listener) => listener());
  };
  const busy = () => ['validating', 'submitting'].includes(state.status);
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    acknowledge: () => set({ acknowledged: true, error: '', status: 'idle' }),
    edit: (key, value) => {
      if (!busy() && ['body', 'headers'].includes(key)) set({ [key]: value, error: '', status: 'idle' });
    },
    changeMode: (mode) => {
      if (!busy() && ['paste', 'eml'].includes(mode)) set({ ...emptyContent, mode, status: 'idle' });
    },
    selectFiles: (files) => {
      if (busy()) return;
      const file = files.length === 1 ? files[0] : null;
      const error =
        files.length > 1 ? 'Choose exactly one .eml file.' : file ? validateEmailInput({ mode: 'eml', file }) : '';
      set({ file: error ? null : file, error, status: error ? 'error' : 'idle' });
    },
    reset: () => {
      submission.clear();
      generation += 1;
      controller?.abort();
      set({ ...emptyContent, status: 'idle' });
    },
    dispose: () => {
      submission.clear();
      generation += 1;
      controller?.abort();
      state = { ...state, ...emptyContent };
    },
    submit: async () => {
      if (busy() || !state.acknowledged) return;
      set({ status: 'validating', error: '', result: null });
      const error = validateEmailInput(state);
      if (error) {
        set({ status: 'error', error });
        return;
      }
      const current = ++generation;
      controller = new AbortController();
      set({ status: 'submitting' });
      try {
        const mode = state.mode;
        const input = mode === 'paste' ? { body: state.body, headers: state.headers } : state.file;
        const key = await submission.forInput(mode === 'paste' ? JSON.stringify(input) : input);
        if (current !== generation) return;
        const result = await (mode === 'paste'
          ? api.analyzePastedEmail(input, controller.signal, key)
          : api.analyzeEml(input, controller.signal, key));
        if (current === generation) {
          submission.clear();
          set({ ...emptyContent, result, status: 'success' });
        }
      } catch (requestError) {
        if (current !== generation) return;
        const expired = requestError.code === 'EMAIL_ACKNOWLEDGEMENT_REQUIRED';
        set({
          ...(expired ? { ...emptyContent, acknowledged: false, noticeKey: state.noticeKey + 1 } : {}),
          status: 'error',
          error: emailErrorMessage(requestError),
        });
      }
    },
  };
}
