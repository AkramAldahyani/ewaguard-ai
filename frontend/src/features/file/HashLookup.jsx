import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import { Button, Card } from '../../components/ui/index.jsx';
import { RiskResult } from '../../components/RiskResult.jsx';
import { createHashFlow } from './hash-state.js';

const findings = {
  DETECTIONS_REPORTED: 'Suspicious or malicious detections reported',
  NO_KNOWN_DETECTION: 'No known detection in the available report',
  UNKNOWN: 'Unknown — no usable reputation result',
};
const statuses = {
  AVAILABLE: 'Report available', NO_REPORT: 'No report found', NOT_CONFIGURED: 'Reputation service is not configured',
  RATE_LIMITED: 'Provider rate limit reached; try again later', BUSY: 'Provider is busy; try again shortly',
  UNAUTHORIZED: 'Reputation service is unavailable', UNAVAILABLE: 'Reputation service is unavailable',
  TIMEOUT: 'Reputation lookup timed out', MALFORMED_RESPONSE: 'Provider returned an unusable report',
};
export function HashResult({ result }) {
  const report = result.threatIntelligence;
  return <div className="mt-5 space-y-4">
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="font-bold">{findings[result.finding] ?? findings.UNKNOWN}</h3>
      <p className="mt-2 break-all font-mono text-xs">{result.sha256}</p>
      {result.analysisId && <p className="mt-2 break-all text-xs text-slate-500">Recorded check: {result.analysisId}</p>}
      <p className="mt-3 text-sm text-slate-600">VirusTotal: {statuses[report.status] ?? 'Reputation result unavailable'}.</p>
      {report.status === 'AVAILABLE' && <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[['Malicious', report.maliciousCount], ['Suspicious', report.suspiciousCount], ['Harmless votes', report.harmlessCount], ['Undetected', report.undetectedCount]].map(([label, count]) =>
          <div key={label}><dt className="text-slate-600">{label}</dt><dd className="font-bold">{count}</dd></div>)}
      </dl>}
      {report.status === 'AVAILABLE' && <p className="mt-3 text-xs text-slate-500">Report date: {report.lastAnalysisDate ? new Date(report.lastAnalysisDate).toLocaleString() : 'Unknown'}</p>}
      <p className="mt-3 text-sm text-slate-600">This is a reputation lookup, not a file scan. No file contents, ClamAV or YARA checks were performed. Missing reports and zero detections do not establish safety. Reports may be outdated or incorrect.</p>
      <p className="mt-2 text-sm text-slate-600">This lookup does not create an incident automatically. Report suspicious findings through your approved IT/security channel.</p>
    </div>
    <RiskResult risk={result.risk} inconclusive={result.finding === 'UNKNOWN'} />
  </div>;
}
export function HashLookup({ onRiskChange }) {
  const [flow] = useState(createHashFlow);
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const feedback = useRef(null);
  const busy = state.status === 'submitting';
  useEffect(() => () => flow.dispose(), [flow]);
  useEffect(() => { if (state.error || state.result) feedback.current?.focus(); }, [state.error, state.result]);
  useEffect(() => {
    const completedRisk = state.result && state.result.finding !== 'UNKNOWN' ? state.result.risk : null;
    onRiskChange?.(completedRisk);
  }, [onRiskChange, state.result]);
  return <Card className="mb-6 p-5 sm:p-7">
    <h2 className="text-lg font-bold text-slate-950">Check a SHA-256 hash</h2>
    <p id="hash-help" className="mt-2 text-sm leading-6 text-slate-600">Already have a file fingerprint? Check its existing reputation without uploading the file. The hash is sent to VirusTotal and may identify the file. The check and risk result are recorded in security analysis statistics. Only submit hashes permitted by your organization.</p>
    <form className="mt-4" noValidate aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void flow.submit(); }}>
      <label htmlFor="file-sha256" className="block text-sm font-semibold">File SHA-256 hash</label>
      <input id="file-sha256" value={state.hash} onChange={(event) => flow.edit(event.target.value)} disabled={busy}
        required maxLength={128} autoComplete="off" autoCapitalize="none" spellCheck={false}
        aria-describedby={state.error ? 'hash-help hash-error' : 'hash-help'}
        aria-invalid={Boolean(state.error)} placeholder="Paste the 64-character SHA-256 hash"
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm focus-visible:outline-2 focus-visible:outline-brand-600" />
      <div className="mt-4 flex flex-wrap gap-3"><Button type="submit" disabled={busy || !state.hash.trim()}><Search className="size-4" aria-hidden="true" />{busy ? 'Checking reputation…' : 'Check Hash'}</Button><Button variant="secondary" onClick={flow.reset}>Clear Hash</Button></div>
    </form>
    <p className="mt-3 text-sm text-brand-700" role="status" aria-live="polite">{busy ? 'Looking up the existing hash report…' : state.result ? 'Hash lookup complete.' : ''}</p>
    {state.error && <p id="hash-error" ref={feedback} tabIndex={-1} role="alert" className="mt-3 rounded-xl bg-warning-50 p-4">{state.error}</p>}
    {state.result && <section ref={feedback} tabIndex={-1} aria-label="Hash reputation result"><HashResult result={state.result} /></section>}
  </Card>;
}
