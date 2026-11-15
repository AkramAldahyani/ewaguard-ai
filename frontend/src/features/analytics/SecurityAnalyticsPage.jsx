import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Activity, AlertCircle, Clock3, FileWarning, RefreshCw, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Badge, Button, Card, RiskBadge, Skeleton, StatePanel } from '../../components/ui/index.jsx';
import { securityAnalyticsApi, securityAnalyticsError, validateSecurityRange } from './security-analytics-api.js';
import { AssignmentChart, CreationTrend, DistributionChart } from './SecurityAnalyticsCharts.jsx';
import { AnalysisOverview } from './AnalysisOverview.jsx';
import { AnalyticsPeriodFilter } from './AnalyticsPeriodFilter.jsx';
import { displayLabel } from '../../lib/labels.js';

const label = (value) => displayLabel(String(value ?? ''));
const number = (value) => (Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '—');
const dateTime = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) +
        ' UTC'
    : 'Time unavailable';
};
const duration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Unavailable';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(1)} hr`;
  return `${(seconds / 86_400).toFixed(1)} days`;
};

function Kpi({ title, value, detail, icon: Icon, tone = 'brand' }) {
  const iconTone =
    tone === 'danger'
      ? 'bg-danger-50 text-danger-700'
      : tone === 'warning'
        ? 'bg-warning-50 text-warning-800'
        : 'bg-brand-50 text-brand-700';
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-slate-950">{value}</p>
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${iconTone}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>
    </Card>
  );
}

function AnalyticsLoading() {
  return (
    <div role="status" aria-label="Loading security analytics" className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-9 w-16" />
            <Skeleton className="mt-4 h-3 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1].map((index) => (
          <Card key={index} className="p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-6 h-40 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}

function RecentCreated({ items }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Recently created incidents</h2>
          <p className="mt-1 text-sm text-slate-500">Up to eight incidents created in the selected period.</p>
        </div>
        <Button as={Link} to="/admin/incidents" variant="secondary" size="sm">
          Open incident queue
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-600">No incidents were created during this period.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="p-4 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/admin/incidents/${encodeURIComponent(item.id)}`}
                    className="break-all text-sm font-bold text-brand-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600"
                  >
                    {item.reference}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    Created {dateTime(item.createdAt)} · {item.assigned ? 'Assigned' : 'Unassigned'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {label(item.category)} · {label(item.detectionSource)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <RiskBadge level={item.severity} />
                  <Badge tone={item.status === 'NEW' ? 'warning' : 'neutral'}>{label(item.status)}</Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SecurityAnalyticsContent({ data }) {
  const { metrics, distributions, range } = data;
  return (
    <div className="space-y-6">
      <p className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900" role="status">
        Showing incidents created <strong>{range.start}</strong> through <strong>{range.end}</strong> ({range.days} UTC
        days). Severity, status and assignment reflect their current stored values.
      </p>
      <section aria-label="Incident metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Kpi
          title="Incidents created"
          value={number(metrics.created)}
          detail="Created in the selected UTC period"
          icon={Activity}
        />
        <Kpi
          title="High severity"
          value={number(metrics.high)}
          detail="Current HIGH severity"
          icon={FileWarning}
          tone="warning"
        />
        <Kpi
          title="Critical severity"
          value={number(metrics.critical)}
          detail="Current CRITICAL severity"
          icon={AlertCircle}
          tone="danger"
        />
        <Kpi
          title="Open now"
          value={number(metrics.openCurrent)}
          detail="NEW, UNDER_INVESTIGATION or CONTAINED"
          icon={ShieldAlert}
        />
        <Kpi
          title="Resolved now"
          value={number(metrics.resolvedCurrent)}
          detail="Current RESOLVED status only"
          icon={ShieldAlert}
        />
        <Kpi
          title="Average resolution"
          value={duration(metrics.resolution.averageSeconds)}
          detail={`Based on ${number(metrics.resolution.eligibleCount)} eligible resolved incidents`}
          icon={Clock3}
        />
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <CreationTrend days={data.dailyCreated} />
        <DistributionChart
          title="Severity distribution"
          description="Current severity of incidents created in this period."
          rows={distributions.severity}
          total={metrics.created}
          tone="danger"
        />
        <DistributionChart
          title="Current status"
          description="Current status, not a historical status snapshot."
          rows={distributions.currentStatus}
          total={metrics.created}
        />
        <DistributionChart
          title="Incident categories"
          description="Stored incident category for matching incidents."
          rows={distributions.category}
          total={metrics.created}
        />
        <DistributionChart
          title="Detection sources"
          description="Recorded source of matching incidents."
          rows={distributions.detectionSource}
          total={metrics.created}
        />
        <AssignmentChart assigned={metrics.assignedCurrent} unassigned={metrics.unassignedCurrent} />
      </div>
      <RecentCreated items={data.recentCreated} />
    </div>
  );
}

export function SecurityAnalyticsPage() {
  const [draft, setDraft] = useState({ period: '30d', start: '', end: '' });
  const [applied, setApplied] = useState({ period: '30d' });
  const [revision, setRevision] = useState(0);
  const [validation, setValidation] = useState('');
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({ loading: true, data: null, error: '' });
    });
    securityAnalyticsApi
      .overview(applied, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ loading: false, data, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error: securityAnalyticsError(error) });
      });
    return () => controller.abort();
  }, [applied, revision]);
  function apply(event) {
    event.preventDefault();
    const error = validateSecurityRange(draft.period, draft.start, draft.end);
    setValidation(error);
    if (error) return;
    setApplied(
      draft.period === 'custom' ? { period: 'custom', start: draft.start, end: draft.end } : { period: draft.period },
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="Security operations"
        title="Security analytics"
        actions={
          <>
            <Button as={Link} to="/admin/analytics/incidents" variant="secondary">
              Incident Statistics
            </Button>
            <Button variant="secondary" disabled={state.loading} onClick={() => setRevision((value) => value + 1)}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh analytics
            </Button>
          </>
        }
      />
      <AnalyticsPeriodFilter
        draft={draft}
        applied={applied}
        setDraft={(update) => {
          setDraft(update);
          setValidation('');
        }}
        validation={validation}
        errorId="security-period-error"
        onSubmit={apply}
        subject="security analysis panels"
      />
      {state.loading && <AnalyticsLoading />}
      {state.error && (
        <Card className="p-5">
          <StatePanel
            icon={AlertCircle}
            tone="error"
            title="Security analytics unavailable"
            description={state.error}
            action={
              <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
                Try again
              </Button>
            }
          />
        </Card>
      )}
      {state.data && !state.loading && <AnalysisOverview data={state.data.analyses} range={applied} />}
    </>
  );
}
