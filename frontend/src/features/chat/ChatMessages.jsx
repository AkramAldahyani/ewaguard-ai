import { AlertCircle, BookOpen, Info, LoaderCircle, ShieldAlert, Sparkles, UserRound } from 'lucide-react';
import { Badge, Button, RiskBadge } from '../../components/ui/index.jsx';

export function EmployeeMessage({ content }) {
  return <article className="flex min-w-0 gap-3 py-5 sm:gap-4" aria-label="Your preview message"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><UserRound className="size-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-800">You <span className="ml-2 font-normal text-slate-500">Local preview</span></h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">{content}</p></div></article>;
}

export function AIMessage({ content, children, preview = true }) {
  return <article className="flex min-w-0 gap-3 py-5 sm:gap-4" aria-label="Assistant message"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Sparkles className="size-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-slate-900">EWAGuard AI</h3>{preview && <Badge>Preview response</Badge>}</div>{content && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">{content}</p>}{children && <div className="mt-4 space-y-4">{children}</div>}</div></article>;
}

export function SecurityNotice({ children }) {
  return <aside className="flex gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-900"><Info className="mt-1 size-4 shrink-0" aria-hidden="true" /><div className="min-w-0">{children}</div></aside>;
}

export function ToolRunningState({ label = 'Preparing preview response…', preview = true }) {
  return <div role="status" className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /><span>{preview && <strong>UI preview: </strong>}{label}{preview && <span className="block text-xs leading-5 text-slate-500">No tool or AI service is running.</span>}</span></div>;
}

export function ChatError({ onRetry, onDismiss, busy = false, preview = true }) {
  return <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-4"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 size-5 shrink-0 text-danger-700" aria-hidden="true" /><div><h3 className="text-sm font-bold text-danger-800">{preview ? 'Simulated response error' : 'Unable to complete the response'}</h3><p className="mt-1 text-sm leading-6 text-danger-800">{preview ? 'This is a UI demonstration. No request failed or left your browser. Retry shows the local preview response.' : 'Please try again. No security conclusion is available from this response.'}</p></div></div><div className="mt-3 flex flex-wrap gap-2">{onRetry && <Button variant="secondary" size="sm" onClick={onRetry} disabled={busy}>Retry{preview ? ' preview' : ''}</Button>}{onDismiss && <Button variant="ghost" size="sm" onClick={onDismiss} disabled={busy}>Dismiss</Button>}</div></div>;
}

const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
function EvidenceList({ title, items = [] }) {
  return <div><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>{items.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">{items.map((item, index) => <li key={index} className="[overflow-wrap:anywhere]">{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Not supplied</p>}</div>;
}

export function AnalysisResultBlock({ analysisType, riskScore, severity, indicators, evidence, recommendedActions, evidenceNote, source, preview = true }) {
  const validScore = Number.isFinite(riskScore) && riskScore >= 0 && riskScore <= 100;
  return <section className="rounded-xl border border-slate-200 bg-white p-5" aria-label="Structured security result"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-slate-900">{analysisType ?? 'Analysis result'}</h3>{preview && <Badge>Sample layout · Not a finding</Badge>}</div><div className="mt-4">{severities.includes(severity) ? <RiskBadge level={severity} score={validScore ? riskScore : undefined} /> : <Badge>Risk not assessed</Badge>}</div><div className="mt-5 space-y-5"><EvidenceList title="Indicators" items={indicators} /><EvidenceList title="Technical evidence" items={evidence} /><EvidenceList title="Recommended actions" items={recommendedActions} /></div><p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-600">{evidenceNote ?? 'Evidence completeness and confidence have not been provided.'}</p>{source && <p className="mt-2 break-words text-xs text-slate-500">Reference: {source}</p>}</section>;
}

export function CitationCard({ title, reference, excerpt, sourceType, preview = true }) {
  // Plain text only: future untrusted evidence cannot inject HTML or active links.
  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Source reference"><div className="flex items-start gap-3"><BookOpen className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" /><div className="min-w-0"><p className="text-xs font-semibold text-brand-700">{sourceType ?? 'Source type not supplied'}{preview ? ' · Layout preview' : ''}</p><h4 className="mt-1 break-words text-sm font-bold text-slate-900">{title ?? 'No source connected'}</h4><p className="mt-1 break-words text-xs text-slate-600">{reference ?? 'Section or page not supplied'}</p>{excerpt && <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-brand-200 pl-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{excerpt}</blockquote>}</div></div></section>;
}

export function IncidentEscalationBanner({ incidentId, severity, status, nextActions, preview = true }) {
  return <section className="rounded-xl border border-warning-200 bg-warning-50 p-5" aria-label="Incident escalation"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-800" aria-hidden="true" /><div className="min-w-0"><h3 className="font-bold text-warning-900">{preview ? 'Escalation layout preview — no incident created' : incidentId ? 'Security incident created' : 'Incident confirmation unavailable'}</h3><p className="mt-2 break-words text-sm text-warning-900">Reference: {incidentId ?? 'Not supplied'} · Status: {status ?? 'Not supplied'}</p>{severities.includes(severity) && <div className="mt-3"><RiskBadge level={severity} /></div>}<div className="mt-4"><EvidenceList title="Next actions" items={nextActions} /></div></div></div></section>;
}
