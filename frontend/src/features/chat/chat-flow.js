import { chatApi } from './chat-api.js';
import { hasSessionConsent, rememberSessionConsent } from '../disclaimer/session-consent.js';

export const CHAT_MAX_LENGTH = 2000;
export const CHAT_SUGGESTIONS = ['I received a suspicious email. What should I do?', 'How does MFA protect my account?', 'What are the warning signs of phishing?', 'How should I report a security concern?'];
export function chatError(error) {
  if (error.status === 401) return 'Your session has expired. Sign in again to continue.';
  if (error.status === 410) return 'This approval has expired. Retrieve its saved status; no new analysis can start.';
  const messages = {
    UNTRUSTED_ORIGIN: 'The request was blocked by the site’s origin check. Open EWAGuard AI from its configured address and reload chat.',
    AI_BUDGET_EXHAUSTED: 'AI assistance has reached its application spending limit. Saved analysis results remain available.',
    CHAT_DAILY_LIMIT: 'You have reached your daily AI request limit. Return tomorrow; saved results remain available.',
    AI_RATE_LIMITED: 'The AI provider is busy. Check this request’s status before starting another message.',
    CHAT_RATE_LIMITED: 'Too many requests. Wait a minute before checking again.',
    AI_MODEL_UNAVAILABLE: 'The configured AI model is unavailable. Contact IT if this continues.',
    AI_PROVIDER_UNAVAILABLE: 'The AI service is temporarily unavailable. Retrieve saved findings before starting another request.',
    AI_NOT_CONFIGURED: 'AI assistance is not configured. Contact IT; existing security analyzers remain available.',
    AI_PRICING_UNAVAILABLE: 'AI assistance is temporarily paused pending an administrator review.',
    AI_CREDITS_UNAVAILABLE: 'AI assistance is temporarily unavailable. Saved analysis results remain available.',
    AI_USAGE_REVIEW_REQUIRED: 'AI assistance is paused for a usage review. Retrieve any completed analysis below.',
    AI_TIMEOUT: 'The response timed out. Check request status; sending it again could use additional credit.',
    AI_TOOL_ROUND_LIMIT: 'The assistant reached its tool-round limit. Retrieve available findings below.',
    AI_TOOL_INVOCATION_LIMIT: 'The assistant requested too many tools. Retrieve any available findings below.',
    AI_INVALID_RESPONSE: 'The response could not be displayed safely. Verified findings may still be available.',
    CHAT_REQUEST_ALREADY_USED: 'This request was already attempted. Check its saved status instead of sending it again.',
    CHAT_REQUEST_NOT_FOUND: 'No saved request was found. Refresh history before deliberately submitting a new message.',
    CHAT_NOT_FOUND: 'This conversation is unavailable or its retention period has expired. Choose another or start a new one.',
    CHAT_BUSY: 'A response is already pending in this conversation. Refresh its status shortly.',
    AI_BUSY: 'AI assistance is busy. Please wait before submitting a new message.',
    CHAT_SENSITIVE_INPUT: 'Use Private analysis for email content and URLs. Remove passwords, MFA codes and sensitive information from chat.',
    CHAT_SENSITIVE_HISTORY: 'This conversation cannot be sent to AI. Start a new conversation without sensitive content.',
    TOOL_ACKNOWLEDGEMENT_REQUIRED: 'Your analysis acknowledgement needs renewal. Close this request and start a new private submission.',
    TOOL_SENSITIVE_INPUT: 'Remove credentials, secrets and URL query strings before private submission.',
    TOOL_INVALID_INPUT: 'The private analysis input is not permitted. Check the email headers or public URL.',
    TOOL_APPROVAL_EXPIRED: 'This approval has expired. No new analysis was started.',
    TOOL_APPROVAL_CONSUMED: 'This approval has already been processed. Retrieve its saved result; do not rescan.',
    TOOL_RESULT_UNAVAILABLE: 'The saved result is unavailable or has expired. No new scan was performed.',
    TOOL_NOT_FOUND: 'The requested analysis or approval is unavailable for your account.',
    TOOL_PRIVATE_INPUT_REQUIRED: 'Use Private analysis to supply the input separately from chat.',
    TOOL_ANALYSIS_FAILED: 'Analysis could not complete. This approval cannot be retried; check its saved status.',
    TOOL_APPROVALS_NOT_CONFIGURED: 'Private approvals are unavailable. Use the existing analyzer page or contact IT.',
  };
  return messages[error.code] ?? (error.status === 403 ? 'This operation is not available for your account.' : 'The request could not complete. Check saved status before starting another operation.');
}
export const chatBusy = (state) => !['idle', 'error'].includes(state.status);
const empty = () => ({ conversations: [], nextConversation: null, listLoading: false, listError: '', privacy: null, acknowledgedVersion: null,
  active: null, messages: [], requests: [], nextMessage: null, draft: '', status: 'idle', error: '', review: null, pendingMessage: null });
const merge = (items, additions, key) => [...new Map([...items, ...additions].map((item) => [item[key], item])).values()];

// Memory is presentation state only. PostgreSQL history and receipts are the source
// of truth. Epochs also protect logout/unmount and transports that ignore abort.
export function createChatFlow(api = chatApi, uuid = () => crypto.randomUUID()) {
  let state = empty(); let epoch = 0; let listEpoch = 0; let controller;
  const listeners = new Set();
  const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()); };
  const begin = (status) => { controller?.abort(); controller = new AbortController(); const token = ++epoch; set({ status, error: '' }); return { token, signal: controller.signal }; };
  const current = (token) => token === epoch;
  function fail(error, token) {
    if (!current(token)) return;
    if (error.status === 401) { flow.clear(); set({ error: chatError(error) }); return; }
    set({ status: 'error', error: chatError(error), review: null });
  }
  function notice(value) {
    if (value) set({ privacy: value, acknowledgedVersion: value.version === state.acknowledgedVersion || hasSessionConsent('chat', value.version) ? value.version : null });
  }
  function receipt(requestId, payload) {
    const old = state.requests.find((item) => item.requestId === requestId) ?? { requestId };
    const approval = payload.approval ?? payload.pendingConfirmation ?? old.approval;
    const resultsById = new Map((old.verifiedResults ?? []).map((result) => [result.key, result]));
    for (const result of [...(payload.verifiedResults ?? []), ...(payload.result ? [payload.result] : [])]) {
      const key = `${result.data.analyzerType}:${result.data.analysisId}`;
      // A risk-only projection must not erase coverage/guidance already retrieved.
      resultsById.set(key, { ...result, key, data: { ...resultsById.get(key)?.data, ...result.data } });
    }
    const results = [...resultsById.values()];
    // Human-review parameters must never be copied into conversation/result state.
    const safe = Object.fromEntries(['status', 'toolMetadata', 'resultUnavailable', 'explanation'].filter((key) => payload[key] !== undefined).map((key) => [key, payload[key]]));
    set({ requests: merge(state.requests, [{ ...old, ...safe, approval, verifiedResults: results }], 'requestId') });
  }
  async function refreshHistory(id, signal, token, older = false) {
    const payload = await api.history(id, older ? state.nextMessage : undefined, signal);
    if (!current(token)) return;
    const requests = (payload.requests ?? []).map((item) => ({ ...state.requests.find((old) => old.requestId === item.requestId), ...item }));
    set({ active: payload.conversation, messages: merge(older ? state.messages : [], payload.messages, 'id').sort((a, b) => a.sequence - b.sequence),
      requests: merge(state.requests, requests, 'requestId'), nextMessage: payload.nextBefore }); notice(payload.privacyNotice);
  }
  const flow = {
    getSnapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    acknowledge: (checked) => {
      rememberSessionConsent('chat', state.privacy?.version, checked);
      set({ acknowledgedVersion: checked ? state.privacy?.version : null });
    },
    edit: (draft) => { if (!chatBusy(state)) set({ draft, error: '' }); },
    dismissError: () => set({ error: '', status: 'idle' }),
    closeReview: () => { if (!chatBusy(state)) set({ review: null }); },
    clear: () => { epoch++; listEpoch++; controller?.abort(); state = empty(); listeners.forEach((fn) => fn()); },
    async init() {
      const { token, signal } = begin('loading');
      try { const payload = await api.privacy(signal); if (current(token)) { notice(payload.privacyNotice); set({ status: 'idle' }); } }
      catch (error) { fail(error, token); }
      if (current(token)) await flow.list();
    },
    async list(older = false) {
      if (state.listLoading) return;
      const token = ++listEpoch; set({ listLoading: true, listError: '' });
      try { const payload = await api.list(older ? state.nextConversation : undefined);
        if (token === listEpoch) set({ conversations: merge(older ? state.conversations : [], payload.conversations, 'id').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), nextConversation: payload.nextBefore });
      } catch (error) { if (token === listEpoch) { if (error.status === 401) flow.clear(); set({ listError: chatError(error) }); } }
      finally { if (token === listEpoch) set({ listLoading: false }); }
    },
    async create() {
      if (chatBusy(state)) return;
      const { token, signal } = begin('creating'); set({ review: null, pendingMessage: null, draft: '' });
      try { const payload = await api.create(signal); if (!current(token)) return;
        notice(payload.privacyNotice); set({ active: payload.conversation, messages: [], requests: [], nextMessage: null, status: 'idle',
          conversations: [payload.conversation, ...state.conversations.filter((item) => item.id !== payload.conversation.id)] });
        return payload.conversation.id;
      } catch (error) { fail(error, token); }
    },
    async open(id) {
      const { token, signal } = begin('opening'); set({ active: null, messages: [], requests: [], draft: '', review: null, pendingMessage: null });
      try { await refreshHistory(id, signal, token); if (current(token)) set({ status: 'idle' }); }
      catch (error) { fail(error, token); }
    },
    async older() {
      if (!state.active || state.nextMessage === null || chatBusy(state)) return;
      const { token, signal } = begin('opening');
      try { await refreshHistory(state.active.id, signal, token, true); if (current(token)) set({ status: 'idle' }); }
      catch (error) { fail(error, token); }
    },
    async send(analysisInput) {
      if (chatBusy(state) || !state.privacy || state.acknowledgedVersion !== state.privacy.version) return;
      const content = analysisInput ? `Please prepare the privately supplied ${analysisInput.toolName === 'analyze_email' ? 'email' : 'URL'} for analysis and employee confirmation.` : state.draft.trim();
      if (!content || (!analysisInput && state.draft.length > CHAT_MAX_LENGTH)) { set({ error: 'Enter a message of 1–2,000 characters.' }); return; }
      if (!state.active) { const created = await flow.create(); if (!created || state.active?.id !== created || state.status !== 'idle') return; }
      if (state.acknowledgedVersion !== state.privacy?.version) return;
      const id = state.active.id; const requestId = uuid();
      const { token, signal } = begin('sending');
      set({ draft: '', pendingMessage: { requestId, content }, review: null });
      try {
        const payload = await api.send(id, { content, requestId, privacyNoticeVersion: state.acknowledgedVersion, ...(analysisInput ? { analysisInput } : {}) }, signal);
        if (!current(token)) return;
        set({ messages: merge(state.messages, payload.messages, 'id').sort((a, b) => a.sequence - b.sequence), pendingMessage: null, status: 'idle' });
        receipt(requestId, { ...payload, status: 'COMPLETED' }); void flow.list();
      } catch (error) {
        if (current(token)) { receipt(requestId, { status: 'UNCONFIRMED' }); set({ pendingMessage: null }); }
        fail(error, token);
      }
    },
    async recover(requestId) {
      if (!state.active || chatBusy(state)) return;
      const id = state.active.id; const { token, signal } = begin('recovering');
      try { const payload = await api.recover(id, requestId, signal); if (!current(token)) return;
        receipt(requestId, payload); await refreshHistory(id, signal, token); if (current(token)) set({ status: 'idle' });
      } catch (error) { fail(error, token); }
    },
    async review(requestId, approvalId) {
      if (!state.active || chatBusy(state)) return;
      const id = state.active.id; const { token, signal } = begin('reviewing');
      try { const payload = await api.review(id, approvalId, signal); if (!current(token)) return;
        receipt(requestId, payload); set({ status: 'idle', review: payload.approval.status === 'PENDING' ? { ...payload, requestId } : null });
      } catch (error) { fail(error, token); }
    },
    async decide(decision, explicitlyReviewed = false) {
      const review = state.review;
      if (!review || chatBusy(state) || !['CONFIRM', 'REJECT'].includes(decision) || (decision === 'CONFIRM' && (!explicitlyReviewed || Date.parse(review.approval.expiresAt) <= Date.now()))) return;
      const id = state.active.id; const { token, signal } = begin(decision === 'CONFIRM' ? 'deciding' : 'rejecting');
      try {
        const fresh = await api.approval(id, review.approval.id, signal); if (!current(token)) return;
        if (fresh.approval.status !== 'PENDING') { receipt(review.requestId, fresh); set({ status: 'idle', review: null }); return; }
        const payload = await api.decide(id, review.approval.id, decision, signal); if (!current(token)) return;
        receipt(review.requestId, payload); set({ status: 'idle', review: null });
      } catch (error) { fail(error, token); }
    },
    async explain(requestId, approvalId) {
      if (!state.active || chatBusy(state) || !state.privacy || state.acknowledgedVersion !== state.privacy.version) return;
      const id = state.active.id; const { token, signal } = begin('explaining');
      try { const payload = await api.explain(id, approvalId, state.acknowledgedVersion, signal); if (!current(token)) return;
        receipt(requestId, payload); await refreshHistory(id, signal, token);
        if (current(token)) set({ status: 'idle', error: payload.explanation?.status === 'UNAVAILABLE' ? chatError({ code: payload.explanation.code }) : '' });
      } catch (error) { fail(error, token); }
    },
  };
  return flow;
}
