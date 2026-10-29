import { Badge, Card, RiskBadge } from './ui/index.jsx';
import {
  AnalysisRiskPanel,
  AnalysisSeverityIcon,
} from './analysis-risk-theme.jsx';
import { getAnalysisRiskLevel, getAnalysisSeverityTheme } from './analysis-risk-theme-config.js';

export function RiskResult({ risk, inconclusive = false }) {
  const level = getAnalysisRiskLevel(risk);
  if (!risk || !level) {
    return <AnalysisRiskPanel neutral><Card className="risk-summary min-w-0 p-5 sm:p-7">
      <div className="flex items-center gap-3"><span className="risk-summary-icon"><AnalysisSeverityIcon neutral className="h-6 w-6" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Deterministic risk assessment</p><h3 className="mt-1 text-lg font-semibold text-slate-950">Risk evaluation unavailable</h3></div></div>
      <p className="mt-3 text-sm leading-6 text-slate-600">Final risk evaluation is unavailable. Treat the item cautiously and retry the analysis.</p>
    </Card></AnalysisRiskPanel>;
  }

  const theme = getAnalysisSeverityTheme(risk, { neutral: inconclusive });
  const reasons = Array.isArray(risk.reasons) ? risk.reasons : [];
  const major = reasons.filter((reason) => Number(reason.contribution) > 0).slice(0, 4);
  const coverage = reasons.filter((reason) => ['INSUFFICIENT_EVIDENCE', 'CONFLICTING_SECURITY_EVIDENCE', 'REPUTATION_STALE', 'COVERAGE_LIMITED'].includes(reason.code));
  const recommendedActions = Array.isArray(risk.recommendedActions) ? risk.recommendedActions : [];
  const nextAction = recommendedActions[0] || null;
  const score = Number.isFinite(risk.score) ? risk.score : risk.riskScore;
  const hasScore = Number.isFinite(score);
  const confidence = typeof risk.confidence === 'string' ? risk.confidence.replaceAll('_', ' ') : null;

  return <AnalysisRiskPanel risk={risk} neutral={inconclusive}>
    <Card className="risk-summary min-w-0 overflow-hidden p-0" aria-label="EWAGuard Risk Level">
      <div className="risk-summary-header p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-start gap-4"><span className="risk-summary-icon shrink-0"><AnalysisSeverityIcon risk={risk} neutral={inconclusive} className="h-7 w-7" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-75">Deterministic risk assessment</p><h3 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{inconclusive ? 'Analysis incomplete' : theme.label}</h3><p className="mt-2 max-w-2xl text-sm leading-6 sm:text-base">{theme.summary}</p></div></div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end"><RiskBadge level={level} score={score} neutral={inconclusive} /><span className="text-sm font-semibold">{hasScore ? `Risk score: ${score}/100` : 'Risk score unavailable'}</span>{confidence ? <Badge tone="neutral">Confidence: {confidence}</Badge> : null}</div>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.42fr)]">
        <div className="min-w-0 space-y-5">
          {major.length ? <div><p className="analysis-section-title text-sm font-semibold">Key findings</p><ul className="mt-3 space-y-2">{major.map((reason) => <li key={reason.code} className="analysis-evidence-item rounded-xl border px-3 py-2.5 text-sm leading-5">{reason.description}</li>)}</ul></div> : <p className="text-sm leading-6 text-slate-600">No positive risk indicators were reported by the available checks.</p>}
          {coverage.length ? <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Coverage notes</p><div className="mt-2 space-y-1 text-sm text-slate-600">{coverage.map((reason) => <p key={reason.code}>{reason.description}</p>)}</div></div> : null}
        </div>
        <aside className="risk-next-action rounded-2xl border p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">Recommended next action</p><p className="mt-2 text-sm font-semibold leading-6">{nextAction || 'No recommended action was supplied by the analysis result.'}</p>{recommendedActions.length > 1 ? <ul className="mt-3 space-y-2 border-t pt-3 text-sm leading-5">{recommendedActions.slice(1).map((action) => <li key={action}>{action}</li>)}</ul> : null}</aside>
      </div>

      <div className="border-t border-slate-200/80 px-5 py-3 text-xs leading-5 text-slate-500 sm:px-7">The analyzer finding is one input into this broader deterministic risk evaluation. Risk and confidence are separate; low risk does not guarantee safety.{risk.version ? ` Risk model ${risk.version}.` : ''}</div>
    </Card>
  </AnalysisRiskPanel>;
}
