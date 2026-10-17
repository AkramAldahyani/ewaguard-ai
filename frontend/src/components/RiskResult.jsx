import { Badge, Card, RiskBadge } from './ui/index.jsx';

export function RiskResult({ risk }) {
  if (!risk) return <Card className="p-5 text-sm text-slate-600">Final risk evaluation is unavailable for this result. Review the analyzer evidence and limitations.</Card>;
  const major = risk.reasons.filter((reason) => reason.contribution > 0).slice(0, 4);
  const coverage = risk.reasons.filter((reason) => ['INSUFFICIENT_EVIDENCE', 'CONFLICTING_SECURITY_EVIDENCE', 'REPUTATION_STALE', 'COVERAGE_LIMITED'].includes(reason.code));
  return <Card className="min-w-0 p-5 sm:p-7" aria-label="EWAGuard Risk Level">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold text-slate-950">EWAGuard Risk Level</h3><RiskBadge level={risk.riskLevel} /></div>
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><span className="font-semibold text-slate-800">Risk score: {risk.score}/100</span><span className="inline-flex items-center gap-2"><span className="text-slate-600">Confidence:</span><Badge>{risk.confidence.replaceAll('_', ' ')}</Badge></span></div>
    <p className="mt-3 text-slate-600">The analyzer finding is one input into this broader deterministic risk evaluation. Risk and confidence are separate; low risk does not guarantee safety.</p>
    {major.length > 0 && <div className="mt-5"><h4 className="font-bold text-slate-950">Key findings</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{major.map((reason) => <li key={reason.code}>{reason.description}</li>)}</ul></div>}
    {coverage.length > 0 && <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-slate-700">{coverage.map((reason) => <p key={reason.code}>{reason.description}</p>)}</div>}
    <h4 className="mt-5 font-bold text-slate-950">Risk-based recommended actions</h4>
    <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">{risk.recommendedActions.map((action) => <li key={action}>{action}</li>)}</ul>
    <p className="mt-4 text-xs text-slate-500">Risk model {risk.version}</p>
  </Card>;
}
