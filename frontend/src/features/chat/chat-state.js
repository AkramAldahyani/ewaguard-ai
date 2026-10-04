export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_PREVIEW_TURNS = 20;
export const PREVIEW_REPLY = 'Interface preview only. Your message stayed in this page’s memory and was not sent to OpenAI or any security tool. No analysis, legal guidance, or incident creation took place. For an active concern, use your organization’s approved IT/security reporting channel.';

export function initialChatState() {
  return { draft: '', messages: [], status: 'idle', requestId: null };
}

export function canSend(state) {
  return state.status === 'idle' && state.draft.trim().length > 0 &&
    state.draft.length <= MAX_MESSAGE_LENGTH && state.messages.filter((message) => message.role === 'employee').length < MAX_PREVIEW_TURNS;
}

// UI-only state machine. No transport, persistence, classification or tool execution.
export function chatReducer(state, action) {
  switch (action.type) {
    case 'draft': return state.status === 'idle' ? { ...state, draft: action.value.slice(0, MAX_MESSAGE_LENGTH) } : state;
    case 'send':
      if (!canSend(state)) return state;
      return { ...state, draft: '', status: 'loading', requestId: action.id,
        messages: [...state.messages, { id: action.id, role: 'employee', content: state.draft.trim() }] };
    case 'complete':
      if (state.status !== 'loading' || state.requestId !== action.id) return state;
      return { ...state, status: 'idle', requestId: null,
        messages: [...state.messages, { id: `${action.id}-reply`, role: 'assistant', content: PREVIEW_REPLY }] };
    case 'fail':
      return state.status === 'loading' && state.requestId === action.id ? { ...state, status: 'error' } : state;
    case 'retry':
      return state.status === 'error' ? { ...state, status: 'loading', requestId: action.id } : state;
    case 'dismiss': return state.status === 'error' ? { ...state, status: 'idle', requestId: null } : state;
    case 'reset': return initialChatState();
    default: return state;
  }
}

export function shouldSendOnEnter(event) {
  return event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey &&
    !event.nativeEvent?.isComposing && !event.isComposing && event.keyCode !== 229;
}
