import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  FileSearch,
  History,
  KeyRound,
  LockKeyhole,
  Mail,
  Link2,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { useAuth } from '../../context/auth-context.js';
import { AIMessage, AssistantAvatar, EmployeeMessage, ToolRunningState } from './ChatMessages.jsx';
import { ChatComposer } from './ChatComposer.jsx';
import { ChatReceipt } from './ChatEvidence.jsx';
import { ApprovalDialog, PrivateAnalysisDialog } from './ChatDialogs.jsx';
import { CHAT_MAX_LENGTH, chatBusy, createChatFlow } from './chat-flow.js';

const activities = {
  loading: 'Loading privacy notice…',
  opening: 'Retrieving conversation…',
  creating: 'Creating conversation…',
  sending: 'EWAGuard AI is responding…',
  recovering: 'Retrieving saved analysis and request status…',
  reviewing: 'Retrieving the private operation for your review…',
  deciding: 'Submitting your approval and awaiting analysis results…',
  rejecting: 'Submitting your rejection…',
  explaining: 'Preparing an AI explanation of the saved findings…',
};
const date = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const suggestions = [
  { title: 'Suspicious Email', prompt: 'How can I identify a phishing email?', icon: Mail },
  { title: 'Password Security', prompt: 'How do I create a strong password?', icon: KeyRound },
  { title: 'Security Incident', prompt: 'What should I do if I click a suspicious link?', icon: ShieldAlert },
  { title: 'Bahrain PDPL', prompt: 'What does Bahrain PDPL mean by personal data?', icon: FileSearch },
];

export function ChatWelcome({ busy, onPrompt }) {
  return (
    <section className="assistant-welcome" aria-label="Start a conversation">
      <AssistantAvatar className="assistant-welcome-avatar" />
      <p className="assistant-eyebrow">A little guidance. A safer workday.</p>
      <h2>
        How can <span className="assistant-brand-name">EWAGuard AI</span> help you today?
      </h2>
      <p className="assistant-welcome-subtitle">
        Get trusted cybersecurity guidance, analyze suspicious activity, and learn how to stay secure.
      </p>
      <div className="assistant-suggestions">
        {suggestions.map(({ title, prompt, icon: Icon }) => (
          <button
            key={title}
            type="button"
            disabled={busy}
            className="assistant-suggestion"
            onClick={() => onPrompt(prompt)}
          >
            <Icon className="size-5 text-brand-700" aria-hidden="true" />
            <span className="assistant-suggestion-title">{title}</span>
            <span className="assistant-suggestion-prompt">{prompt}</span>
            <ArrowUpRight className="assistant-suggestion-arrow size-4" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="assistant-welcome-note">
        Bahrain PDPL answers use an unofficial English translation. Company-policy examples require demonstration mode
        and are not official EWA requirements. Approved analyses may automatically record security incidents.
      </p>
    </section>
  );
}

export function ChatPrivacy({ notice, acknowledged, onChange }) {
  return (
    <section
      aria-label="Chat privacy acknowledgement"
      className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4"
    >
      <div className="flex items-center gap-2">
        <LockKeyhole className="size-4 text-brand-700" aria-hidden="true" />
        <h2 className="text-sm font-bold text-brand-900">Before you chat</h2>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
        {notice?.text ??
          'Loading the current privacy notice. Sending remains disabled until it is available and acknowledged.'}
      </p>
      {notice && (
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-brand-600"
            checked={acknowledged}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-sm leading-6 text-slate-800">
            I understand that submitted chat content and minimized analysis findings are processed by the AI provider. I
            will not submit passwords, MFA codes, confidential company data or restricted personal information.
          </span>
        </label>
      )}
    </section>
  );
}

export function ChatPrivacyGate({ acknowledged, notice, error, busy, onChange, onReload, children }) {
  if (acknowledged) return children;
  return (
    <div className="assistant-consent-page">
      <div className="assistant-consent-card">
        <AssistantAvatar className="assistant-welcome-avatar" />
        <h1>EWAGuard AI</h1>
        <p className="assistant-consent-intro">Before we begin, please review how your information is handled.</p>
        <ChatPrivacy notice={notice} acknowledged={false} onChange={onChange} />
        {!notice && !error && (
          <p role="status" className="text-sm text-slate-500">
            Loading privacy notice…
          </p>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-4">
            <p className="text-sm text-danger-800">{error}</p>
            <Button className="mt-3" variant="secondary" size="sm" disabled={busy} onClick={onReload}>
              Reload chat
            </Button>
          </div>
        )}
        <p className="text-xs leading-5 text-slate-500">
          Check the acknowledgement above to open your chat workspace. Your choice is remembered for this signed-in
          session.
        </p>
      </div>
    </div>
  );
}

export function ConversationList({ state, onOpen, onRefresh, onMore }) {
  return (
    <nav aria-label="Your conversations" className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Your conversations</h2>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={state.listLoading}>
          Refresh
        </Button>
      </div>
      {state.listLoading && (
        <p role="status" className="p-3 text-sm text-slate-500">
          Loading conversations…
        </p>
      )}
      {state.listError && (
        <p role="alert" className="p-3 text-sm text-danger-700">
          {state.listError}
        </p>
      )}
      {!state.listLoading && !state.conversations.length && (
        <p className="px-2 py-5 text-sm leading-6 text-slate-500">
          Your conversations will appear here. Start with a cybersecurity question.
        </p>
      )}
      <ul className="mt-2 space-y-1">
        {state.conversations.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-current={state.active?.id === item.id ? 'page' : undefined}
              onClick={() => onOpen(item.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${state.active?.id === item.id ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-white'}`}
            >
              <span className="block truncate text-sm font-semibold">
                Security conversation · {date(item.createdAt)}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Updated {date(item.updatedAt)} ·{' '}
                {new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {state.nextConversation && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onMore} disabled={state.listLoading}>
          Load more conversations
        </Button>
      )}
      <p className="mt-5 px-2 text-xs leading-5 text-slate-500">
        Private to your employee account. Conversations expire after 30 days.
      </p>
    </nav>
  );
}

export function AssistantPage() {
  const { user } = useAuth();
  const [flow] = useState(() => createChatFlow());
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [privateType, setPrivateType] = useState(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [away, setAway] = useState(false);
  const follow = useRef(true);
  const log = useRef(null);
  const input = useRef(null);
  const busy = chatBusy(state);
  const acknowledged = Boolean(state.privacy && state.acknowledgedVersion === state.privacy.version);
  const emptyWorkspace =
    !state.messages.length &&
    !state.pendingMessage &&
    !state.requests.length &&
    !state.error &&
    !activities[state.status];
  useEffect(() => {
    void flow.init();
    return () => flow.clear();
  }, [flow, user.id]);
  useEffect(() => {
    if (follow.current)
      log.current?.scrollTo({
        top: log.current.scrollHeight,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
  }, [state.messages, state.requests, state.status]);
  useEffect(() => {
    if (state.review || busy) return undefined;
    const pending = state.requests.find((item) => ['PENDING', 'EXECUTING'].includes(item.approval?.status));
    if (!pending) return undefined;
    const timer = setTimeout(() => void flow.recover(pending.requestId), 15000);
    return () => clearTimeout(timer);
  }, [flow, state.requests, state.review, busy]);
  const open = (id) => {
    setHistoryOpen(false);
    setPrivateType(null);
    follow.current = true;
    void flow.open(id);
  };
  const send = (privateInput) => {
    follow.current = true;
    setAway(false);
    void flow.send(privateInput);
    input.current?.focus();
  };
  const history = (
    <ConversationList state={state} onOpen={open} onRefresh={() => flow.list()} onMore={() => flow.list(true)} />
  );
  return (
    <ChatPrivacyGate
      acknowledged={acknowledged}
      notice={state.privacy}
      error={state.error}
      busy={busy}
      onChange={flow.acknowledge}
      onReload={() => flow.init()}
    >
      <div className="assistant-workspace">
        <header className="assistant-header">
          <div className="assistant-heading">
            <AssistantAvatar />
            <div>
              <h1>EWAGuard AI</h1>
              <p>Your Cybersecurity Assistant</p>
            </div>
          </div>
          <div className="assistant-header-actions">
            <Button variant="ghost" size="sm" onClick={() => setPrivacyOpen(true)} aria-label="Privacy and limits">
              <LockKeyhole className="size-4" aria-hidden="true" />
              <span className="hidden md:inline">Privacy &amp; limits</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)} aria-label="Conversation history">
              <History className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">History</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setPrivateType(null);
                void flow.create();
                input.current?.focus();
              }}
              aria-label="New Chat"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>
          </div>
        </header>
        <section className="assistant-conversation" aria-label="Cybersecurity conversation">
          <div
            ref={log}
            tabIndex={0}
            role="region"
            aria-label="Conversation messages and results"
            className={`assistant-scroll${emptyWorkspace ? ' assistant-scroll-welcome' : ''}`}
            onScroll={(event) => {
              const el = event.currentTarget;
              const value = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
              follow.current = !value;
              setAway(value);
            }}
          >
            <div
              className={`chat-content-width assistant-content ${!state.messages.length && !state.pendingMessage ? 'assistant-content-empty' : ''}`}
            >
              {!state.messages.length && !state.pendingMessage && (
                <ChatWelcome
                  busy={busy}
                  onPrompt={(prompt) => {
                    flow.edit(prompt);
                    input.current?.focus();
                  }}
                />
              )}
              {state.nextMessage !== null && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    follow.current = false;
                    void flow.older();
                  }}
                >
                  Load earlier messages
                </Button>
              )}
              <div
                role="log"
                aria-label="Conversation messages"
                aria-live="polite"
                aria-relevant="additions"
                className="chat-message-list"
              >
                {state.messages.map((message) => (
                  <div key={message.id}>
                    {message.role === 'USER' ? (
                      <EmployeeMessage content={message.content} />
                    ) : (
                      <AIMessage content={message.content} />
                    )}
                  </div>
                ))}
                {state.pendingMessage && (
                  <div>
                    <EmployeeMessage content={state.pendingMessage.content} />
                    <p className="text-right text-xs text-slate-500">Awaiting backend confirmation</p>
                  </div>
                )}
              </div>
              {state.requests.map((request) => (
                <ChatReceipt
                  key={request.requestId}
                  request={request}
                  busy={busy}
                  acknowledged={acknowledged}
                  onRecover={() => flow.recover(request.requestId)}
                  onReview={(id) => flow.review(request.requestId, id)}
                  onExplain={(id) => flow.explain(request.requestId, id)}
                />
              ))}
              {activities[state.status] && <ToolRunningState label={activities[state.status]} />}
            </div>
          </div>
          {away && (state.messages.length > 0 || state.pendingMessage || state.requests.length > 0) && (
            <div className="assistant-jump">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  log.current?.scrollTo({
                    top: log.current.scrollHeight,
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
                  });
                  follow.current = true;
                  setAway(false);
                }}
              >
                <ArrowDown className="size-4" aria-hidden="true" />
                Jump to latest
              </Button>
            </div>
          )}
        </section>
        <ChatComposer
          notice={
            state.error && (
              <div
                id="chat-error"
                role="alert"
                className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3"
              >
                <p className="min-w-0 flex-1 text-sm leading-6 text-danger-800">{state.error}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => (state.privacy ? flow.dismissError() : flow.init())}
                >
                  {state.privacy ? 'Dismiss notice' : 'Reload chat'}
                </Button>
              </div>
            )
          }
          value={state.draft}
          onChange={flow.edit}
          onSend={() => send()}
          disabled={busy || !acknowledged}
          sendDisabled={busy || !acknowledged || !state.draft.trim() || state.draft.length > CHAT_MAX_LENGTH}
          inputRef={input}
          accessories={
            <>
              <button
                type="button"
                className="chat-tool"
                disabled={busy || !acknowledged}
                onClick={() => setPrivateType('EMAIL')}
                aria-label="Upload an .eml email for private analysis"
              >
                <Mail className="size-4" aria-hidden="true" />
                <span>
                  Email <span className="hidden sm:inline">.eml</span>
                </span>
              </button>
              <button
                type="button"
                className="chat-tool"
                disabled={busy || !acknowledged}
                onClick={() => setPrivateType('URL')}
                aria-label="Analyze a URL privately"
              >
                <Link2 className="size-4" aria-hidden="true" />
                URL
              </button>
              <Link to="/analyze/file" className="chat-tool" aria-label="Open file analyzer">
                <FileSearch className="size-4" aria-hidden="true" />
                <span>Files</span>
              </Link>
            </>
          }
        />
        <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Conversation history">
          {history}
        </Modal>
        <Modal open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy & limits">
          <ChatPrivacy
            notice={state.privacy}
            acknowledged={acknowledged}
            onChange={(checked) => {
              setPrivacyOpen(false);
              flow.acknowledge(checked);
            }}
          />
          <p className="text-sm leading-6 text-slate-600">
            Up to 2,000 characters per message. The backend enforces daily usage and application spending limits.
            Responses are not streamed. AI advice is not a substitute for IT/Security or legal advice.
          </p>
        </Modal>
        {privateType && (
          <PrivateAnalysisDialog
            key={privateType}
            type={privateType}
            onClose={() => {
              setPrivateType(null);
              input.current?.focus();
            }}
            onSubmit={send}
            onExplain={(analysisId) => {
              setPrivateType(null);
              flow.edit(`Explain my saved EMAIL analysis ${analysisId}.`);
              send();
            }}
          />
        )}
        {state.review && (
          <ApprovalDialog
            key={state.review.approval.id}
            review={state.review}
            busy={busy}
            onClose={flow.closeReview}
            onDecide={flow.decide}
            onRefresh={() => {
              const review = state.review;
              flow.closeReview();
              void flow.recover(review.requestId);
            }}
          />
        )}
      </div>
    </ChatPrivacyGate>
  );
}
