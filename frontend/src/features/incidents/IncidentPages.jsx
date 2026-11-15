import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Button, Card, Field, Input, Select } from '../../components/ui/index.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAuth } from '../../context/auth-context.js';
import { useNotifications } from '../notifications/notification-context.js';
import { NotificationConnectionStatus } from '../notifications/NotificationBell.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import {
  createIncidentFlow,
  statuses,
  categories,
  sources,
  severities,
  label,
  queuePosture,
  severityTone,
} from './incident-flow.js';
import { severityInfo } from './incident-severity.js';
import { IncidentAssessment } from './IncidentAssessment.jsx';
import { AssigneeFeedback, AssigneeOptions, IncidentActions } from './IncidentActions.jsx';
import {
  IncidentFeedback,
  IncidentHistory,
  IncidentNotes,
  IncidentOverview,
  IncidentPager,
  IncidentResults,
  IncidentTone,
} from './IncidentComponents.jsx';

// Administrators land on the triage view: open incidents, most severe and longest-waiting first.
const ADMIN_QUEUE = Object.freeze({ view: 'open', sort: 'priority' });
const QUEUE_VIEWS = [
  ['open', 'Open', 'open'],
  ['unassigned', 'Unassigned', 'unassigned'],
  ['mine', 'Assigned to me', 'mine'],
  ['closed', 'Closed', 'closed'],
  ['all', 'All', 'total'],
];
const ADVANCED = ['status', 'type', 'source', 'assigneeId', 'createdFrom', 'createdTo'];

function useIncidentFlow(admin, id, initialFilters) {
  const notifications = useNotifications();
  const [flow] = useState(() => createIncidentFlow({ admin, id, initialFilters }));
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  useEffect(() => {
    void flow.load();
    if (admin) void flow.assignees();
    return () => flow.clear();
  }, [flow, admin]);
  useEffect(
    () =>
      notifications?.subscribeIncidents(() => {
        void flow.liveRefresh();
      }),
    [notifications, flow],
  );
  return [state, flow];
}
export function IncidentListPage({ admin = false }) {
  const { user } = useAuth();
  return <IncidentList key={`${user.id}:${admin}`} admin={admin} />;
}
function QueuePosture({ summary, onShow }) {
  const posture = queuePosture(summary);
  const { Icon, short } = severityInfo(posture);
  const count = summary?.openBySeverity?.[posture] ?? 0;
  return (
    <div className="incident-posture" role="status">
      <span className="incident-hero-icon">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="incident-hero-eyebrow">Queue posture</p>
        <p className="mt-0.5 text-base font-bold sm:text-lg">
          {!summary
            ? 'Queue counts are unavailable'
            : posture === 'NEUTRAL'
              ? 'No open incidents are waiting for review'
              : `${short} — ${count} open ${short.toLowerCase()}-risk incident${count === 1 ? '' : 's'}`}
        </p>
        {summary && (
          <p className="mt-1 text-sm opacity-90">
            {summary.open} open · {summary.unassigned} unassigned · {summary.status.NEW} new
          </p>
        )}
      </div>
      {posture !== 'NEUTRAL' && (
        <Button variant="secondary" size="sm" onClick={() => onShow(posture)}>
          Show {short.toLowerCase()} incidents
        </Button>
      )}
    </div>
  );
}
function IncidentList({ admin }) {
  const [state, flow] = useIncidentFlow(admin, null, admin ? ADMIN_QUEUE : {});
  const [filters, setFilters] = useState(admin ? ADMIN_QUEUE : {});
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const apply = (patch = {}) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    void flow.load(next, 1);
  };
  const summary = state.summary;
  const posture = admin ? queuePosture(summary) : 'NEUTRAL';
  const advancedCount = ADVANCED.filter((key) => filters[key]).length;
  return (
    <IncidentTone severity={posture} className="incident-page">
      <PageHeader
        eyebrow={admin ? 'Security operations' : 'Your security reports'}
        title={admin ? 'Incident Queue' : 'My Incidents'}
        description={
          admin
            ? 'Triage open incidents by severity and waiting time, then assign and investigate.'
            : 'Follow your security reports and updates from the IT/security team.'
        }
        actions={
          <Button variant="secondary" disabled={state.loading} onClick={() => flow.load()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      {admin ? (
        <>
          <QueuePosture summary={summary} onShow={(severity) => apply({ view: 'open', severity })} />
          <Card className="mb-6 p-4 sm:p-5">
            <div className="incident-views" role="group" aria-label="Queue view">
              {QUEUE_VIEWS.map(([view, title, countKey]) => (
                <button
                  key={view}
                  type="button"
                  className="incident-view"
                  aria-pressed={(filters.view ?? 'all') === view}
                  disabled={state.loading}
                  onClick={() => apply({ view })}
                >
                  {title}
                  {summary && <span className="incident-view-count">{summary[countKey]}</span>}
                </button>
              ))}
            </div>
            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault();
                apply();
              }}
            >
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 basis-64">
                  <Field
                    id="incident-search"
                    label="Search incidents"
                    hint="Reference or number, incident title, or employee name."
                  >
                    {(props) => (
                      <Input
                        {...props}
                        type="search"
                        placeholder="INC-2026-000123, phishing, employee name…"
                        maxLength={100}
                        value={filters.search ?? ''}
                        onChange={(e) => update('search', e.target.value)}
                      />
                    )}
                  </Field>
                </div>
                <Button type="submit" disabled={state.loading} className="mb-6">
                  <Search className="size-4" aria-hidden="true" />
                  Search
                </Button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2" role="group" aria-label="Severity filter">
                <button
                  type="button"
                  className="incident-chip"
                  aria-pressed={!filters.severity}
                  disabled={state.loading}
                  onClick={() => apply({ severity: '' })}
                >
                  All severities
                </button>
                {severities.map((severity) => (
                  <button
                    key={severity}
                    type="button"
                    className="incident-chip incident-tone"
                    data-severity={severity}
                    aria-pressed={filters.severity === severity}
                    disabled={state.loading}
                    onClick={() => apply({ severity })}
                  >
                    {severityInfo(severity).short}
                    {summary && (filters.view ?? 'all') === 'open' && (
                      <span className="incident-view-count">{summary.openBySeverity[severity]}</span>
                    )}
                  </button>
                ))}
              </div>
              <details className="incident-filters">
                <summary>
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  More filters and sorting
                  {advancedCount > 0 && <span className="incident-view-count">{advancedCount} active</span>}
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['status', 'Status', statuses, 'All statuses'],
                    ['type', 'Category', categories, 'All categories'],
                    ['source', 'Source', sources, 'All sources'],
                  ].map(([key, title, values, all]) => (
                    <Field key={key} id={`filter-${key}`} label={title}>
                      {(props) => (
                        <Select {...props} value={filters[key] ?? ''} onChange={(e) => update(key, e.target.value)}>
                          <option value="">{all}</option>
                          {values.map((value) => (
                            <option key={value} value={value}>
                              {label(value)}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  ))}
                  <Field id="filter-assignee" label="Assignment">
                    {(props) => (
                      <Select
                        {...props}
                        value={filters.assigneeId ?? ''}
                        onChange={(e) => update('assigneeId', e.target.value)}
                      >
                        <option value="">All assignments</option>
                        <option value="unassigned">Unassigned</option>
                        <AssigneeOptions state={state} />
                      </Select>
                    )}
                  </Field>
                  {[
                    ['createdFrom', 'Created from (UTC)'],
                    ['createdTo', 'Created through (UTC)'],
                  ].map(([key, title]) => (
                    <Field key={key} id={`filter-${key}`} label={title}>
                      {(props) => (
                        <Input
                          {...props}
                          type="date"
                          value={filters[key] ?? ''}
                          onChange={(e) => update(key, e.target.value)}
                        />
                      )}
                    </Field>
                  ))}
                  <Field
                    id="incident-sort"
                    label="Sort all matching incidents"
                    hint="Sorting applies before pagination."
                  >
                    {(props) => (
                      <Select
                        {...props}
                        value={filters.sort ?? 'created_desc'}
                        onChange={(e) => update('sort', e.target.value)}
                      >
                        <option value="priority">Triage priority</option>
                        <option value="created_desc">Newest created</option>
                        <option value="created_asc">Oldest created</option>
                        <option value="severity_desc">Highest severity</option>
                        <option value="updated_desc">Last updated</option>
                      </Select>
                    )}
                  </Field>
                </div>
                <AssigneeFeedback state={state} flow={flow} />
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button type="submit" disabled={state.loading}>
                    Apply filters
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={state.loading}
                    onClick={() => {
                      setFilters(ADMIN_QUEUE);
                      void flow.load(ADMIN_QUEUE, 1);
                    }}
                  >
                    Reset to open queue
                  </Button>
                </div>
              </details>
            </form>
          </Card>
        </>
      ) : (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="w-full max-w-xs">
            <Field id="filter-status" label="Filter by status">
              {(props) => (
                <Select
                  {...props}
                  value={filters.status ?? ''}
                  onChange={(event) => apply({ status: event.target.value })}
                >
                  <option value="">All incidents</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {summary && (
            <p className="text-sm text-slate-600" role="status">
              <strong className="text-slate-900">{summary.open}</strong> open ·{' '}
              <strong className="text-slate-900">{summary.closed}</strong> closed
            </p>
          )}
        </div>
      )}
      {!state.list && <IncidentFeedback loading={state.loading} error={state.error} retry={() => flow.load()} />}
      {state.list && state.error && <IncidentFeedback error={state.error} retry={() => flow.load()} />}
      {state.list && !state.error && (
        <Card className="p-4 sm:p-5" aria-busy={state.loading}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">
              {admin ? 'Incident queue' : 'Your incidents'}
              {Number.isInteger(state.list.total) && (
                <span className="ml-2 text-sm font-medium text-slate-500">{state.list.total} matching</span>
              )}
            </h2>
            <p className="text-xs text-slate-500">
              <NotificationConnectionStatus /> · {state.loading ? 'Updating…' : 'Updates as incidents change'}
            </p>
          </div>
          <div className={state.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <IncidentResults items={state.list.items} admin={admin} />
          </div>
          <IncidentPager
            result={state.list}
            disabled={state.loading}
            onPage={(page) => flow.load(state.filters, page)}
          />
        </Card>
      )}
    </IncidentTone>
  );
}
export function IncidentDetailPage({ admin = false }) {
  const { id } = useParams();
  const { user } = useAuth();
  return <IncidentDetail key={`${user.id}:${admin}:${id}`} admin={admin} id={id} userId={user.id} />;
}
function IncidentDetail({ admin, id, userId }) {
  const [state, flow] = useIncidentFlow(admin, id);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const refresh = () => {
    if (state.editing) setConfirmRefresh(true);
    else void flow.load();
  };
  const incident = state.data?.incident;
  return (
    <IncidentTone severity={severityTone(incident?.severity)} className="incident-page">
      <Button as={Link} to={admin ? '/admin/incidents' : '/incidents'} variant="ghost" className="mb-4">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {admin ? 'Back to incident queue' : 'Back to my incidents'}
      </Button>
      <PageHeader
        eyebrow={admin ? 'Investigation workspace' : 'Incident tracking'}
        title={incident?.reference ?? 'Incident details'}
        description={
          admin ? 'Review the record and coordinate the next step.' : 'Current status and updates shared with you.'
        }
        actions={
          <Button variant="secondary" disabled={state.loading || state.busy} onClick={refresh}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh incident
          </Button>
        }
      />
      <p className="mb-4 text-xs text-slate-500">
        <NotificationConnectionStatus />
      </p>
      {state.livePending && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-warning-300 bg-warning-50 p-4 text-sm text-warning-900"
        >
          Updates are available. Your draft and its original version are preserved.{' '}
          <Button variant="ghost" onClick={refresh}>
            Review latest incident
          </Button>
        </p>
      )}
      {state.liveRefreshing && (
        <p role="status" className="mb-4 text-xs text-slate-500">
          Updating incident…
        </p>
      )}
      {state.message && (
        <p role="status" className="incident-note-panel mb-5 text-sm leading-6">
          {state.message}
        </p>
      )}
      <IncidentFeedback loading={state.loading} error={state.error} title="Loading incident details…" retry={refresh} />
      {incident && !state.loading && (
        <div className={`grid items-start gap-6 ${admin ? 'xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]' : ''}`}>
          <div className="min-w-0 space-y-6">
            <IncidentOverview incident={incident} admin={admin} />
            <IncidentAssessment assessment={incident.assessment} admin={admin} />
            {['history', 'notes'].map((kind) => (
              <Card key={kind} className="p-5 sm:p-6">
                <h2 className="mb-5 text-lg font-bold">
                  {kind === 'history'
                    ? 'Incident timeline'
                    : admin
                      ? 'Investigation notes & shared updates'
                      : 'Updates from your security team'}
                </h2>
                <IncidentFeedback
                  loading={state[`${kind}Loading`]}
                  error={state[`${kind}Error`]}
                  title={`Loading ${kind}…`}
                  retry={() => flow.section(kind, 1)}
                />
                {state[kind] && (
                  <>
                    {kind === 'history' ? (
                      <IncidentHistory items={state.history.items} admin={admin} />
                    ) : (
                      <IncidentNotes items={state.notes.items} admin={admin} />
                    )}
                    <IncidentPager
                      result={state[kind]}
                      name={kind}
                      disabled={state.busy}
                      onPage={(page) => flow.section(kind, page)}
                    />
                  </>
                )}
              </Card>
            ))}
          </div>
          {admin && <IncidentActions key={incident.updatedAt} state={state} flow={flow} currentUserId={userId} />}
        </div>
      )}
      <Modal
        open={confirmRefresh}
        onClose={() => setConfirmRefresh(false)}
        title="Discard draft and refresh?"
        description="Refreshing replaces your unsaved assignment, status selection and note with the latest incident state."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRefresh(false)}>
              Keep editing
            </Button>
            <Button
              onClick={() => {
                setConfirmRefresh(false);
                void flow.load();
              }}
            >
              Discard draft and refresh
            </Button>
          </>
        }
      />
    </IncidentTone>
  );
}
