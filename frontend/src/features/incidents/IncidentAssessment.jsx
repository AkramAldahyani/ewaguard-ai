import { Badge, Card } from '../../components/ui/index.jsx';
import { IncidentAssistance } from '../../components/IncidentAssistance.jsx';
import { IncidentTime } from './IncidentComponents.jsx';
import { label } from './incident-flow.js';
import { confidenceLabel } from '../../lib/labels.js';

const unavailableText = {
  RISK_DETAIL_NOT_SAVED: 'Detailed risk information was not saved with this historical incident.',
  SOURCE_REFERENCE_NOT_SAVED: 'An authoritative source reference was not saved with this incident.',
  EVIDENCE_NOT_SAVED: 'A supported security evidence snapshot was not saved with this incident.',
  GUIDANCE_NOT_SAVED: 'Incident Assistance was not saved with this historical incident. It has not been regenerated. Contact IT/security through your approved channel.',
  GUIDANCE_UNSUPPORTED_OR_INCONSISTENT: 'The saved guidance could not be verified against its supported policy version. Contact IT/security for current instructions.',
  RISK_VERSION_UNSUPPORTED_OR_INCONSISTENT: 'The historical risk detail is unsupported or inconsistent with the incident record. The original score has not been recalculated.',
};
function Missing({ value, fallback }) {
  return <p className="text-sm leading-6 text-slate-600">{unavailableText[value?.reason] ?? fallback}</p>;
}
export function IncidentAssessment({ assessment, admin }) {
  const { risk, source, evidence, guidance } = assessment ?? {};
  const exposure = assessment?.reportedExposure;
  return <>
    {exposure?.type === 'CREDENTIALS_SUBMITTED' && <div role="status" className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm leading-6 text-danger-900"><p className="font-bold">Credential exposure reported by the employee</p><p className="mt-1">The employee confirmed entering work credentials{exposure.reportedAt ? <> on <IncidentTime value={exposure.reportedAt} /></> : ''}. The risk engine raised this incident to critical. The original analyzer risk is kept in the evidence record.</p></div>}
    <Card className="space-y-5 p-5 sm:p-6"><h2 className="text-lg font-bold">Risk explanations & source</h2>
      {risk?.status === 'AVAILABLE' ? <><Badge tone={risk.confidence === 'LIMITED_CONFIDENCE' ? 'warning' : 'neutral'}>Confidence: {confidenceLabel(risk.confidence)}</Badge>
        {risk.reasons.length ? <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{risk.reasons.map((reason) => <li key={reason.code}>{reason.explanation}</li>)}</ul> : <p className="text-sm text-slate-500">No supported risk reasons are available.</p>}
        {risk.reasonsStatus !== 'AVAILABLE' && <p className="text-sm text-warning-800">Some saved reasons are unavailable or unsupported; the explanation may be incomplete.</p>}</> : <Missing value={risk} fallback="Detailed risk information is unavailable." />}
      <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Risk policy version</dt><dd className="font-semibold">{assessment?.riskPolicyVersion ?? 'Unavailable'}</dd></div><div><dt className="text-slate-500">Escalation policy version</dt><dd className="font-semibold">{assessment?.escalationPolicyVersion ?? 'Unavailable'}</dd></div></dl>
      {source?.status === 'AVAILABLE' ? <div className="rounded-xl bg-slate-50 p-4 text-sm"><p className="font-semibold">{source.analyzerType} analysis reference</p><p className="mt-1 break-all font-mono text-xs">{source.analysisId}</p><p className="mt-2 text-slate-600">Analyzed <IncidentTime value={source.analyzedAt} /></p><p className="mt-2 text-xs leading-5 text-slate-500">Preserved at incident creation. The original analysis may have expired or been removed; opening this view does not run it again.</p></div> : <Missing value={source} fallback="Source reference unavailable." />}
    </Card>
    <Card className="space-y-5 p-5 sm:p-6"><h2 className="text-lg font-bold">Sanitized security evidence</h2>
      {evidence?.status === 'AVAILABLE' ? <>
        {evidence.indicators.length > 0 && <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{evidence.indicators.map((item) => <li key={item.code}>{item.explanation}</li>)}</ul>}
        <dl className="grid gap-4 text-sm sm:grid-cols-2">{Object.entries(evidence.scannerStatuses).map(([name, status]) => <div key={name}><dt className="font-semibold">{name === 'clamav' ? 'ClamAV' : 'YARA'}</dt><dd className="mt-1 text-slate-600">{label(status)}</dd></div>)}{evidence.providerStatuses.map((provider, index) => <div key={index}><dt className="font-semibold">VirusTotal report {index + 1}</dt><dd className="mt-1 text-slate-600">{label(provider.status)}</dd></div>)}</dl>
        {evidence.authentication && <div className="text-sm"><h3 className="font-bold">Email authentication claims</h3><p className="mt-1 text-xs text-slate-500">Supplied header claims were not independently verified.</p><ul className="mt-3 space-y-2">{Object.entries(evidence.authentication).map(([key, value]) => <li key={key}>{key.toUpperCase()}: {label(value.status)}{value.claimedResults.length ? ` · ${value.claimedResults.join(', ')}` : ''}</li>)}</ul></div>}
        <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6"><h3 className="font-bold">Check coverage</h3>{evidence.coverage.status === 'AVAILABLE' ? <><p>Available: {evidence.coverage.availableSources.map(label).join(', ') || 'None recorded'}</p><p>Unavailable: {evidence.coverage.unavailableSources.map(label).join(', ') || 'None recorded'}</p>{evidence.coverage.conflicting && <p className="mt-2 font-semibold text-warning-800">Security sources reported conflicting evidence.</p>}</> : <p>Check coverage was not saved.</p>}</div>
        {admin && evidence.file && <dl className="space-y-3 text-sm"><div><dt className="font-semibold">SHA-256</dt><dd className="mt-1 break-all font-mono text-xs">{evidence.file.sha256 ?? 'Unavailable'}</dd></div><div><dt>Size / detected type</dt><dd>{evidence.file.sizeBytes ?? 'Unavailable'} bytes · {evidence.file.normalizedType}</dd></div></dl>}
        {admin && evidence.reputation?.map((item, index) => <p className="text-sm" key={index}>Saved reputation report {index + 1}: {item.available ? `malicious ${item.maliciousCount ?? 'unavailable'}, suspicious ${item.suspiciousCount ?? 'unavailable'}, harmless ${item.harmlessCount ?? 'unavailable'}, undetected ${item.undetectedCount ?? 'unavailable'}` : 'Unavailable'}</p>)}
        <p className="text-xs leading-5 text-slate-500">These are saved findings, not a new scan. No known detection does not guarantee safety. Raw submissions and internal investigation content are excluded.</p>
      </> : <Missing value={evidence} fallback="Security evidence is unavailable." />}
    </Card>
    {guidance?.status === 'AVAILABLE' ? <div className="space-y-3"><p className="text-sm text-slate-500">Saved Incident Assistance from the original assessment. Follow the security team’s current updates for subsequent instructions.</p><IncidentAssistance assistance={guidance.assistance} /></div> : <Card className="space-y-3 p-5 sm:p-6"><h2 className="text-lg font-bold">Recommended actions</h2><Missing value={guidance} fallback="Saved Incident Assistance is unavailable. Contact IT/security through your approved reporting channel." /></Card>}
  </>;
}
