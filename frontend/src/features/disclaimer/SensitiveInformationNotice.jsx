import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { DISCLAIMER_DEFINITION } from '../../../../shared/disclaimer.js';
import { Button } from '../../components/ui/index.jsx';
import { apiRequest } from '../../services/api.js';
import { canContinue } from './disclaimer-state.js';
import { hasSessionConsent, rememberSessionConsent } from './session-consent.js';

const consentName = 'sensitive-information';

export function SensitiveInformationNotice({ context, onAcknowledged = () => {}, continuation = 'the feature preview' }) {
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState(() => hasSessionConsent(consentName, DISCLAIMER_DEFINITION.version) ? 'restoring' : 'idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (status !== 'restoring') return undefined;
    let active = true;
    // Reuse the session's explicit consent while obtaining the context-specific
    // backend acknowledgement required by analyzer and approval validation.
    apiRequest('/api/disclaimers/acknowledge', { method: 'POST', body: JSON.stringify({ context }) })
      .then((payload) => { if (active) { setStatus('complete'); onAcknowledged(payload.acknowledgement); } })
      .catch((failure) => { if (active) { setStatus('restore-error'); setError(failure.message || 'Could not restore your acknowledgement.'); } });
    return () => { active = false; };
  }, [context, onAcknowledged, status]);

  const acknowledge = async () => {
    if (!canContinue(checked, status)) return;
    setStatus('saving');
    setError('');
    try {
      const payload = await apiRequest('/api/disclaimers/acknowledge', {
        method: 'POST', body: JSON.stringify({ context }),
      });
      rememberSessionConsent(consentName, DISCLAIMER_DEFINITION.version);
      setStatus('complete');
      onAcknowledged(payload.acknowledgement);
    } catch (requestError) {
      setStatus('idle');
      setError(requestError.message || 'The acknowledgement could not be recorded. Please try again.');
    }
  };

  if (status === 'restoring') return <p role="status" className="text-sm text-slate-500">Restoring your session acknowledgement…</p>;
  if (status === 'restore-error') return <div role="alert"><p>{error}</p><Button onClick={() => setStatus('restoring')}>Retry</Button></div>;

  if (status === 'complete') return <section className="rounded-2xl border border-success-200 bg-success-50 p-5" aria-live="polite"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-700" aria-hidden="true" /><div><h2 className="font-bold text-success-900">Acknowledgement recorded</h2><p className="mt-1 text-sm leading-6 text-success-800">You may continue to {continuation}. No submitted content was stored with this acknowledgement.</p></div></div></section>;

  return <section className="overflow-hidden rounded-2xl border border-warning-300 bg-white shadow-card" aria-labelledby={`disclaimer-${context}`}><div className="flex items-start gap-3 border-b border-warning-200 bg-warning-50 p-5 sm:p-6"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-100 text-warning-800"><AlertTriangle className="size-5" aria-hidden="true" /></span><div><p className="text-xs font-extrabold uppercase tracking-[0.15em] text-warning-800">Required before continuing</p><h2 id={`disclaimer-${context}`} className="mt-1 text-lg font-bold text-slate-950">{DISCLAIMER_DEFINITION.title}</h2><p className="mt-2 text-sm leading-6 text-slate-700">{DISCLAIMER_DEFINITION.summary}</p></div></div>
    <div className="p-5 sm:p-6"><ul className="grid gap-x-6 gap-y-2 text-sm leading-6 text-slate-600 sm:grid-cols-2">{DISCLAIMER_DEFINITION.prohibitedItems.map((item) => <li key={item} className="flex gap-2"><span className="font-bold text-warning-700" aria-hidden="true">•</span><span>{item}</span></li>)}</ul><p className="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm font-medium leading-6 text-warning-900">{DISCLAIMER_DEFINITION.restrictedGuidance}</p>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-brand-300"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand-600" /><span className="text-sm font-semibold leading-6 text-slate-800">{DISCLAIMER_DEFINITION.confirmation}</span></label>
      {error && <p className="mt-3 text-sm font-medium text-danger-700" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3"><Button onClick={acknowledge} disabled={!canContinue(checked, status)}>{status === 'saving' ? 'Recording acknowledgement…' : 'Acknowledge and continue'}</Button><p className="text-xs text-slate-500">Disclaimer version {DISCLAIMER_DEFINITION.version}</p></div>
    </div></section>;
}
