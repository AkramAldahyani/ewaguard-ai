import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDown, ArrowUpRight, History, LockKeyhole, Mail, Link2, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Button } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAuth } from '../../context/auth-context.js';
import { AIMessage, EmployeeMessage, ToolRunningState } from './ChatMessages.jsx';
import { ChatComposer } from './ChatComposer.jsx';
import { ChatReceipt } from './ChatEvidence.jsx';
import { ApprovalDialog, PrivateAnalysisDialog } from './ChatDialogs.jsx';
import { CHAT_MAX_LENGTH, CHAT_SUGGESTIONS, chatBusy, createChatFlow } from './chat-flow.js';

const activities = { loading: 'Loading privacy notice…', opening: 'Retrieving conversation…', creating: 'Creating conversation…', sending: 'EWAGuard AI is responding…', recovering: 'Retrieving saved analysis and request status…', reviewing: 'Retrieving the private operation for your review…', deciding: 'Submitting your approval and awaiting analysis results…', rejecting: 'Submitting your rejection…', explaining: 'Preparing an AI explanation of the saved findings…' };
const date = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function ChatPrivacy({ notice, acknowledged, onChange }) {
  return <section aria-label="Chat privacy acknowledgement" className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4"><div className="flex items-center gap-2"><LockKeyhole className="size-4 text-brand-700" aria-hidden="true" /><h2 className="text-sm font-bold text-brand-900">Before you chat</h2></div><p className="mt-2 text-sm leading-6 text-slate-700">{notice?.text ?? 'Loading the current privacy notice. Sending remains disabled until it is available and acknowledged.'}</p>{notice && <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3"><input type="checkbox" className="mt-1 size-4 accent-brand-600" checked={acknowledged} onChange={(e) => onChange(e.target.checked)} /><span className="text-sm leading-6 text-slate-800">I understand that submitted chat content and minimized analysis findings are processed by the AI provider. I will not submit passwords, MFA codes, confidential company data or restricted personal information.</span></label>}</section>;
}

export function ConversationList({ state, onOpen, onRefresh, onMore }) {
  return <nav aria-label="Your conversations" className="min-w-0"><div className="flex items-center justify-between gap-2"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Your conversations</h2><Button variant="ghost" size="sm" onClick={onRefresh} disabled={state.listLoading}>Refresh</Button></div>
    {state.listLoading && <p role="status" className="p-3 text-sm text-slate-500">Loading conversations…</p>}{state.listError && <p role="alert" className="p-3 text-sm text-danger-700">{state.listError}</p>}
    {!state.listLoading && !state.conversations.length && <p className="px-2 py-5 text-sm leading-6 text-slate-500">Your conversations will appear here. Start with a cybersecurity question.</p>}
    <ul className="mt-2 space-y-1">{state.conversations.map((item) => <li key={item.id}><button type="button" aria-current={state.active?.id === item.id ? 'page' : undefined} onClick={() => onOpen(item.id)} className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${state.active?.id === item.id ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-white'}`}><span className="block truncate text-sm font-semibold">Security conversation · {date(item.createdAt)}</span><span className="mt-1 block text-xs text-slate-500">Updated {date(item.updatedAt)} · {new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></button></li>)}</ul>
    {state.nextConversation && <Button variant="secondary" size="sm" className="mt-3" onClick={onMore} disabled={state.listLoading}>Load more conversations</Button>}<p className="mt-5 px-2 text-xs leading-5 text-slate-500">Private to your employee account. Conversations expire after 30 days.</p>
  </nav>;
}

export function AssistantPage() {
  const { user } = useAuth();
  const [flow] = useState(() => createChatFlow());
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const [historyOpen, setHistoryOpen] = useState(false); const [privateType, setPrivateType] = useState(null); const [privacyOpen, setPrivacyOpen] = useState(false);
  const [away, setAway] = useState(false); const follow = useRef(true); const log = useRef(null); const input = useRef(null);
  const busy = chatBusy(state); const acknowledged = Boolean(state.privacy && state.acknowledgedVersion === state.privacy.version);
  useEffect(() => { void flow.init(); return () => flow.clear(); }, [flow, user.id]);
  useEffect(() => { if (follow.current) log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'instant' }); }, [state.messages, state.requests, state.status]);
  useEffect(() => {
    if (state.review || busy) return undefined;
    const pending = state.requests.find((item) => ['PENDING', 'EXECUTING'].includes(item.approval?.status));
    if (!pending) return undefined;
    const timer = setTimeout(() => void flow.recover(pending.requestId), 15000);
    return () => clearTimeout(timer);
  }, [flow, state.requests, state.review, busy]);
  const open = (id) => { setHistoryOpen(false); setPrivateType(null); follow.current = true; void flow.open(id); };
  const send = (privateInput) => { follow.current = true; setAway(false); void flow.send(privateInput); input.current?.focus(); };
  const history = <ConversationList state={state} onOpen={open} onRefresh={() => flow.list()} onMore={() => flow.list(true)} />;
  return <div className="flex h-full min-h-0 flex-col">
    <PageHeader className="mb-3 shrink-0" eyebrow="Employee assistant" title="Ask EWAGuard AI" description="Clear cybersecurity guidance. Verified findings. You stay in control." actions={<><Button variant="secondary" onClick={() => setHistoryOpen(true)} aria-label="Conversation history" className="xl:hidden"><History className="size-4" aria-hidden="true" /><span className="hidden sm:inline">History</span></Button><Button variant="secondary" disabled={busy} onClick={() => { setPrivateType(null); void flow.create(); input.current?.focus(); }}><Plus className="size-4" aria-hidden="true" /><span>New conversation</span></Button></>} />
    <div className="flex min-h-0 min-w-0 flex-1 gap-4">
      <aside className="hidden w-60 shrink-0 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-3 xl:block">{history}</aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card" aria-label="Cybersecurity conversation">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6"><div className="flex items-center gap-2"><Sparkles className="size-4 text-brand-700" aria-hidden="true" /><span className="text-sm font-bold">EWAGuard AI</span><Badge>Employee workspace</Badge></div><Button variant="ghost" size="sm" onClick={() => setPrivacyOpen(true)}>Privacy &amp; limits</Button></div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2 sm:px-6"><span className="text-xs font-semibold text-slate-500">Private analysis</span><Button size="sm" variant="ghost" disabled={busy || !acknowledged} onClick={() => setPrivateType('EMAIL')}><Mail className="size-3.5" aria-hidden="true" />Email</Button><Button size="sm" variant="ghost" disabled={busy || !acknowledged} onClick={() => setPrivateType('URL')}><Link2 className="size-3.5" aria-hidden="true" />URL</Button><Link to="/analyze/file" className="rounded-lg px-2 py-2 text-xs font-semibold text-brand-700 hover:underline">File analyzer</Link></div>
        <div ref={log} tabIndex={0} role="region" aria-label="Conversation messages and results" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6" onScroll={(event) => { const el = event.currentTarget; const value = el.scrollHeight - el.scrollTop - el.clientHeight > 80; follow.current = !value; setAway(value); }}>
          <div className="mx-auto max-w-3xl">
            {!acknowledged && <ChatPrivacy notice={state.privacy} acknowledged={acknowledged} onChange={flow.acknowledge} />}
            {!state.messages.length && !state.pendingMessage && <div className="chat-welcome py-4 sm:py-6"><span className="chat-emblem mx-auto grid size-12 place-items-center rounded-2xl text-white"><ShieldCheck className="size-6" aria-hidden="true" /></span><h2 className="mt-4 text-center text-xl font-bold tracking-tight text-navy-900 sm:text-2xl">How can EWAGuard AI help?</h2><p className="mx-auto mt-2 max-w-lg text-center text-sm leading-6 text-slate-600">Ask for practical advice or explain an existing analysis by its ID. Submit email content and URLs through Private analysis.</p><div className="mt-5 grid gap-2 sm:grid-cols-2">{CHAT_SUGGESTIONS.map((prompt) => <button key={prompt} type="button" disabled={busy} onClick={() => { flow.edit(prompt); input.current?.focus(); }} className="chat-prompt flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left text-sm leading-6 text-slate-700"><span className="flex-1">{prompt}</span><ArrowUpRight className="mt-1 size-4 shrink-0 text-brand-700" aria-hidden="true" /></button>)}</div><p className="mt-4 text-center text-xs leading-5 text-slate-500">AI advice may be inaccurate. Verified analyzer results are shown separately.<br />Company-policy and Bahrain PDPL sources are not connected. No incidents are created here.</p></div>}
            {state.nextMessage !== null && <Button variant="secondary" size="sm" disabled={busy} onClick={() => { follow.current = false; void flow.older(); }}>Load earlier messages</Button>}
            <div role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions" className="divide-y divide-slate-100">{state.messages.map((message) => <div key={message.id}>{message.role === 'USER' ? <EmployeeMessage preview={false} content={message.content} /> : <AIMessage preview={false} content={message.content} />}</div>)}{state.pendingMessage && <div><EmployeeMessage preview={false} content={state.pendingMessage.content} /><p className="text-xs text-slate-500">Awaiting backend confirmation</p></div>}</div>
            {state.requests.map((request) => <ChatReceipt key={request.requestId} request={request} busy={busy} acknowledged={acknowledged} onRecover={() => flow.recover(request.requestId)} onReview={(id) => flow.review(request.requestId, id)} onExplain={(id) => flow.explain(request.requestId, id)} />)}
            {activities[state.status] && <ToolRunningState preview={false} label={activities[state.status]} />}
            {state.error && <div role="alert" className="my-4 rounded-xl border border-danger-200 bg-danger-50 p-4"><p className="text-sm leading-6 text-danger-800">{state.error}</p><Button className="mt-3" size="sm" variant="secondary" disabled={busy} onClick={() => state.privacy ? flow.dismissError() : flow.init()}>{state.privacy ? 'Dismiss notice' : 'Reload chat'}</Button></div>}
          </div>
        </div>
        {away && <div className="flex justify-center border-t border-slate-100 py-1"><Button variant="ghost" size="sm" onClick={() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'instant' }); follow.current = true; setAway(false); }}><ArrowDown className="size-4" aria-hidden="true" />Jump to latest</Button></div>}
        <ChatComposer value={state.draft} onChange={flow.edit} onSend={() => send()} disabled={busy || !acknowledged} sendDisabled={busy || !acknowledged || !state.draft.trim() || state.draft.length > CHAT_MAX_LENGTH} inputRef={input} />
      </section>
    </div>
    <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Conversation history">{history}</Modal>
    <Modal open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy & limits"><ChatPrivacy notice={state.privacy} acknowledged={acknowledged} onChange={flow.acknowledge} /><p className="text-sm leading-6 text-slate-600">Up to 2,000 characters per message. The backend enforces daily usage and application spending limits. Responses are not streamed. AI advice is not a substitute for IT/Security or legal advice.</p></Modal>
    {privateType && <PrivateAnalysisDialog key={privateType} type={privateType} onClose={() => { setPrivateType(null); input.current?.focus(); }} onSubmit={send} />}
    {state.review && <ApprovalDialog key={state.review.approval.id} review={state.review} busy={busy} onClose={flow.closeReview} onDecide={flow.decide} onRefresh={() => { const review = state.review; flow.closeReview(); void flow.recover(review.requestId); }} />}
  </div>;
}
