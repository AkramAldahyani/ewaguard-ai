import { useEffect, useState } from 'react';
import { Button, Field, Input } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { SensitiveInformationNotice } from '../disclaimer/SensitiveInformationNotice.jsx';
import { EmailUploadDialog } from './EmailUploadDialog.jsx';

export function PrivateAnalysisDialog({ type, onClose, onSubmit, onExplain }) {
  return type === 'EMAIL' ? <EmailUploadDialog onClose={onClose} onExplain={onExplain} /> : <PrivateUrlDialog onClose={onClose} onSubmit={onSubmit} />;
}

function PrivateUrlDialog({ onClose, onSubmit }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [url, setUrl] = useState(''); const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault(); if (!acknowledged) return;
    if (!url.trim() || url.length > 4096) { setError('Provide one public HTTP(S) URL, up to 4,096 characters.'); return; }
    onSubmit({ toolName: 'analyze_url', parameters: { url } });
    setUrl(''); onClose();
  }
  return <Modal open onClose={onClose} title="Private URL analysis" description="Input goes only to the EWAGuard backend. The AI receives an opaque reference. No analysis runs until you review and approve."><div className="space-y-4"><SensitiveInformationNotice context="URL_ANALYSIS" continuation="private analysis preparation" onAcknowledged={() => setAcknowledged(true)} />
    {acknowledged && <form onSubmit={submit} className="space-y-4"><Field id="private-url" label="URL to analyze" required hint="Public HTTP(S) URLs only. Queries, fragments and embedded credentials are not supported by this approval workflow.">{(props) => <Input {...props} type="text" inputMode="url" value={url} maxLength={4096} autoComplete="off" onChange={(e) => setUrl(e.target.value)} />}</Field>
      {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}<Button type="submit">Prepare approval request</Button><p className="text-xs leading-5 text-slate-500">Preparation may use an AI request. Confirmation is a separate step. Private input is cleared when this dialog closes.</p></form>}
    </div></Modal>;
}

export function ApprovalDialog({ review, busy, onClose, onDecide, onRefresh }) {
  const [checked, setChecked] = useState(false);
  const [elapsed, setElapsed] = useState(() => Date.parse(review.approval.expiresAt) <= Date.now());
  useEffect(() => { const timer = setInterval(() => setElapsed(Date.parse(review.approval.expiresAt) <= Date.now()), 1000); return () => clearInterval(timer); }, [review.approval.expiresAt]);
  return <Modal open onClose={onClose} title="Review analysis request" description="Only your explicit approval can start this operation." footer={<><Button variant="secondary" disabled={busy} onClick={() => onDecide('REJECT')}>Reject analysis</Button><Button disabled={busy || !checked || elapsed || review.approval.status !== 'PENDING'} onClick={() => onDecide('CONFIRM', checked)}>Approve analysis</Button></>}>
    <div className="space-y-4 text-sm leading-6"><p className="font-bold">Proposed operation: {review.approval.toolName === 'analyze_email' ? 'Analyze email' : 'Analyze URL'}</p><p className="text-slate-600">Your acknowledgement was required to prepare this request. The backend rechecks the original acknowledgement, your access and the five-minute expiry before execution.</p><p className="text-slate-600">Email analysis runs locally. URL analysis may perform public DNS, TLS and approved reputation checks. The AI receives only minimized findings.</p>
      {Object.entries(review.parameters ?? {}).map(([name, value]) => <div key={name}><h3 className="font-semibold capitalize">{name}</h3><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-xs [overflow-wrap:anywhere]">{value || '(not supplied)'}</pre></div>)}
      <p className="text-xs text-slate-500">Expires {new Date(review.approval.expiresAt).toLocaleString()} · Backend confirmation is authoritative.</p>
      {elapsed ? <div role="status"><p>This approval has reached its displayed expiration time. Check server status before preparing a new request.</p><Button variant="secondary" size="sm" disabled={busy} onClick={onRefresh}>Check server status</Button></div> : <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" className="mt-1 size-4 accent-brand-600" checked={checked} disabled={busy} onChange={(e) => setChecked(e.target.checked)} /><span>I reviewed this exact input and want the backend to perform this analysis. It contains no prohibited information.</span></label>}
    </div></Modal>;
}
