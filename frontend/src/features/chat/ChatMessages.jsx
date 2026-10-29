import { useEffect, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Check, Copy, Info, ShieldAlert } from 'lucide-react';
import { Badge, Button, RiskBadge } from '../../components/ui/index.jsx';
import { MessageContent } from './MessageContent.jsx';
import logo from '../../assets/branding/ewa-ai-logo.png';
import { AnalysisRiskPanel } from '../../components/analysis-risk-theme.jsx';

export function AssistantAvatar({ className = '' }) {
  return <span className={`assistant-avatar ${className}`} aria-hidden="true"><img src={logo} alt="" /></span>;
}

export function EmployeeMessage({ content, preview = true }) {
  return <article className="chat-message chat-message-user" aria-label={preview ? 'Your preview message' : 'Your message'}><div className="chat-user-content"><h3 className="chat-message-label">You {preview && <span>· Local preview</span>}</h3><div className="chat-user-bubble"><p>{content}</p></div></div></article>;
}

export function AIMessage({ content, children, preview = true }) {
  const [copyState, setCopyState] = useState('idle');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    clearTimeout(timer.current);
    try { await navigator.clipboard.writeText(content); setCopyState('copied'); }
    catch { setCopyState('error'); }
    timer.current = setTimeout(() => setCopyState('idle'), 2500);
  };
  return <article className="chat-message chat-message-assistant" aria-label="Assistant message"><AssistantAvatar /><div className="chat-ai-content"><div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="chat-message-label">EWAGuard AI</h3>{preview && <Badge>Preview response</Badge>}</div><div className="chat-ai-bubble">{content && <MessageContent content={content} />}{children && <div className="mt-4 space-y-4">{children}</div>}</div>{content && <div className="chat-message-actions"><button type="button" onClick={copy} aria-label="Copy AI response" className="chat-copy">{copyState === 'copied' ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}<span>{copyState === 'copied' ? 'Copied' : 'Copy'}</span></button><span role="status" className="text-xs text-slate-600">{copyState === 'error' ? 'Copy unavailable. Select the response text to copy it.' : copyState === 'copied' ? 'Response copied.' : ''}</span></div>}</div></article>;
}

export function SecurityNotice({ children }) {
  return <aside className="flex gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-900"><Info className="mt-1 size-4 shrink-0" aria-hidden="true" /><div className="min-w-0">{children}</div></aside>;
}

export function ToolRunningState({ label = 'Preparing preview response…', preview = true }) {
  return <div role="status" className="chat-loading"><span className="chat-typing" aria-hidden="true"><i /><i /><i /></span><span>{preview && <strong>UI preview: </strong>}{label}{preview && <span className="block text-xs leading-5 text-slate-500">No tool or AI service is running.</span>}</span></div>;
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
  const hasSeverity = severities.includes(severity);
  return <AnalysisRiskPanel as="section" risk={{ riskLevel: severity }} neutral={preview || !hasSeverity} className="rounded-xl border border-[var(--analysis-line)] bg-[var(--analysis-card)] p-5" aria-label="Structured security result"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-[var(--analysis-ink)]">{analysisType ?? 'Analysis result'}</h3>{preview && <Badge>Sample layout · Not a finding</Badge>}</div><div className="mt-4">{hasSeverity ? <RiskBadge level={severity} score={validScore ? riskScore : undefined} neutral={preview} /> : <Badge>Risk not assessed</Badge>}</div><div className="mt-5 space-y-5"><EvidenceList title="Indicators" items={indicators} /><EvidenceList title="Technical evidence" items={evidence} /><EvidenceList title="Recommended actions" items={recommendedActions} /></div><p className="mt-4 border-t border-[var(--analysis-line)] pt-4 text-xs leading-5 text-slate-600">{evidenceNote ?? 'Evidence completeness and confidence have not been provided.'}</p>{source && <p className="mt-2 break-words text-xs text-slate-500">Reference: {source}</p>}</AnalysisRiskPanel>;
}

export function CitationCard({ title, reference, excerpt, sourceType, preview = true }) {
  // Plain text only: future untrusted evidence cannot inject HTML or active links.
  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Source reference"><div className="flex items-start gap-3"><BookOpen className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" /><div className="min-w-0"><p className="text-xs font-semibold text-brand-700">{sourceType ?? 'Source type not supplied'}{preview ? ' · Layout preview' : ''}</p><h4 className="mt-1 break-words text-sm font-bold text-slate-900">{title ?? 'No source connected'}</h4><p className="mt-1 break-words text-xs text-slate-600">{reference ?? 'Section or page not supplied'}</p>{excerpt && <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-brand-200 pl-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{excerpt}</blockquote>}</div></div></section>;
}

export function IncidentEscalationBanner({ incidentId, severity, status, nextActions, preview = true }) {
  return <section className="rounded-xl border border-warning-200 bg-warning-50 p-5" aria-label="Incident escalation"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-800" aria-hidden="true" /><div className="min-w-0"><h3 className="font-bold text-warning-900">{preview ? 'Escalation layout preview — no incident created' : incidentId ? 'Security incident created' : 'Incident confirmation unavailable'}</h3><p className="mt-2 break-words text-sm text-warning-900">Reference: {incidentId ?? 'Not supplied'} · Status: {status ?? 'Not supplied'}</p>{severities.includes(severity) && <div className="mt-3"><RiskBadge level={severity} /></div>}<div className="mt-4"><EvidenceList title="Next actions" items={nextActions} /></div></div></div></section>;
}
