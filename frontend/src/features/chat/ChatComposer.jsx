import { useEffect, useRef } from 'react';
import { ArrowUp, LockKeyhole } from 'lucide-react';
import { CHAT_MAX_LENGTH } from './chat-flow.js';
import { shouldSendOnEnter } from './chat-state.js';

export function ChatComposer({ value, onChange, onSend, disabled, sendDisabled, inputRef, accessories, notice }) {
  const localRef = useRef(null);
  const field = inputRef ?? localRef;
  useEffect(() => {
    const input = field.current;
    if (!input) return undefined;
    const resize = () => {
      input.style.height = '0px';
      input.style.height = `${Math.min(160, Math.max(48, input.scrollHeight))}px`;
      input.style.overflowY = input.scrollHeight > 160 ? 'auto' : 'hidden';
    };
    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== width) {
        width = input.clientWidth;
        resize();
      }
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [value, field]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!sendDisabled) onSend();
      }}
      className="chat-composer"
    >
      <div className="chat-content-width">
        {notice}
        <label htmlFor="chat-message" className="sr-only">
          Message to EWAGuard AI
        </label>
        <div className="chat-composer-box">
          <textarea
            ref={field}
            id="chat-message"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            readOnly={disabled}
            aria-disabled={disabled}
            maxLength={CHAT_MAX_LENGTH}
            rows={1}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${notice ? 'chat-error ' : ''}chat-privacy chat-keyboard chat-length`}
            placeholder="Ask EWAGuard AI about cybersecurity..."
            className="chat-input"
            onKeyDown={(event) => {
              if (shouldSendOnEnter(event)) {
                event.preventDefault();
                if (!sendDisabled) onSend();
              }
            }}
          />
          <div className="chat-composer-controls">
            <div className="chat-composer-tools">{accessories}</div>
            <div className="flex shrink-0 items-center gap-3">
              <span id="chat-length" className="chat-length">
                {value.length} / {CHAT_MAX_LENGTH}
              </span>
              <button type="submit" disabled={sendDisabled} className="chat-send" aria-label="Send message">
                <ArrowUp className="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <div className="chat-composer-caption">
          <p id="chat-privacy">
            <LockKeyhole className="size-3 shrink-0" aria-hidden="true" />
            <span>Keep passwords and confidential information out of chat. AI can make mistakes.</span>
          </p>
          <p id="chat-keyboard">Enter to send · Shift+Enter for a new line</p>
        </div>
      </div>
    </form>
  );
}
