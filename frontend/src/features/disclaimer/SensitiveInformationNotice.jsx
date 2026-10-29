import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, FileLock2, Info, KeyRound, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { DISCLAIMER_DEFINITION } from '../../../../shared/disclaimer.js';
import { Button } from '../../components/ui/index.jsx';
import { apiRequest } from '../../services/api.js';
import { canContinue } from './disclaimer-state.js';
import { hasSessionConsent, rememberSessionConsent } from './session-consent.js';

const consentName = 'sensitive-information';

const restrictedContent = [
  { icon: KeyRound, title: 'Passwords & Access Codes', description: 'Passwords, OTPs, API keys, and other credentials.' },
  { icon: LockKeyhole, title: 'Confidential Information', description: 'Restricted or internal EWA information.' },
  { icon: UserRound, title: 'Personal Information', description: 'Sensitive employee or customer data.' },
  { icon: FileLock2, title: 'Sensitive Attachments', description: 'Files or screenshots containing protected information.' },
];

export function SensitiveInformationNotice({ context, onAcknowledged = () => {}, continuation = 'the feature preview', compact = false }) {
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

  const compactActionLabel = context === 'URL_ANALYSIS' ? 'Continue to URL Analysis' : 'Continue to Email Analysis';

  if (compact) return <section className="mx-auto w-full overflow-hidden rounded-2xl border border-brand-200 bg-white p-6 shadow-xs sm:p-8 lg:w-4/5 lg:p-10" aria-labelledby={`disclaimer-${context}`} aria-busy={status === 'saving'}>
    <header className="flex items-start gap-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><ShieldCheck className="size-7" aria-hidden="true" /></span>
      <div><h2 id={`disclaimer-${context}`} className="text-xl font-bold leading-7 text-slate-950">Before You Continue</h2><p className="mt-2 text-sm leading-6 text-slate-600">Help protect EWA's information. Please make sure your submission does not contain sensitive or confidential data.</p></div>
    </header>
    <ul aria-label="Do not submit" className="my-8 grid gap-x-12 gap-y-6 sm:grid-cols-2">
      {restrictedContent.map(({ icon: Icon, title, description }) => <li key={title} className="flex items-start gap-3"><Icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" /><div><h3 className="text-sm font-semibold leading-5 text-slate-900">{title}</h3><p className="mt-1 text-sm leading-5 text-slate-600">{description}</p></div></li>)}
    </ul>
    <p className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 px-5 py-4 text-sm leading-6 text-warning-900"><Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><span><strong className="font-semibold">Contains sensitive information?</strong> Use EWA's approved cybersecurity reporting channel instead.</span></p>
    <div className="mt-6 border-t border-slate-100 pt-5">
      <label className="flex min-h-12 cursor-pointer items-start gap-4 rounded-xl px-4 py-3.5 transition-colors hover:bg-brand-50/60 focus-within:bg-brand-50/60 motion-reduce:transition-none"><input type="checkbox" checked={checked} disabled={status === 'saving'} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600" /><span className="text-sm font-medium leading-6 text-slate-800">I confirm that my submission does not contain sensitive or restricted information.</span></label>
      {error && <p className="mt-3 text-sm font-medium text-danger-700" role="alert">{error}</p>}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button onClick={acknowledge} disabled={!canContinue(checked, status)} className="w-full sm:w-auto">{status === 'saving' ? 'Recording acknowledgement…' : <>{compactActionLabel} <ArrowRight className="size-4" aria-hidden="true" /></>}</Button>
        <p className="text-xs text-slate-500">Disclaimer version {DISCLAIMER_DEFINITION.version}</p>
      </div>
    </div>
  </section>;

  return <section className="overflow-hidden rounded-2xl border border-warning-300 bg-white shadow-card" aria-labelledby={`disclaimer-${context}`}><div className="flex items-start gap-3 border-b border-warning-200 bg-warning-50 p-5 sm:p-6"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-100 text-warning-800"><AlertTriangle className="size-5" aria-hidden="true" /></span><div><p className="text-xs font-extrabold uppercase tracking-[0.15em] text-warning-800">Required before continuing</p><h2 id={`disclaimer-${context}`} className="mt-1 text-lg font-bold text-slate-950">{DISCLAIMER_DEFINITION.title}</h2><p className="mt-2 text-sm leading-6 text-slate-700">{DISCLAIMER_DEFINITION.summary}</p></div></div>
    <div className="p-5 sm:p-6"><ul className="grid gap-x-6 gap-y-2 text-sm leading-6 text-slate-600 sm:grid-cols-2">{DISCLAIMER_DEFINITION.prohibitedItems.map((item) => <li key={item} className="flex gap-2"><span className="font-bold text-warning-700" aria-hidden="true">•</span><span>{item}</span></li>)}</ul><p className="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm font-medium leading-6 text-warning-900">{DISCLAIMER_DEFINITION.restrictedGuidance}</p>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-brand-300"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand-600" /><span className="text-sm font-semibold leading-6 text-slate-800">{DISCLAIMER_DEFINITION.confirmation}</span></label>
      {error && <p className="mt-3 text-sm font-medium text-danger-700" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3"><Button onClick={acknowledge} disabled={!canContinue(checked, status)}>{status === 'saving' ? 'Recording acknowledgement…' : 'Acknowledge and continue'}</Button><p className="text-xs text-slate-500">Disclaimer version {DISCLAIMER_DEFINITION.version}</p></div>
    </div></section>;
}
