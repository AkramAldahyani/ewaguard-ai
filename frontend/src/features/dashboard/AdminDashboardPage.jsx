import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card, Skeleton, StatePanel } from '../../components/ui/index.jsx';
import { dashboardApi, dashboardError } from './dashboard-api.js';
import { AdminDashboardContent as SocDashboardContent } from './AdminDashboardContent.jsx';

const dateTime = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Time unavailable';
};
function DashboardLoading() {
  return <div role="status" aria-label="Loading administrator dashboard" className="space-y-6"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Card key={index} className="p-5"><Skeleton className="h-3 w-32" /><Skeleton className="mt-4 h-9 w-16" /><Skeleton className="mt-4 h-3 w-36" /></Card>)}</div><div className="grid gap-6 xl:grid-cols-2">{[0, 1].map((index) => <Card key={index} className="p-6"><Skeleton className="h-5 w-40" /><Skeleton className="mt-6 h-40 w-full" /></Card>)}</div></div>;
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
  return <><PageHeader eyebrow="Security operations" title="Security Overview" description="Monitor security activity, incidents, and employee awareness across the organization." actions={<><Button as={Link} to="/admin/incidents"><ShieldAlert className="size-4" aria-hidden="true" />View Incident Queue</Button><Button variant="secondary" disabled={state.loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className="size-4" aria-hidden="true" />Refresh dashboard</Button></>} />{state.data && <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span>Updated {dateTime(state.data.generatedAt)}</span><span aria-hidden="true">·</span><span>Analysis reporting period: last {state.data.metrics.analyses?.period?.days ?? 30} days (UTC)</span></div>}{state.loading && <DashboardLoading />}{state.error && <Card className="p-5"><StatePanel icon={AlertCircle} tone="error" title="Dashboard unavailable" description={state.error} action={<Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>Try again</Button>} /></Card>}{state.data && !state.loading && <SocDashboardContent data={state.data} />}</>;
}
