import { IncidentAssistance } from '../../components/IncidentAssistance.jsx';
import { AnalysisReplay } from '../../components/AnalysisReplay.jsx';
import { IncidentReceipt } from '../../components/IncidentReceipt.jsx';
import { ExposureReport } from '../../components/ExposureReport.jsx';
import { RiskResult } from '../../components/RiskResult.jsx';
import { Badge, Card } from '../../components/ui/index.jsx';
const readable = (value) => String(value ?? 'Unavailable').replaceAll('_', ' ');
const labels = { NO_STRONG_INDICATORS: ['No Strong Indicators', 'neutral'], SUSPICIOUS: ['Suspicious', 'warning'], HIGHLY_SUSPICIOUS: ['Highly Suspicious', 'danger'] };
function Section({ title, children }) {
  return <Card className="min-w-0 p-5 sm:p-6"><h3 className="mb-4 text-base font-bold text-slate-950">{title}</h3>{children}</Card>;
}
function Metadata({ values }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{values.map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium [overflow-wrap:anywhere]">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value ?? 'Unavailable'}</dd></div>)}</dl>;
}
export function UrlResults({ analysis }) {
  if (analysis.replayed) return <AnalysisReplay analysis={analysis} />;
  const r = analysis.result;
  const n = r.normalizedUrl;
  const [label, tone] = labels[r.provisionalClassification] ?? ['Unavailable', 'neutral'];
  return <div className="space-y-5 text-sm leading-6">
    <RiskResult risk={analysis.result.risk} />
    <IncidentReceipt incident={analysis.incident} analysisId={analysis.analysisId} analyzerType="URL" />
    <ExposureReport analysisId={analysis.analysisId} analyzerType="URL" />
    <IncidentAssistance assistance={analysis.result.assistance} />
    <Section title="Analysis Summary: Analyzer Finding"><Badge tone={tone}>{label}</Badge><p className="mt-3">Local analysis completed. Review provider availability and all evidence below. No strong indicators does not guarantee safety.</p><p className="mt-3 text-slate-600">This is a provisional URL-analyzer finding. The EWAGuard Risk Level above evaluates the structured evidence using the central risk model.</p><p className="mt-3 break-all text-xs text-slate-500">Analysis {analysis.analysisId} · {new Date(analysis.createdAt).toLocaleString()}</p></Section>
    <Section title="URL Structure"><p className="mb-4 break-all rounded-xl bg-slate-50 p-4 font-mono">{n.redactedUrl}</p><Metadata values={[
      ['Protocol', n.protocol.toUpperCase()], ['Hostname', n.hostname], ['Approximate domain', n.domainApproximation], ['Port', n.port],
      ['Path segments', n.pathSegments], ['Query parameters', n.queryCount], ['Recognized parameter names', n.queryParameterNames.join(', ') || 'None'],
      ['Internationalized hostname', n.punycode], ['Mixed scripts detected', n.mixedScript], ['IP hostname', n.isIpHost],
    ]} /><p className="mt-4 text-slate-500">The URL is displayed as text. Path content, query values, and fragments are omitted.</p></Section>
    <Section title="Local Indicators">{r.localIndicators.length ? <ul className="grid gap-3 sm:grid-cols-2">{r.localIndicators.map((item) => <li key={item.id} className="rounded-xl border border-slate-200 p-4">{item.title}<p className="mt-2 text-xs text-slate-500">Observed by a local heuristic; not proof of malicious activity.</p></li>)}</ul> : <p>No structural indicators were detected by the available checks.</p>}</Section>
    <div className="grid gap-5 lg:grid-cols-2"><Section title="DNS Evidence"><Metadata values={[
      ['Status', readable(r.dnsEvidence.status)], ['Resolved IP count', r.dnsEvidence.resolvedIpCount], ['Public addresses only', r.dnsEvidence.publicAddressesOnly],
    ]} /><p className="mt-4 text-slate-500">Resolved addresses are not displayed or stored.</p></Section>
      <Section title="TLS Certificate Evidence"><Metadata values={[
        ['Status', readable(r.tlsEvidence.status)], ['Certificate present', r.tlsEvidence.certificatePresent], ['Valid from', r.tlsEvidence.validFrom], ['Valid to', r.tlsEvidence.validTo],
        ['Expired', r.tlsEvidence.expired], ['Not yet valid', r.tlsEvidence.notYetValid], ['Hostname matches', r.tlsEvidence.hostnameMatch], ['Trusted chain', r.tlsEvidence.chainAuthorized],
      ]} /><p className="mt-4 text-slate-500">A valid certificate does not establish website trustworthiness. No page content is fetched.</p></Section></div>
    <Section title="VirusTotal Reputation"><p className="mb-4 text-slate-600">Existing reputation reports only. Provider unavailability does not invalidate completed local checks. Reports can be stale or incorrect.</p><div className="grid gap-4 md:grid-cols-2">{r.threatIntelligence.map((provider) => <div key={provider.scope} className="rounded-xl border border-slate-200 p-4"><h4 className="mb-3 font-bold">{readable(provider.scope)} report</h4><Metadata values={[
      ['Provider status', readable(provider.status)], ...(provider.status === 'AVAILABLE' ? [
        ['Malicious detections', provider.maliciousCount], ['Suspicious detections', provider.suspiciousCount], ['Harmless detections', provider.harmlessCount],
        ['Undetected', provider.undetectedCount], ['Reputation', provider.reputation], ['Last analysis date', provider.lastAnalysisDate], ['Cached report', Boolean(provider.cached)],
      ] : []),
    ]} />{provider.status === 'SKIPPED_PRIVACY' && <p className="mt-3">The exact URL was withheld because it contains a path, query, fragment, or IP address. Domain evidence applies only to the domain.</p>}</div>)}</div></Section>
    <Section title="Recommended Actions"><ul className="list-disc space-y-2 pl-5">{r.recommendations.map((text) => <li key={text}>{text}</li>)}</ul></Section>
    <Section title="Limitations"><ul className="list-disc space-y-2 pl-5">{r.limitations.map((text) => <li key={text}>{text}</li>)}</ul></Section>
  </div>;
}
