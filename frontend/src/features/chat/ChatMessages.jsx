import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Copy } from 'lucide-react';
import { MessageContent } from './MessageContent.jsx';
import logo from '../../assets/branding/ewa-ai-logo.png';

export function AssistantAvatar({ className = '' }) {
  return (
    <span className={`assistant-avatar ${className}`} aria-hidden="true">
      <img src={logo} alt="" />
    </span>
  );
}

export function EmployeeMessage({ content }) {
  return (
    <article className="chat-message chat-message-user" aria-label="Your message">
      <div className="chat-user-content">
        <h3 className="chat-message-label">You</h3>
        <div className="chat-user-bubble">
          <p>{content}</p>
        </div>
      </div>
    </article>
  );
}

export function AIMessage({ content, children }) {
  const [copyState, setCopyState] = useState('idle');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(content);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    timer.current = setTimeout(() => setCopyState('idle'), 2500);
  };
  return (
    <article className="chat-message chat-message-assistant" aria-label="Assistant message">
      <AssistantAvatar />
      <div className="chat-ai-content">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="chat-message-label">EWAGuard AI</h3>
        </div>
        <div className="chat-ai-bubble">
          {content && <MessageContent content={content} />}
          {children && <div className="mt-4 space-y-4">{children}</div>}
        </div>
        {content && (
          <div className="chat-message-actions">
            <button type="button" onClick={copy} aria-label="Copy AI response" className="chat-copy">
              {copyState === 'copied' ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              <span>{copyState === 'copied' ? 'Copied' : 'Copy'}</span>
            </button>
            <span role="status" className="text-xs text-slate-600">
              {copyState === 'error'
                ? 'Copy unavailable. Select the response text to copy it.'
                : copyState === 'copied'
                  ? 'Response copied.'
                  : ''}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

export function ToolRunningState({ label }) {
  return (
    <div role="status" className="chat-loading">
      <span className="chat-typing" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
    </div>
  );
}

export function CitationCard({ title, reference, excerpt, sourceType }) {
  // Plain text only: untrusted evidence cannot inject HTML or active links.
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Source reference">
      <div className="flex items-start gap-3">
        <BookOpen className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-700">{sourceType ?? 'Source type not supplied'}</p>
          <h4 className="mt-1 break-words text-sm font-bold text-slate-900">{title ?? 'No source connected'}</h4>
          <p className="mt-1 break-words text-xs text-slate-600">{reference ?? 'Section or page not supplied'}</p>
          {excerpt && (
            <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-brand-200 pl-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
              {excerpt}
            </blockquote>
          )}
        </div>
      </div>
    </section>
  );
}
