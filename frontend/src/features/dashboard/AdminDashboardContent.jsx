import { useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { UserIdentity } from '../../components/UserIdentity.jsx';
import {
  AlertCircle, ArrowRight, BarChart3, Bell, BookOpen, CheckCircle2,
  ClipboardCheck, FileWarning, ShieldAlert, Users,
} from 'lucide-react';
import { Badge, Button, Card, RiskBadge } from '../../components/ui/index.jsx';
import { notificationItems } from '../notifications/notification-flow.js';
import { useNotifications } from '../notifications/notification-context.js';
import { displayLabel } from '../../lib/labels.js';

const riskLevels = [
  { value: 'LOW', label: 'Low', color: '#16a34a', dot: 'bg-success-600' },
  { value: 'MEDIUM', label: 'Medium', color: '#d97706', dot: 'bg-warning-600' },
  { value: 'HIGH', label: 'High', color: '#ea580c', dot: 'bg-orange-600' },
  { value: 'CRITICAL', label: 'Critical', color: '#b91c1c', dot: 'bg-danger-700' },
];
const openStatuses = new Set(['NEW', 'UNDER_INVESTIGATION', 'CONTAINED']);

const dateTime = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Time unavailable';
};
const label = (value) => displayLabel(String(value ?? ''));
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '—';
const percent = (part, total) => total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0;

function Metric({ label: title, value, detail, tone = 'brand', icon: Icon, to }) {
  const colors = {
    brand: 'bg-brand-50 text-brand-700', neutral: 'bg-slate-100 text-slate-700',
    warning: 'bg-warning-50 text-warning-800', danger: 'bg-danger-50 text-danger-700',
  };
  const card = <Card className={`group h-full min-w-0 p-4 transition sm:p-5 ${to ? 'hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md' : ''}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</p><p className="mt-2.5 text-3xl font-bold tabular-nums tracking-tight text-slate-950">{count(value)}</p></div>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${colors[tone]}`}><Icon className="size-5" aria-hidden="true" /></span>
    </div>
    {detail && <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>}
    {to && <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">View details<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>}
  </Card>;
  return to ? <Link to={to} className="rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">{card}</Link> : card;
}

function SectionHeading({ title, description, actions }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-bold tracking-tight text-slate-950">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{description}</p></div>{actions && <div className="flex flex-wrap items-center gap-1">{actions}</div>}</div>;
}

function TextLink({ to, children }) {
  return <Link to={to} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600">{children}<ArrowRight className="size-4" aria-hidden="true" /></Link>;
}

function analysisGradient(rows, total) {
  if (!total) return '#e2e8f0';
  let start = 0;
  return `conic-gradient(${riskLevels.map((level) => {
    const value = rows.find((row) => row.value === level.value)?.count ?? 0;
    const end = start + (value / total) * 360;
    const stop = `${level.color} ${start}deg ${end}deg`;
    start = end;
    return stop;
  }).join(', ')})`;
}

function AnalysisOverview({ metrics }) {
  const severity = Array.isArray(metrics.severity) ? metrics.severity : [];
  const total = Number.isSafeInteger(metrics.total) ? metrics.total : 0;
  return <Card className="h-full p-5 sm:p-6">
    <SectionHeading title="Security analysis overview" description="Completed email, URL, and file analyses for the reporting period." actions={<TextLink to="/admin/analytics/security">View Security Analytics</TextLink>} />
    <div className="mt-5 grid items-center gap-6 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="relative mx-auto grid size-40 place-items-center rounded-full" role="img" aria-label={`${count(total)} completed analyses by risk level`} style={{ background: analysisGradient(severity, total) }}>
        <div className="grid size-[7.2rem] place-items-center rounded-full bg-white text-center shadow-inner"><div><p className="text-3xl font-bold tabular-nums text-slate-950">{count(total)}</p><p className="mt-0.5 text-xs font-medium text-slate-500">Completed</p></div></div>
      </div>
      <div className="min-w-0">
        <div className="grid grid-cols-2 gap-x-5 gap-y-4">{riskLevels.map((level) => {
          const value = severity.find((row) => row.value === level.value)?.count ?? 0;
          return <div key={level.value} className="min-w-0"><div className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${level.dot}`} aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{level.label}</span></div><div className="mt-1 flex items-baseline gap-2"><span className="text-xl font-bold tabular-nums text-slate-900">{count(value)}</span><span className="text-xs text-slate-500">{percent(value, total)}%</span></div></div>;
        })}</div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">Last {metrics.period?.days ?? 30} days · {metrics.period?.timezone ?? 'UTC'}</div>
      </div>
    </div>
  </Card>;
}

export const DASHBOARD_INCIDENT_LIMIT = 2;
export const DASHBOARD_NOTIFICATION_LIMIT = 3;
const newestFirst = (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || String(b.id).localeCompare(String(a.id));

function IncidentPreview({ items }) {
  const recent = [...items].sort(newestFirst).slice(0, DASHBOARD_INCIDENT_LIMIT);
  return <Card className="h-full overflow-hidden">
    <div className="border-b border-slate-200 px-5 py-4 sm:px-6"><SectionHeading title="Recent incidents" description="The two most recently created incidents." actions={<><TextLink to="/admin/analytics/incidents">Incident Statistics</TextLink><TextLink to="/admin/incidents">View Incident Queue</TextLink></>} /></div>
    {recent.length === 0 ? <div className="p-8 text-center"><ShieldAlert className="mx-auto size-7 text-slate-400" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-800">No incidents recorded</p><p className="mt-1 text-sm text-slate-500">New security incidents will appear here.</p></div> : <ul className="divide-y divide-slate-100">{recent.map((item) => <li key={item.id} className={`relative px-5 py-3.5 sm:px-6 ${item.severity === 'CRITICAL' && openStatuses.has(item.status) ? 'bg-danger-50/30' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link to={`/admin/incidents/${encodeURIComponent(item.id)}`} className="break-all text-sm font-bold text-brand-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">{item.reference}</Link><RiskBadge level={item.severity} /><Badge tone={item.status === 'NEW' ? 'warning' : 'neutral'}>{label(item.status)}</Badge></div><div className="mt-2"><UserIdentity user={item.reporter} userId={item.reporterId} /></div><p className="mt-1.5 text-xs text-slate-500">Created {dateTime(item.createdAt)}</p></div><div className="shrink-0 text-right"><p className="text-xs font-semibold text-slate-700">{item.assigneeName ? 'Assigned' : 'Awaiting assignment'}</p><p className="mt-1 text-xs text-slate-500">{item.assigneeName ?? 'Unassigned'}</p></div></div>
    </li>)}</ul>}
  </Card>;
}

function NotificationPreview({ snapshot }) {
  const flow = useNotifications();
  return flow ? <LiveNotifications flow={flow} snapshot={snapshot} /> : <NotificationContents snapshot={snapshot} />;
}
function LiveNotifications({ flow, snapshot }) {
  const live = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const current = !live.loading && !live.error && live.unreadCount !== null ? { unreadCount: live.unreadCount, items: live.items } : snapshot;
  return <NotificationContents snapshot={current} onRead={(id) => flow.read(id)} />;
}
function NotificationContents({ snapshot, onRead }) {
  const items = notificationItems(snapshot.items, 'IT_SECURITY_ADMIN').sort(newestFirst).slice(0, DASHBOARD_NOTIFICATION_LIMIT);
  return <Card className="h-full overflow-hidden">
    <div className="border-b border-slate-200 px-5 py-4 sm:px-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Security notifications</h2><p className="mt-1 text-sm text-slate-500">Live incident alerts and updates.</p></div><Badge tone={snapshot.unreadCount > 0 ? 'warning' : 'neutral'}>{count(snapshot.unreadCount)} unread</Badge></div></div>
    {items.length === 0 ? <div className="p-7 text-center"><Bell className="mx-auto size-7 text-slate-400" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-800">No recent notifications</p><p className="mt-1 text-sm text-slate-500">Security alerts will appear here.</p></div> : <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item.id} className={`px-5 py-3.5 sm:px-6 ${item.severity === 'CRITICAL' ? 'border-l-2 border-danger-600' : ''}`}>
      <div className="flex gap-3"><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${item.readAt ? 'bg-slate-100 text-slate-500' : 'bg-brand-50 text-brand-700'}`}><Bell className="size-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-500">{label(item.kind)}</span>{item.severity && <RiskBadge level={item.severity} />}</div><p className="mt-1 break-words text-sm font-semibold text-slate-900">{item.title}</p><div className="mt-1.5 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{dateTime(item.createdAt)}</span><div className="flex items-center gap-2">{!item.readAt && <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><span className="size-1.5 rounded-full bg-brand-600" />Unread</span>}<Link to={item.incidentId ? `/admin/incidents/${encodeURIComponent(item.incidentId)}` : '/admin/incidents'} onClick={() => { if (!item.readAt) onRead?.(item.id); }} className="text-xs font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">{item.reference ?? 'View incident'}</Link></div></div></div></div>
    </li>)}</ul>}
  </Card>;
}

function ProgressRow({ label: title, value, detail, tone = 'brand' }) {
  return <div><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-700">{title}</span><span className="font-bold tabular-nums text-slate-950">{value}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={title} aria-valuemin="0" aria-valuemax="100" aria-valuenow={value}><div className={`h-full rounded-full ${tone === 'success' ? 'bg-success-600' : 'bg-brand-600'}`} style={{ width: `${value}%` }} /></div><p className="mt-1.5 text-xs text-slate-500">{detail}</p></div>;
}

function AwarenessOverview({ metrics }) {
  const completion = percent(metrics.completedAssignments, metrics.activeAssignments);
  const participation = percent(metrics.monthlySubmitted, metrics.monthlyParticipations);
  const summaries = [
    ['Published programs', metrics.publishedPrograms, BookOpen], ['Assigned employees', metrics.assignedEmployees, Users],
    ['Completed assignments', metrics.completedAssignments, CheckCircle2], ['Certificates issued', metrics.certificatesIssued, ClipboardCheck],
  ];
  return <Card className="h-full p-5 sm:p-6">
    <SectionHeading title="Training & awareness" description="Organization-wide participation and completion at a glance." actions={<TextLink to="/admin/analytics/awareness">Awareness Analytics</TextLink>} />
    <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{summaries.map(([title, value, Icon]) => <div key={title} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"><div className="flex items-center justify-between gap-2"><dt className="text-xs font-semibold leading-4 text-slate-500">{title}</dt><Icon className="size-4 shrink-0 text-brand-700" aria-hidden="true" /></div><dd className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{count(value)}</dd></div>)}</dl>
    <div className="mt-6 grid gap-5 sm:grid-cols-2"><ProgressRow label="Training completion rate" value={completion} detail={`${count(metrics.completedAssignments)} completed · ${count(metrics.inProgressAssignments)} in progress`} tone="success" /><ProgressRow label="Monthly quiz participation" value={participation} detail={`${count(metrics.monthlySubmitted)} of ${count(metrics.monthlyParticipations)} expected submissions received · ${count(metrics.publishedMonthlyQuizzes)} published quizzes`} /></div>
    <div className="mt-6 flex flex-wrap gap-2"><Button as={Link} to="/admin/training" variant="secondary" size="sm">Training Programs</Button><Button as={Link} to="/admin/monthly-quizzes" variant="secondary" size="sm">Monthly Quizzes</Button><Button as={Link} to="/admin/certificates" variant="secondary" size="sm">Certificates</Button></div>
  </Card>;
}

function CommunityPreview({ total, items }) {
  return <Card className="p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-4"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${total > 0 ? 'bg-warning-50 text-warning-800' : 'bg-success-50 text-success-700'}`}><ClipboardCheck className="size-5" aria-hidden="true" /></span><div className="min-w-0"><div className="flex flex-wrap items-baseline gap-2"><h2 className="text-base font-bold text-slate-950">Community review</h2><span className="text-xl font-bold tabular-nums text-slate-950">{count(total)}</span><span className="text-xs text-slate-500">pending</span></div><p className="mt-1 text-sm text-slate-500">{total === 0 ? 'Review queue is clear.' : `${count(total)} posts require moderation.`}</p></div></div><div className="flex min-w-0 flex-wrap items-center gap-2">{items.slice(0, 2).map((item) => <Badge key={item.id} tone="warning" className="max-w-48 truncate">{item.title}</Badge>)}<TextLink to="/admin/community">Community Moderation</TextLink></div></div></Card>;
}

export function AdminDashboardContent({ data }) {
  const { analyses = { total: 0, severity: [] }, employees, incidents, awareness, community } = data.metrics;
  return <div className="space-y-6">
    <section aria-label="Security operations metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Metric label="Total Security Analyses" value={analyses.total} detail={`Completed in the last ${analyses.period?.days ?? 30} days`} icon={BarChart3} to="/admin/analytics/security" />
      <Metric label="Open Incidents" value={incidents.open} detail="Active incident lifecycle states" icon={ShieldAlert} to="/admin/incidents" />
      <Metric label="High-Priority Open Incidents" value={incidents.highOpen} detail="Open incidents classified HIGH" icon={FileWarning} tone="warning" to="/admin/incidents" />
      <Metric label="Critical-Priority Open Incidents" value={incidents.criticalOpen} detail="Immediate-priority open incidents" icon={AlertCircle} tone="danger" to="/admin/incidents" />
      <Metric label="Awaiting Assignment" value={incidents.awaitingAssignment} detail="Open incidents without an assignee" icon={ClipboardCheck} tone="warning" to="/admin/incidents" />
      <Metric label="Active Employees" value={employees.active} detail="Active employee accounts" icon={Users} tone="neutral" />
    </section>
    <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(19rem,0.85fr)_minmax(0,1.35fr)]"><AnalysisOverview metrics={analyses} /><IncidentPreview items={data.recentIncidents} /></div>
    <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]"><AwarenessOverview metrics={awareness} /><NotificationPreview snapshot={data.notifications} /></div>
    <CommunityPreview total={community.pendingPosts} items={data.pendingPosts} />
  </div>;
}
