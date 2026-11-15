import { FileSearch, Link2, Mail, ShieldCheck } from 'lucide-react';
import { Button, Card, Field, Input, StatePanel, Textarea } from '../../components/ui/index.jsx';
import { useState } from 'react';
import {
  FeatureOutline,
  PreviewPage,
  PrivacyReminder,
  UploadPreview,
} from '../../components/employee/PortalPreview.jsx';
import { SensitiveInformationNotice } from '../../features/disclaimer/SensitiveInformationNotice.jsx';

const analysisContent = {
  email: {
    title: 'Analyze Email',
    icon: Mail,
    description: 'A dedicated workspace for reviewing suspicious messages and understanding the available evidence.',
    items: [
      'Paste message text and headers, or upload a permitted .eml file.',
      'Review sender details, embedded links, and authentication indicators where available.',
      'Receive evidence-based guidance once email analysis is connected.',
    ],
  },
  url: {
    title: 'Analyze URL',
    icon: Link2,
    description: 'Prepare to examine suspicious links before deciding what to do next.',
    items: [
      'Provide a permitted web address without credentials or sensitive query parameters.',
      'Review URL structure and available reputation evidence.',
      'Understand limitations: no known detection will not guarantee that a site is safe.',
    ],
  },
  file: {
    title: 'Analyze File',
    icon: FileSearch,
    description: 'A future secure workspace for permitted file checks and understandable results.',
    items: [
      'Select a permitted file after acknowledging the sensitive-information notice.',
      'Review file type, SHA-256, and available scanner evidence.',
      'See explicit scanner availability and limitations alongside the results.',
    ],
  },
};

export function AnalysisPage({ kind }) {
  const [acknowledgement, setAcknowledgement] = useState(null);
  const content = analysisContent[kind];
  const Icon = content.icon;
  const disclaimerContext = kind === 'email' ? 'EMAIL_ANALYSIS' : kind === 'file' ? 'FILE_ANALYSIS' : null;
  return (
    <PreviewPage title={content.title} description={content.description} section="Security analysis">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(16rem,1fr)]">
        <div className="min-w-0 space-y-6">
          {disclaimerContext && (
            <SensitiveInformationNotice context={disclaimerContext} onAcknowledged={setAcknowledgement} />
          )}
          {(!disclaimerContext || acknowledgement) && (
            <Card className="p-5 sm:p-7">
              <div className="mb-6 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-bold text-slate-950">
                  {kind === 'email' ? 'Email content' : kind === 'url' ? 'Website address' : 'File submission'}
                </h2>
              </div>
              {kind === 'email' && (
                <div className="space-y-5">
                  <Field
                    id="email-preview"
                    label="Message and headers"
                    hint="Pasting is disabled until the email analyzer and acknowledgement flow are available."
                  >
                    {(field) => (
                      <Textarea
                        {...field}
                        disabled
                        placeholder="Email text and headers will go here…"
                        className="min-h-40"
                      />
                    )}
                  </Field>
                  <UploadPreview
                    label="Choose .eml file"
                    description="An .eml upload option will be available alongside pasted email content."
                  />
                </div>
              )}
              {kind === 'url' && (
                <Field
                  id="url-preview"
                  label="URL to review"
                  hint="This preview will not open, fetch, or scan any address."
                >
                  {(field) => <Input {...field} type="url" disabled placeholder="https://example.com" />}
                </Field>
              )}
              {kind === 'file' && (
                <UploadPreview description="Permitted document and archive formats will be listed here when secure uploads are available. No file can be selected or dropped yet." />
              )}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button disabled>Analyze {kind} — coming later</Button>
                <p className="text-xs text-slate-500">No analysis service connected</p>
              </div>
            </Card>
          )}
          {!disclaimerContext && <PrivacyReminder context="url" />}
        </div>
        <div className="space-y-6">
          <FeatureOutline items={content.items} />
          <Card className="p-4">
            <StatePanel
              icon={ShieldCheck}
              title="Results will appear here"
              description="No checks have run. There is no risk classification or scanner result in this preview."
            />
          </Card>
        </div>
      </div>
    </PreviewPage>
  );
}
