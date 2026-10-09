import { Badge, Button, RiskBadge } from '../../components/ui/index.jsx';
import { IncidentAssistance } from '../../components/IncidentAssistance.jsx';

export function ChatEvidence({ result }) {
  const data = result?.data; const risk = data?.risk;
  if (!risk || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(risk.riskLevel) || !Number.isInteger(risk.score) || risk.score < 0 || risk.score > 100) return <p className="text-sm text-slate-600">A verified risk result is unavailable.</p>;
  return <section aria-label="Verified analysis result" className="min-w-0 space-y-4 rounded-xl border border-brand-200 bg-white p-4 [overflow-wrap:anywhere] sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-700">Verified backend evidence</p><h3 className="mt-1 font-bold text-slate-900">{data.analyzerType} analysis</h3></div><RiskBadge level={risk.riskLevel} score={risk.score} /></div>
    <p className="text-xs text-slate-500">Analysis ID: {data.analysisId}</p><div className="flex flex-wrap items-center gap-2"><Badge>{risk.confidence?.replaceAll('_', ' ') ?? 'Confidence unavailable'}</Badge><span className="text-xs text-slate-500">Central risk model {risk.version}</span></div>
    <p className="text-sm leading-6 text-slate-600">This is the stored EWAGuard risk evaluation, separate from AI advice and individual analyzer findings. Low risk does not guarantee safety.</p>
    <div><h4 className="text-sm font-bold">Risk reasons</h4><ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">{(data.reasons ?? []).map((reason) => <li key={reason.code}>{reason.description}<span className="block text-xs text-slate-500">{reason.code}</span></li>)}</ul></div>
    {data.indicatorCodes?.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold text-brand-700">Analyzer indicators ({data.indicatorCodes.length})</summary><ul className="mt-2 space-y-1 text-xs text-slate-600">{data.indicatorCodes.map((code) => <li key={code}>{code}</li>)}</ul></details>}
    <div><h4 className="text-sm font-bold">Available check coverage</h4><ul className="mt-2 space-y-1 text-sm text-slate-600">{Object.entries(data.scannerStatuses ?? {}).map(([name, status]) => <li key={name}>{name.toUpperCase()}: {status.replaceAll('_', ' ')}</li>)}{data.providerStatuses?.map((provider, i) => <li key={i}>{provider.provider}: {provider.status.replaceAll('_', ' ')}</li>)}</ul>{!Object.keys(data.scannerStatuses ?? {}).length && !data.providerStatuses?.length && <p className="mt-1 text-sm text-slate-600">No scanner or provider status is included in this projection.</p>}</div>
    {data.assistance && <details><summary className="cursor-pointer rounded-lg bg-brand-50 px-3 py-2 text-sm font-bold text-brand-800">Incident assistance · What should I do now?</summary><div className="mt-3"><IncidentAssistance assistance={data.assistance} /></div></details>}
  </section>;
}
const approvalLabels = { PENDING: 'Waiting for employee approval', COMPLETED: 'Analysis complete', REJECTED: 'Analysis cancelled', EXPIRED: 'Approval expired', EXECUTING: 'Analysis execution recorded — retrieve status', FAILED: 'Analysis did not complete' };
export function ChatReceipt({ request, busy, acknowledged, onRecover, onReview, onExplain }) {
  const approval = request.approval; const approvalId = approval?.id ?? request.toolMetadata?.approvalId; const hasResults = request.verifiedResults?.length > 0;
  if (!approvalId && !request.toolMetadata?.results?.length && !hasResults && request.status === 'COMPLETED') return null;
  return <section aria-label="Tool request" className="my-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">{approval ? approvalLabels[approval.status] ?? 'Saved analysis request' : approvalId ? 'Saved analysis approval' : 'Request findings and recovery'}</h3><Badge>{approval?.toolName === 'analyze_email' ? 'Email' : approval?.toolName === 'analyze_url' ? 'URL' : 'Backend record'}</Badge></div>
    {approval?.status === 'PENDING' && <p className="text-sm leading-6 text-slate-600">Review the exact private input before approving. Expires {new Date(approval.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. The server verifies expiration before execution.</p>}
    {['REJECTED', 'EXPIRED'].includes(approval?.status) && <p className="text-sm text-slate-600">This request cannot run. Use Private analysis to deliberately prepare a new operation.</p>}
    {request.resultUnavailable && <p className="text-sm text-slate-600">The completed result is no longer available. This approval remains consumed.</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={onRecover}>Retrieve saved status</Button>{approvalId && (!approval || approval.status === 'PENDING') && <Button size="sm" disabled={busy} onClick={() => onReview(approvalId)}>Review private request</Button>}{approval?.status === 'COMPLETED' && hasResults && <Button size="sm" variant="subtle" disabled={busy || !acknowledged || Boolean(request.explanation)} onClick={() => onExplain(approval.id)}>Explain with AI</Button>}</div>
    {request.explanation?.status === 'UNAVAILABLE' && <p role="status" className="text-sm text-slate-600">AI explanation unavailable. The completed analysis and deterministic guidance remain available below. No new scan was performed.</p>}
    {request.verifiedResults?.map((result) => <ChatEvidence key={result.key} result={result} />)}
  </section>;
}
