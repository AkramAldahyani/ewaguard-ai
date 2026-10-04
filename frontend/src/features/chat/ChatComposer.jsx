import { FileSearch, Link2, LockKeyhole, Mail, Send } from 'lucide-react';
import { Button } from '../../components/ui/index.jsx';
import { MAX_MESSAGE_LENGTH, shouldSendOnEnter } from './chat-state.js';

export function ChatComposer({ value, onChange, onSend, disabled, sendDisabled, inputRef }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSend(); }} className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
    <div className="mx-auto max-w-3xl"><label htmlFor="chat-message" className="sr-only">Message to EWAGuard AI — local preview</label>
      <div className="chat-composer-box rounded-2xl border border-slate-300 p-3 focus-within:border-brand-500">
        <textarea ref={inputRef} id="chat-message" value={value} onChange={(event) => onChange(event.target.value)} readOnly={disabled} aria-disabled={disabled} maxLength={MAX_MESSAGE_LENGTH} rows={3} autoComplete="off" spellCheck={false} aria-describedby="chat-privacy chat-keyboard chat-length" placeholder="Try a non-sensitive example…" className="block max-h-48 min-h-20 w-full resize-y border-0 bg-transparent p-1 text-sm leading-6 text-slate-800 outline-none [overflow-wrap:anywhere]" onKeyDown={(event) => { if (shouldSendOnEnter(event)) { event.preventDefault(); if (!sendDisabled) onSend(); } }} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p id="chat-length" className="text-xs text-slate-500">{value.length} / {MAX_MESSAGE_LENGTH}</p><Button type="submit" disabled={sendDisabled} size="sm" aria-label="Send preview message"><Send className="size-4" aria-hidden="true" />Send preview</Button></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Future analysis actions">{[[Mail, 'Analyze Email'], [Link2, 'Analyze URL'], [FileSearch, 'Analyze File']].map(([Icon, label]) => <Button key={label} disabled variant="ghost" size="sm" className="text-xs"><Icon className="size-3.5" aria-hidden="true" />{label}</Button>)}<span className="text-xs text-slate-500">Tools coming later</span></div>
      <p id="chat-keyboard" className="mt-2 text-xs leading-5 text-slate-500">Enter to send · Shift+Enter for a new line. Preview messages clear when you leave this page.</p>
      <p id="chat-privacy" className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-600"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Do not enter passwords, credentials, restricted company information, or confidential material not approved for this channel.</p>
    </div>
  </form>;
}
