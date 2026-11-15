import { IncidentAssistance } from '../../components/IncidentAssistance.jsx';
import { AnalysisReplay } from '../../components/AnalysisReplay.jsx';
import { IncidentReceipt } from '../../components/IncidentReceipt.jsx';
import { ExposureReport } from '../../components/ExposureReport.jsx';
import { RiskResult } from '../../components/RiskResult.jsx';
import { Badge, Card } from '../../components/ui/index.jsx';
import { formatBytes } from './email-state.js';

const classifications = {
  NO_STRONG_INDICATORS: [
    'No Strong Indicators',
    'neutral',
    'No strong suspicious indicators were detected by the available checks. This does not guarantee the email is safe.',
  ],
  SUSPICIOUS: ['Suspicious', 'warning', 'Suspicious indicators were detected. Treat this message with caution.'],
  HIGHLY_SUSPICIOUS: [
    'Highly Suspicious',
    'danger',
    'Several suspicious indicators were detected. Verify the sender using a trusted communication channel.',
  ],
};
const readable = (value) => String(value ?? 'Unavailable').replaceAll('_', ' ');
function Section({ title, children }) {
  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <h3 className="mb-4 text-base font-bold text-slate-950">{title}</h3>
      {children}
    </Card>
  );
}
function Metadata({ values }) {
  return (
    <dl className="space-y-3 text-sm">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt className="text-slate-500">{label}</dt>
          <dd className="mt-1 break-words font-medium text-slate-800 [overflow-wrap:anywhere]">
            {value || 'Unavailable'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function EmailResults({ analysis }) {
  if (analysis.replayed) return <AnalysisReplay analysis={analysis} />;
  const result = analysis.result;
  const [label, tone, description] = classifications[result.provisionalClassification] ?? [
    'Finding unavailable',
    'neutral',
    'Review the available evidence and limitations.',
  ];
  const mismatch = result.indicators.some(({ id }) => ['REPLY_DOMAIN_MISMATCH', 'REPLY_ADDRESS_MISMATCH'].includes(id));
  return (
    <div className="space-y-5 text-sm leading-6">
      <RiskResult risk={analysis.result.risk} />
      <IncidentReceipt incident={analysis.incident} analysisId={analysis.analysisId} analyzerType="EMAIL" />
      <ExposureReport analysisId={analysis.analysisId} analyzerType="EMAIL" />
      <IncidentAssistance assistance={analysis.result.assistance} />
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-950">Analysis Summary: Analyzer Finding</h3>
          <Badge tone={tone}>{label}</Badge>
        </div>
        <p className="mt-4 text-slate-700">{description}</p>
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-slate-600">
          This is an email-analyzer finding. The EWAGuard Risk Level above evaluates the structured evidence using the
          central risk model.
        </p>
        <p className="mt-3 break-all text-xs text-slate-500">
          Analysis {analysis.analysisId} · {new Date(analysis.createdAt).toLocaleString()}
        </p>
        {result.subject && (
          <p className="mt-3 break-words [overflow-wrap:anywhere]">
            <strong>Subject: </strong>
            {result.subject}
          </p>
        )}
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Sender Information">
          <Metadata
            values={[
              ['Display name', result.sender.displayName],
              ['Sender address', result.sender.address],
              ['Sender domain', result.sender.domain],
            ]}
          />
        </Section>
        <Section title="Reply-To Information">
          <Metadata
            values={[
              ['Reply-To address', result.replyTo.address],
              ['Reply-To domain', result.replyTo.domain],
            ]}
          />
          {mismatch && (
            <p className="mt-4 rounded-lg bg-warning-50 p-3 font-semibold text-warning-900">
              Sender and Reply-To differ. Verify unexpected requests through a known channel.
            </p>
          )}
        </Section>
        {result.returnPath && (
          <Section title="Return-Path Information">
            <Metadata
              values={[
                ['Return-Path address', result.returnPath.address],
                ['Return-Path domain', result.returnPath.domain],
              ]}
            />
            <p className="mt-3 text-slate-600">
              Reported bounce address; a different bounce domain alone does not establish impersonation.
            </p>
          </Section>
        )}
      </div>
      <Section title="Authentication Evidence">
        <p className="mb-4 text-slate-600">
          These are claims from supplied email headers, not independently verified by EWAGuard AI. A signature being
          present does not mean authentication succeeded.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {['spf', 'dkim', 'dmarc'].map((method) => {
            const evidence = result.authentication[method];
            return (
              <div key={method} className="rounded-xl border border-slate-200 p-4">
                <h4 className="font-bold uppercase">{method}</h4>
                <p className="mt-1 font-semibold">{readable(evidence.status)}</p>
                <p>
                  {evidence.claimedResults.length ? evidence.claimedResults.join(', ') : 'No usable result supplied'}
                </p>
                <p className="mt-2 text-xs text-slate-500">Not independently verified</p>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Detected Indicators">
        {result.indicators.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {result.indicators.map((indicator) => (
              <li key={indicator.id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{indicator.category}</p>
                <h4 className="mt-1 font-bold text-slate-900">{indicator.title}</h4>
                <p className="mt-2 text-slate-600">{indicator.evidence}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No indicators were returned by the available checks.</p>
        )}
      </Section>
      <Section title="URLs Found">
        <p className="mb-3 text-slate-600">
          URL reputation checking is not included in this email analysis yet. Only minimized origins are shown; full
          paths and query strings are omitted. Links are displayed as text.
        </p>
        {result.urls.length ? (
          <ul className="space-y-2">
            {result.urls.map((url, index) => (
              <li key={index} className="rounded-lg bg-slate-50 p-3">
                <code className="break-all text-slate-800">{url.origin}</code>
                <p className="text-xs text-slate-500">Not checked against reputation services</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No URLs were extracted by the available checks.</p>
        )}
      </Section>
      <Section title="Attachments">
        <p className="mb-3 text-slate-600">
          Attachment metadata was inspected. The attachment itself was not malware-scanned.
        </p>
        {result.attachments.length ? (
          <ul className="space-y-3">
            {result.attachments.map((attachment) => (
              <li key={attachment.index} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h4 className="min-w-0 break-all font-bold">{attachment.filename}</h4>
                  <Badge tone="warning">NOT SCANNED</Badge>
                </div>
                <p className="mt-2 break-all">
                  {attachment.contentType} · {formatBytes(attachment.size)}
                </p>
                <p>Metadata category: {readable(attachment.category)}</p>
                <p className="text-slate-600">
                  Review attachment warnings in Detected Indicators. Do not open unexpected attachments.
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No attachments were identified in this submission.</p>
        )}
      </Section>
      <Section title="Recommended Actions">
        <ul className="list-disc space-y-2 pl-5 text-slate-700">
          {result.recommendedActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </Section>
      <Section title="Limitations">
        <ul className="list-disc space-y-2 pl-5 text-slate-700">
          {result.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
