import { LockKeyhole, Send } from 'lucide-react';
import { Button } from '../../components/ui/index.jsx';
import { CHAT_MAX_LENGTH } from './chat-flow.js';
import { shouldSendOnEnter } from './chat-state.js';

export function ChatComposer({ value, onChange, onSend, disabled, sendDisabled, inputRef }) {
  return <form onSubmit={(event) => { event.preventDefault(); if (!sendDisabled) onSend(); }} className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
    <div className="mx-auto max-w-3xl"><label htmlFor="chat-message" className="sr-only">Message to EWAGuard AI</label>
      <div className="chat-composer-box rounded-2xl border border-slate-300 p-2.5 focus-within:border-brand-500">
        <textarea ref={inputRef} id="chat-message" value={value} onChange={(event) => onChange(event.target.value)} readOnly={disabled} aria-disabled={disabled} maxLength={CHAT_MAX_LENGTH} rows={2} autoComplete="off" spellCheck={false} aria-describedby="chat-privacy chat-keyboard chat-length" placeholder="Ask a cybersecurity question…" className="block max-h-36 min-h-14 w-full resize-y border-0 bg-transparent p-1 text-sm leading-6 text-slate-800 outline-none [overflow-wrap:anywhere]" onKeyDown={(event) => { if (shouldSendOnEnter(event)) { event.preventDefault(); if (!sendDisabled) onSend(); } }} />
        <div className="flex flex-wrap items-center justify-between gap-2"><p id="chat-length" className="text-xs text-slate-500">{value.length} / {CHAT_MAX_LENGTH}</p><Button type="submit" disabled={sendDisabled} size="sm" aria-label="Send message"><Send className="size-4" aria-hidden="true" />Send</Button></div>
      </div>
      <p id="chat-keyboard" className="mt-2 hidden text-xs text-slate-500 sm:block">Enter to send · Shift+Enter for a new line</p>
      <p id="chat-privacy" className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-600"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Keep passwords, MFA codes and confidential information out of chat. Use Private analysis for email content and URLs.</p>
    </div>
  </form>;
}
