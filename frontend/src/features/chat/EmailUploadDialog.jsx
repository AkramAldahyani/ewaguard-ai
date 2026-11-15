import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { SensitiveInformationNotice } from '../disclaimer/SensitiveInformationNotice.jsx';
import { createEmailFlow, formatBytes } from '../email/email-state.js';
import { EmailResults } from '../email/EmailResults.jsx';

export function EmlUploadForm({ state, flow }) {
  const [reviewed, setReviewed] = useState(false);
  const busy = ['validating', 'submitting'].includes(state.status);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (reviewed) void flow.submit();
      }}
      className="space-y-4"
    >
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <legend className="font-semibold">Upload an email (.eml only)</legend>
        <label htmlFor="chat-email-file" className="block text-sm font-semibold">
          Email file
        </label>
        <input
          id="chat-email-file"
          type="file"
          accept=".eml"
          aria-describedby="chat-email-file-hint"
          className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2"
          onChange={(event) => {
            setReviewed(false);
            flow.selectFiles(Array.from(event.target.files));
            event.target.value = '';
          }}
        />
        <p id="chat-email-file-hint" className="text-xs leading-5 text-slate-500">
          One .eml file, up to 1 MiB. Email content and attachments are not opened or executed. Attachments are not
          scanned for malware.
        </p>
        {state.file && (
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="break-all text-sm font-semibold">{state.file.name}</p>
            <p className="text-xs text-slate-500">{formatBytes(state.file.size)}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReviewed(false);
                flow.selectFiles([]);
              }}
            >
              Remove file
            </Button>
          </div>
        )}
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-6">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-brand-600"
            checked={reviewed}
            disabled={!state.file}
            onChange={(event) => setReviewed(event.target.checked)}
          />
          <span>I confirm this email is permitted for submission and want to analyze the selected file.</span>
        </label>
        <Button type="submit" disabled={!state.file || !reviewed || busy}>
          {busy ? 'Analyzing email…' : 'Analyze .eml file'}
        </Button>
      </fieldset>
    </form>
  );
}

export function EmailUploadDialog({ onClose, onExplain }) {
  const [flow] = useState(() => {
    const value = createEmailFlow();
    value.changeMode('eml');
    return value;
  });
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const busy = ['validating', 'submitting'].includes(state.status);
  useEffect(() => () => flow.dispose(), [flow]);
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Private email analysis"
      description="Upload a .eml file for local email checks. Raw email content is not sent to the AI provider."
    >
      <div className="space-y-4">
        {!state.acknowledged && (
          <SensitiveInformationNotice
            key={state.noticeKey}
            context="EMAIL_ANALYSIS"
            continuation="email upload"
            onAcknowledged={flow.acknowledge}
          />
        )}
        {state.error && (
          <p role="alert" className="text-sm text-danger-700">
            {state.error}
          </p>
        )}
        {busy && (
          <p role="status" className="text-sm text-slate-600">
            Analyzing your email. Please wait for the result before closing.
          </p>
        )}
        {state.acknowledged && !state.result && <EmlUploadForm state={state} flow={flow} />}
        {state.result && (
          <>
            <p className="break-all text-xs text-slate-500">Saved analysis ID: {state.result.analysisId}</p>
            <EmailResults analysis={state.result} />
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => onExplain(state.result.analysisId)}>Explain findings in chat</Button>
              <Button variant="secondary" onClick={flow.reset}>
                Analyze another .eml
              </Button>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              AI explanation is optional and uses only saved, minimized findings. It does not repeat the analysis.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
