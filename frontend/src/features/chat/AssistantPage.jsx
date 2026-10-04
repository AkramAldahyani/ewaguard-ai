import { useEffect, useReducer, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, BookOpen, Link2, Mail, Plus, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Button } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { AIMessage, ChatError, EmployeeMessage, SecurityNotice, ToolRunningState } from './ChatMessages.jsx';
import { ChatComposer } from './ChatComposer.jsx';
import { canSend, chatReducer, initialChatState, MAX_PREVIEW_TURNS } from './chat-state.js';

const suggestions = [
  [Mail, 'I received a suspicious email.'],
  [Link2, 'Is this website safe to visit?'],
  [ShieldAlert, 'I clicked a suspicious link.'],
  [ShieldCheck, 'What should I do if I think my laptop has malware?'],
  [BookOpen, 'Can I share customer information externally?'],
  [Sparkles, 'How does MFA protect my account?'],
];

export function AssistantPage() {
  const [state, dispatch] = useReducer(chatReducer, undefined, initialChatState);
  const [outcome, setOutcome] = useState('complete');
  const [confirmReset, setConfirmReset] = useState(false);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const inputRef = useRef(null);
  const logRef = useRef(null);
  const followLatest = useRef(true);
  const sequence = useRef(0);
  const focusAfterReset = useRef(false);
  const atLimit = state.messages.filter((message) => message.role === 'employee').length >= MAX_PREVIEW_TURNS;

  useEffect(() => {
    if (state.status !== 'loading') return undefined;
    const id = state.requestId;
    const timer = window.setTimeout(() => dispatch({ type: outcome, id }), 600);
    return () => window.clearTimeout(timer);
  }, [state.status, state.requestId, outcome]);

  useEffect(() => {
    if (followLatest.current && logRef.current) logRef.current.scrollTo({ top: logRef.current.scrollHeight, behavior: 'instant' });
  }, [state.messages, state.status]);

  function send() {
    if (!canSend(state)) return;
    followLatest.current = true;
    setAwayFromBottom(false);
    dispatch({ type: 'send', id: `preview-${++sequence.current}` });
    inputRef.current?.focus();
  }

  function retry() {
    setOutcome('complete');
    followLatest.current = true;
    setAwayFromBottom(false);
    dispatch({ type: 'retry', id: `preview-${++sequence.current}` });
    inputRef.current?.focus();
  }

  function reset() {
    focusAfterReset.current = true;
    dispatch({ type: 'reset' });
    setOutcome('complete');
    setConfirmReset(false);
    followLatest.current = true;
    setAwayFromBottom(false);
  }

  function closeReset() {
    setConfirmReset(false);
    if (focusAfterReset.current) {
      focusAfterReset.current = false;
      inputRef.current?.focus();
    }
  }

  return <div className="flex h-full min-h-0 flex-col">
    <PageHeader className="mb-4 shrink-0" eyebrow="Employee assistant" title="Ask EWAGuard AI" description="A calm space for cybersecurity questions and clear next steps." actions={<Button variant="secondary" onClick={() => state.messages.length || state.draft ? setConfirmReset(true) : inputRef.current?.focus()}><Plus className="size-4" aria-hidden="true" />New conversation</Button>} />
    <div className="mb-3 shrink-0"><SecurityNotice><strong>Preview only.</strong> OpenAI and security tools are not connected. Messages stay in this page’s memory; replies are fixed interface demonstrations, not security advice.</SecurityNotice></div>
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card" aria-label="Cybersecurity conversation preview">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6"><div className="flex items-center gap-2"><Sparkles className="size-4 text-brand-700" aria-hidden="true" /><span className="text-sm font-bold">EWAGuard AI</span><Badge>Local preview</Badge></div><div className="flex items-center gap-3"><label htmlFor="preview-outcome" className="sr-only">Next preview response</label><select id="preview-outcome" value={outcome} disabled={state.status !== 'idle'} onChange={(event) => setOutcome(event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:border-brand-500"><option value="complete">Preview response</option><option value="fail">Simulate error</option></select><Link className="hidden items-center gap-1 rounded-md text-xs font-semibold text-brand-700 hover:underline sm:inline-flex" to="/design-system/chat">Components<ArrowUpRight className="size-3" aria-hidden="true" /></Link></div></div>
      <div ref={logRef} tabIndex={0} role="region" aria-label="Conversation history" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        const away = scrollHeight - scrollTop - clientHeight > 80;
        followLatest.current = !away;
        setAwayFromBottom(away);
      }}>
        <div className="mx-auto max-w-3xl">
          {state.messages.length === 0 ? <div className="chat-welcome py-4 sm:py-7"><span className="chat-emblem mx-auto grid size-14 place-items-center rounded-2xl text-white"><ShieldCheck className="size-6" aria-hidden="true" /></span><h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">How can EWAGuard AI help?</h2><p className="mx-auto mt-3 max-w-lg text-center text-sm leading-6 text-slate-600">Start with what’s on your mind, or choose an example below. This is a local preview — no AI or security analysis runs.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{suggestions.map(([Icon, prompt], index) => <button key={prompt} type="button" onClick={() => { dispatch({ type: 'draft', value: prompt }); inputRef.current?.focus(); }} style={{ '--chat-delay': `${index * 35}ms` }} className="chat-prompt flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left text-sm font-medium leading-6 text-slate-700"><span className="chat-prompt-icon grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon className="size-4" aria-hidden="true" /></span><span className="flex-1">{prompt}</span><ArrowUpRight className="chat-prompt-arrow mt-1 size-4 shrink-0 text-slate-400" aria-hidden="true" /></button>)}</div></div> : <div role="log" aria-label="Preview messages" aria-live="polite" aria-relevant="additions" className="divide-y divide-slate-100">{state.messages.map((message) => <div key={message.id} className="chat-message-enter">{message.role === 'employee' ? <EmployeeMessage content={message.content} /> : <AIMessage content={message.content} />}</div>)}</div>}
          {state.status === 'loading' && <ToolRunningState />}
          {state.status === 'error' && <ChatError onRetry={retry} onDismiss={() => { dispatch({ type: 'dismiss' }); inputRef.current?.focus(); }} />}
          {atLimit && <SecurityNotice>This preview is limited to {MAX_PREVIEW_TURNS} messages. Start a new conversation to clear it and continue.</SecurityNotice>}
        </div>
      </div>
      {awayFromBottom && <div className="flex justify-center border-t border-slate-100 py-2"><Button variant="subtle" size="sm" onClick={() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'instant' }); followLatest.current = true; setAwayFromBottom(false); }}><ArrowDown className="size-4" aria-hidden="true" />Jump to latest</Button></div>}
      <ChatComposer value={state.draft} onChange={(value) => dispatch({ type: 'draft', value })} onSend={send} disabled={state.status !== 'idle' || atLimit} sendDisabled={!canSend(state)} inputRef={inputRef} />
    </section>
    <Modal open={confirmReset} onClose={closeReset} title="Start a new conversation?" description="This clears the current preview messages and draft from this page. They cannot be restored." footer={<><Button variant="secondary" onClick={() => setConfirmReset(false)}>Keep conversation</Button><Button onClick={reset}>Clear and start new</Button></>}><p className="text-sm leading-6 text-slate-600">Nothing from this preview has been stored in a database or sent to an AI service.</p></Modal>
  </div>;
}
