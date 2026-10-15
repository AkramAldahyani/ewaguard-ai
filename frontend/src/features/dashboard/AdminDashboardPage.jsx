import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { Activity, AlertCircle, ArrowRight, Bell, BookOpen, ClipboardCheck, FileWarning, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Badge, Button, Card, RiskBadge, Skeleton, StatePanel } from '../../components/ui/index.jsx';
import { notificationItems } from '../notifications/notification-flow.js';
import { useNotifications } from '../notifications/notification-context.js';
import { dashboardApi, dashboardError } from './dashboard-api.js';

const dateTime = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Time unavailable';
};
const label = (value) => String(value ?? '').toLowerCase().replaceAll('_', ' ').replace(/^\w/u, (letter) => letter.toUpperCase());
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '—';

function Metric({ label: title, value, detail, tone = 'neutral', icon: Icon }) {
  const color = tone === 'danger' ? 'bg-danger-50 text-danger-700' : tone === 'warning' ? 'bg-warning-50 text-warning-800' : 'bg-brand-50 text-brand-700';
  return <Card className="min-w-0 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-slate-950">{count(value)}</p></div><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${color}`}><Icon className="size-5" aria-hidden="true" /></span></div>{detail && <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>}</Card>;
}

function SectionHeading({ title, description, to, action }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold tracking-tight text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div><Link to={to} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600">{action}<ArrowRight className="size-4" aria-hidden="true" /></Link></div>;
}

function IncidentPreview({ items }) {
  return <Card className="overflow-hidden"><div className="border-b border-slate-200 px-5 py-4 sm:px-6"><SectionHeading title="Recent incidents" description="Latest reported incidents across the organization." to="/admin/incidents" action="Open incident queue" /></div>{items.length === 0 ? <div className="p-8 text-center"><ShieldAlert className="mx-auto size-7 text-slate-400" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-800">No incidents recorded</p><p className="mt-1 text-sm text-slate-500">New reports will appear here.</p></div> : <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item.id} className="p-4 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><Link to={`/admin/incidents/${encodeURIComponent(item.id)}`} className="break-all text-sm font-bold text-brand-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">{item.reference}</Link><p className="mt-1 text-xs text-slate-500">{dateTime(item.createdAt)} · {item.assigneeName ? `Assigned to ${item.assigneeName}` : 'Unassigned'}</p></div><div className="flex flex-wrap items-center gap-2"><RiskBadge level={item.severity} /><Badge tone={item.status === 'NEW' ? 'warning' : 'neutral'}>{label(item.status)}</Badge>{item.urgent && <span className="sr-only">Urgent incident</span>}</div></div></li>)}</ul>}</Card>;
}

function NotificationPreview({ snapshot }) {
  const flow = useNotifications();
  return flow ? <LiveNotifications flow={flow} snapshot={snapshot} /> : <NotificationContents snapshot={snapshot} />;
}
function LiveNotifications({ flow, snapshot }) {
  const live = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  // The provider owns the live connection and recipient-scoped updates. The dashboard response is the initial snapshot.
  const current = !live.loading && !live.error && live.unreadCount !== null
    ? { unreadCount: live.unreadCount, items: live.items } : snapshot;
  return <NotificationContents snapshot={current} onRead={(id) => flow.read(id)} />;
}
function NotificationContents({ snapshot, onRead }) {
  const items = notificationItems(snapshot.items, 'IT_SECURITY_ADMIN').slice(0, 5);
  return <Card className="overflow-hidden"><div className="border-b border-slate-200 px-5 py-4 sm:px-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Security notifications</h2><p className="mt-1 text-sm text-slate-500">Authorized incident alerts and updates.</p></div><Badge tone={snapshot.unreadCount > 0 ? 'warning' : 'neutral'}>{count(snapshot.unreadCount)} unread</Badge></div></div>{items.length === 0 ? <div className="p-8 text-center"><Bell className="mx-auto size-7 text-slate-400" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-800">No recent notifications</p><p className="mt-1 text-sm text-slate-500">Security alerts will appear here.</p></div> : <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item.id} className="p-4 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-500">{label(item.kind)} · {dateTime(item.createdAt)}</span>{item.severity && <RiskBadge level={item.severity} />}</div><p className="mt-2 break-words text-sm font-semibold text-slate-900">{item.title}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><Link to={`/admin/incidents/${encodeURIComponent(item.incidentId)}`} onClick={() => { if (!item.readAt) onRead?.(item.id); }} className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">{item.reference ?? 'View incident'}</Link>{!item.readAt && <span className="text-xs font-semibold text-brand-700">Unread</span>}</div></li>)}</ul>}</Card>;
}

function AwarenessOverview({ metrics }) {
  const rows = [
    ['Published programs', metrics.publishedPrograms], ['Employees assigned', metrics.assignedEmployees],
    ['Active assignments', metrics.activeAssignments], ['Completed assignments', metrics.completedAssignments],
    ['In-progress assignments', metrics.inProgressAssignments], ['Published monthly quizzes', metrics.publishedMonthlyQuizzes],
    ['Monthly assignments', metrics.monthlyParticipations], ['Monthly submissions', metrics.monthlySubmitted],
    ['Certificates issued', metrics.certificatesIssued],
  ];
  return <Card className="p-5 sm:p-6"><div className="flex items-center gap-2"><BookOpen className="size-5 text-brand-700" aria-hidden="true" /><h2 className="text-lg font-bold text-slate-950">Training &amp; awareness</h2></div><p className="mt-1 text-sm text-slate-500">Current program, assignment and participation counts.</p><dl className="mt-5 grid gap-3 sm:grid-cols-2">{rows.map(([title, value]) => <div key={title} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3"><dt className="text-sm text-slate-600">{title}</dt><dd className="shrink-0 text-base font-bold tabular-nums text-slate-900">{count(value)}</dd></div>)}</dl><div className="mt-5 flex flex-wrap gap-2"><Button as={Link} to="/admin/training" variant="secondary" size="sm">Training programs</Button><Button as={Link} to="/admin/monthly-quizzes" variant="secondary" size="sm">Monthly quizzes</Button><Button as={Link} to="/admin/certificates" variant="secondary" size="sm">Certificates</Button></div></Card>;
}

function CommunityPreview({ total, items }) {
  return <Card className="overflow-hidden"><div className="border-b border-slate-200 px-5 py-4 sm:px-6"><SectionHeading title="Community review" description={`${count(total)} posts pending administrator review.`} to="/admin/community" action="Open moderation" /></div>{items.length === 0 ? <div className="p-8 text-center"><ClipboardCheck className="mx-auto size-7 text-slate-400" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-800">Review queue is clear</p><p className="mt-1 text-sm text-slate-500">New submissions will appear here.</p></div> : <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item.id} className="p-4 sm:px-6"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-slate-900">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{label(item.category)} · {item.authorName ?? 'Author unavailable'}</p><p className="mt-1 text-xs text-slate-500">Submitted {dateTime(item.submittedAt)}</p></div><Badge tone="warning">Pending</Badge></div></li>)}</ul>}</Card>;
}

export function AdminDashboardContent({ data }) {
  const { employees, incidents, awareness, community } = data.metrics;
  return <div className="space-y-6"><section aria-label="Security operations metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"><Metric label="Active employees" value={employees.active} icon={Users} /><Metric label="Total incidents" value={incidents.total} icon={Activity} /><Metric label="Open incidents" value={incidents.open} icon={ShieldAlert} /><Metric label="High priority open" value={incidents.highOpen} icon={FileWarning} tone="warning" /><Metric label="Critical priority open" value={incidents.criticalOpen} icon={AlertCircle} tone="danger" /><Metric label="Awaiting assignment" value={incidents.awaitingAssignment} icon={ClipboardCheck} tone="warning" /></section><div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)]"><div className="min-w-0 space-y-6"><IncidentPreview items={data.recentIncidents} /><AwarenessOverview metrics={awareness} /></div><div className="min-w-0 space-y-6"><NotificationPreview snapshot={data.notifications} /><CommunityPreview total={community.pendingPosts} items={data.pendingPosts} /></div></div></div>;
}

function DashboardLoading() {
  return <div role="status" aria-label="Loading administrator dashboard" className="space-y-6"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Card key={index} className="p-5"><Skeleton className="h-3 w-28" /><Skeleton className="mt-4 h-9 w-16" /><Skeleton className="mt-4 h-3 w-36" /></Card>)}</div><div className="grid gap-6 xl:grid-cols-2">{[0, 1].map((index) => <Card key={index} className="p-6"><Skeleton className="h-5 w-40" /><Skeleton className="mt-6 h-28 w-full" /></Card>)}</div></div>;
}

export function AdminDashboardPage() {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) setState({ loading: true, data: null, error: '' }); });
    dashboardApi.overview(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ loading: false, data, error: '' }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ loading: false, data: null, error: dashboardError(error) }); });
    return () => controller.abort();
  }, [revision]);
  return <><PageHeader eyebrow="Security operations" title="Administrator dashboard" description="Current incidents, alerts, awareness activity and community submissions." actions={<><Button as={Link} to="/admin/analytics/security" variant="secondary">Security analytics</Button><Button variant="secondary" disabled={state.loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className="size-4" aria-hidden="true" />Refresh dashboard</Button></>} />{state.data && <p className="mb-5 text-xs text-slate-500">Updated {dateTime(state.data.generatedAt)}. Counts reflect records available at request time.</p>}{state.loading && <DashboardLoading />}{state.error && <Card className="p-5"><StatePanel icon={AlertCircle} tone="error" title="Dashboard unavailable" description={state.error} action={<Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>Try again</Button>} /></Card>}{state.data && !state.loading && <AdminDashboardContent data={state.data} />}</>;
}
