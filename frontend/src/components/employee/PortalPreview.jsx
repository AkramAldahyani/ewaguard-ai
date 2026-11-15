import { ArrowRight, Info, LockKeyhole, UploadCloud } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Button, Card } from '../ui/index.jsx';
import { PageHeader } from '../PageHeader.jsx';

export function PreviewNotice({
  children = 'This is an interface preview. This feature is not available yet; nothing can be submitted or processed here.',
}) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="leading-6">
        <strong>Preview only.</strong> {children}
      </p>
    </div>
  );
}

export function PreviewPage({ title, description, section = 'Employee workspace', children, actions }) {
  return (
    <>
      <PageHeader
        eyebrow={section}
        title={title}
        description={description}
        breadcrumbs={[title]}
        actions={actions ?? <Badge>Coming later</Badge>}
      />
      <PreviewNotice />
      {children}
    </>
  );
}

export function PrivacyReminder({ context = 'general' }) {
  return (
    <aside className="rounded-xl border border-warning-200 bg-warning-50 p-5">
      <div className="flex items-center gap-2 text-warning-900">
        <LockKeyhole className="size-4" aria-hidden="true" />
        <h2 className="text-sm font-bold">Keep sensitive information private</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-warning-900">
        Do not submit confidential or restricted company information, passwords, credentials, secrets, or sensitive
        personal information. Use your organization’s approved reporting channel for restricted material.
      </p>
      <p className="mt-3 text-xs leading-5 text-warning-800">
        {context === 'url'
          ? 'URL analysis will use a proportionate warning before submission. No address can be submitted in this preview.'
          : 'An active acknowledgement will be required before supported content or attachments can be submitted.'}
      </p>
    </aside>
  );
}

export function UploadPreview({
  label = 'Choose a file',
  description = 'File selection and uploads are not enabled in this preview.',
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <UploadCloud className="mb-3 size-7 text-brand-700" aria-hidden="true" />
      <p className="mb-4 max-w-sm text-sm leading-6 text-slate-600">{description}</p>
      <Button variant="secondary" disabled>
        {label} — coming later
      </Button>
    </div>
  );
}

export function PortalLinkCard({
  icon: Icon,
  image,
  compactImage = false,
  coverImage = false,
  title,
  description,
  to,
  preview = false,
}) {
  return (
    <Link to={to} className="portal-link group block h-full rounded-2xl">
      <Card className="h-full overflow-hidden transition-colors group-hover:border-brand-300">
        {image && (
          <div className="border-b border-slate-100 bg-white">
            <img
              src={image}
              alt=""
              loading="lazy"
              className={`block w-full ${coverImage ? 'h-40 object-cover object-center' : compactImage ? 'h-40 object-contain' : 'aspect-[3/2] object-contain'}`}
            />
          </div>
        )}
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            {preview && <Badge>Preview</Badge>}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <h3 className="font-bold text-slate-950">{title}</h3>
            <ArrowRight
              className="size-4 shrink-0 text-brand-700 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </Card>
    </Link>
  );
}

export function FeatureOutline({ title = 'What to expect', items }) {
  return (
    <Card className="p-6">
      <h2 className="font-bold text-slate-950">{title}</h2>
      <ul className="mt-4 space-y-4">
        {items.map((item, index) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
            <span
              className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
