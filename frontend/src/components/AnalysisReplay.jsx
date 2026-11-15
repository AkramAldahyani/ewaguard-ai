import { Card, RiskBadge } from './ui/index.jsx';
import { IncidentReceipt } from './IncidentReceipt.jsx';

export function AnalysisReplay({ analysis }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-bold">Previously completed analysis</h3>
        <p className="mt-2 text-sm">
          Your earlier submission was recorded. This retry did not create another scan. Original submission details are
          not retained for replay.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <RiskBadge level={analysis.severity} />
          <span>Score: {analysis.riskScore ?? 'Unavailable'}</span>
        </div>
        <p className="mt-3 break-all text-xs text-slate-500">
          Analysis {analysis.analysisId} · {new Date(analysis.createdAt).toLocaleString()}
        </p>
      </Card>
      <IncidentReceipt
        incident={analysis.incident}
        analysisId={analysis.analysisId}
        analyzerType={analysis.analyzerType}
      />
    </div>
  );
}
