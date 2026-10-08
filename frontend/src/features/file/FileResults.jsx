import { IncidentAssistance } from '../../components/IncidentAssistance.jsx';
import { RiskResult } from '../../components/RiskResult.jsx';
import { Badge, Card } from '../../components/ui/index.jsx';
import { FILE_PRIVACY_NOTICE } from '../../../../shared/file-policy.js';
const labels = { NO_STRONG_INDICATORS: ['No Strong Indicators', 'neutral'], SUSPICIOUS: ['Suspicious', 'warning'], HIGHLY_SUSPICIOUS: ['Highly Suspicious', 'danger'] };
const readable = (value) => String(value ?? 'Unavailable').replaceAll('_', ' ');
function Section({ title, children }) {
  return <Card className="min-w-0 p-5 sm:p-6"><h3 className="mb-4 text-base font-bold text-slate-950">{title}</h3>{children}</Card>;
}
function Metadata({ values }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{values.map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium [overflow-wrap:anywhere]">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value ?? 'Unavailable'}</dd></div>)}</dl>;
}
export function FileResults({ analysis }) {
  const r = analysis.result; const [label, tone] = labels[r.provisionalClassification] ?? ['Unavailable', 'neutral'];
  const p = r.threatIntelligence;
  return <div className="space-y-5 text-sm leading-6">
    <RiskResult risk={analysis.result.risk} />
    <IncidentAssistance assistance={analysis.result.assistance} />
    <Section title="Analysis Summary: Analyzer Finding"><Badge tone={tone}>{label}</Badge><p className="mt-3">{r.provisionalClassification === 'NO_STRONG_INDICATORS' ? 'No strong malicious indicators were detected by the available checks. This does not guarantee safety.' : 'Security indicators were detected. Do not open or execute this file; review the evidence with IT/security.'}</p>
      <p className="mt-3 font-semibold">{r.coverage === 'PARTIAL_EVIDENCE' ? 'Partial evidence: one or more local scans did not complete. Review scanner availability below.' : 'Local scanner checks completed. Review hash reputation availability separately.'}</p>
      <p className="mt-3 text-slate-600">This is a provisional analyzer finding. The EWAGuard Risk Level above evaluates the structured evidence using the central risk model.</p><p className="mt-3 break-all text-xs text-slate-500">Analysis {analysis.analysisId} · {new Date(analysis.createdAt).toLocaleString()}</p></Section>
    <Section title="File Information"><Metadata values={[
      ['Display name (original omitted)', r.file.displayName], ['Extension', r.file.extension.toUpperCase()], ['Size', `${r.file.size.toLocaleString()} bytes`],
      ['Detected type', r.file.detectedType], ['Detected MIME', r.file.mimeType], ['SHA-256', r.file.sha256],
    ]} /></Section>
    <Section title="File Validation"><Metadata values={[
      ['Extension/content mismatch', r.validation.extensionMismatch], ['Supplied MIME mismatch', r.validation.mimeMismatch], ['Double extension', r.validation.doubleExtension],
      ['Filename warning', r.validation.suspiciousFilename], ['Script extension', r.validation.scriptExtension],
      ...(r.validation.archive ? [['Archive inspection', readable(r.validation.archive.status)], ['Archive entries inspected', r.validation.archive.entryCount],
        ['Encrypted entries', r.validation.archive.encrypted], ['Unsafe archive paths', r.validation.archive.unsafePaths], ['Executable entries', r.validation.archive.executableEntries],
        ['Nested archive entries', r.validation.archive.nestedArchive], ['Macro-related entries', r.validation.archive.macroEntry]] : []),
    ]} /><p className="mt-4 text-slate-500">Type recognition is based on signatures and bounded metadata, not full document validation. No file was executed or previewed.</p></Section>
    <div className="grid gap-5 lg:grid-cols-2"><Section title="ClamAV Result"><Badge tone={r.clamav.status === 'DETECTED' ? 'danger' : 'neutral'}>{r.clamav.status}</Badge>
      {!['CLEAN', 'DETECTED'].includes(r.clamav.status) && <p className="mt-3">Local antivirus scanning was unavailable or incomplete for this analysis.</p>}
      {r.clamav.status === 'CLEAN' && <p className="mt-3">No known detection from this ClamAV scan. This does not establish safety.</p>}
      {r.clamav.reason && <p className="mt-3">Coverage: {readable(r.clamav.reason)}</p>}
      {r.clamav.coverageLimited && <p className="mt-3">Some contents could not be scanned within limits.</p>}
      {r.clamav.detections.map((name) => <p key={name} className="mt-3 break-all font-semibold">Detection: {name}</p>)}</Section>
      <Section title="YARA Result"><Badge tone={r.yara.status === 'MATCH' ? 'warning' : 'neutral'}>{readable(r.yara.status)}</Badge>
        {r.yara.status === 'NO_MATCH' && <p className="mt-3">No configured rules matched the inspected raw bytes.</p>}
        {!['NO_MATCH', 'MATCH'].includes(r.yara.status) && <p className="mt-3">YARA scanning was unavailable or incomplete. No rule conclusion is available.</p>}
        {r.yara.matches.map((match) => <div key={match.name} className="mt-4 rounded-xl bg-slate-50 p-3"><p className="break-all font-semibold">{match.name}</p><p>{match.description}</p><p className="text-xs text-slate-500">Evidence strength: {match.strength}</p></div>)}</Section></div>
    <Section title="VirusTotal Hash Reputation"><p className="mb-3 font-semibold">Hash reputation lookup</p><p className="mb-4 text-slate-600">The file itself was not uploaded to VirusTotal.</p><Metadata values={[
      ['Provider status', readable(p.status)], ...(p.status === 'AVAILABLE' ? [['Malicious detections', p.maliciousCount], ['Suspicious detections', p.suspiciousCount],
        ['Harmless detections', p.harmlessCount], ['Undetected', p.undetectedCount], ['Last analysis', p.lastAnalysisDate], ['Reputation', p.reputation], ['Cached report', Boolean(p.cached)]] : []),
    ]} />{p.status === 'NO_REPORT' && <p className="mt-3">No existing report was found. The file will not be submitted for scanning.</p>}<p className="mt-3 text-slate-500">Provider reports can be stale or incorrect. Unavailable reputation is an evidence gap, not an analysis failure.</p></Section>
    <Section title="Indicators">{r.indicators.length ? <ul className="list-disc space-y-2 pl-5">{r.indicators.map((item) => <li key={item.id}>{item.title}</li>)}</ul> : <p>No indicators were returned by the available checks.</p>}</Section>
    <Section title="Recommended Actions"><ul className="list-disc space-y-2 pl-5">{r.recommendations.map((text) => <li key={text}>{text}</li>)}</ul></Section>
    <Section title="Limitations"><ul className="list-disc space-y-2 pl-5">{r.limitations.map((text) => <li key={text}>{text}</li>)}</ul><p className="mt-4 font-semibold">{FILE_PRIVACY_NOTICE}</p></Section>
  </div>;
}
