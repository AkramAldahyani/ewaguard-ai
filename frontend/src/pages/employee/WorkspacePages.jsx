import { useState } from 'react';
import { MessageSquareText, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react';
import { Badge, Button, Card, StatePanel } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { FeatureOutline, PreviewPage, PrivacyReminder } from '../../components/employee/PortalPreview.jsx';
import { useAuth } from '../../context/auth-context.js';

export function IncidentsPage() {
  return <PreviewPage title="My Incidents" description="A future view of security reports you are authorized to follow, with clear status and next steps.">
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(16rem,1fr)]"><Card className="p-6"><StatePanel icon={ShieldAlert} title="No live incident data connected yet" description="Your incident records and timelines will appear when incident management is available. This is not a count of your open incidents." /><p className="mt-5 text-sm leading-6 text-slate-600">Need to report something now? Use your organization’s approved IT/security reporting channel.</p></Card><FeatureOutline title="Follow a report" items={['See the status of your authorized incidents.', 'Review permitted evidence and recommended next steps.', 'Follow updates as the security team investigates and resolves the report.']} /></div>
  </PreviewPage>;
}

export function CommunityPage() {
  const [submissionInfo, setSubmissionInfo] = useState(false);
  return <PreviewPage title="Security Community" description="A shared space for reviewed security warnings, practical tips, and awareness learning." actions={<Button variant="secondary" onClick={() => setSubmissionInfo(true)}>Submit a post · Preview</Button>}>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(16rem,1fr)]"><Card className="p-6"><StatePanel icon={MessageSquareText} title="Approved posts will appear here" description="The community feed is not connected yet. No employee posts, authors, or moderation results are shown." />
      <article className="mt-6 rounded-xl border border-slate-200 p-5"><div className="flex flex-wrap items-center gap-2"><Badge>Post layout preview</Badge><span className="text-xs text-slate-500">No published content</span></div><h2 className="mt-4 font-bold">Space for an approved security post</h2><p className="mt-2 text-sm leading-6 text-slate-600">A published card will show its category, title, permitted author information, and reviewed content.</p></article></Card><FeatureOutline title="Shared with care" items={['Submit appropriate cybersecurity content when submissions are enabled.', 'Every submission goes to the security team for review.', 'Only approved posts become visible to other employees.']} /></div>
    <Modal open={submissionInfo} onClose={() => setSubmissionInfo(false)} title="Post submissions are coming later" description="This entry point is a preview. No post or attachment can be submitted yet." footer={<Button onClick={() => setSubmissionInfo(false)}>Understood</Button>}><PrivacyReminder /></Modal>
  </PreviewPage>;
}

export function ProfilePage() {
  const { user } = useAuth();
  const details = [['Full name', `${user.firstName} ${user.lastName}`], ['Email address', user.email], ['Employee identifier', user.employeeIdentifier ?? 'Not provided'], ['Department', user.department?.name ?? 'Not assigned'], ['Role', user.role === 'EMPLOYEE' ? 'Employee' : 'IT / Security Administrator']];
  return <><PageHeader eyebrow="Your account" title="Profile" description="Your organization-provided account details from your authenticated session." breadcrumbs={['Profile']} />
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(16rem,1fr)]"><Card className="overflow-hidden"><div className="flex items-center gap-4 border-b border-slate-100 bg-brand-50/40 p-6"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-brand-700 ring-1 ring-brand-200"><UserRound className="size-7" aria-hidden="true" /></span><div className="min-w-0"><h2 className="break-words text-xl font-bold">{user.firstName} {user.lastName}</h2><p className="mt-1 text-sm text-slate-600">Organization account</p></div></div><dl className="divide-y divide-slate-100 px-6">{details.map(([label, value]) => <div key={label} className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]"><dt className="text-sm font-medium text-slate-500">{label}</dt><dd className="break-words text-sm font-semibold text-slate-800">{value}</dd></div>)}</dl></Card>
      <Card className="p-6"><ShieldCheck className="size-6 text-brand-700" aria-hidden="true" /><h2 className="mt-4 font-bold">Managed by your organization</h2><p className="mt-2 text-sm leading-6 text-slate-600">Contact your IT/security administrator if these details need to change. Profile editing is not available here.</p><p className="mt-4 text-sm leading-6 text-slate-600">This page displays only your safe session profile. Authentication secrets and internal identifiers are not shown.</p></Card></div>
  </>;
}
