import { Link } from 'react-router';
import { UserIdentity, CopyIdentifier } from '../../components/UserIdentity.jsx';
import { AlertTriangle, ChevronRight, Clock, ShieldAlert, UserRoundX } from 'lucide-react';
import { Badge, Button, Card, StatePanel } from '../../components/ui/index.jsx';
import { elapsedLabel, isOpen, label, lifecycle, severityTone, visibleNotes } from './incident-flow.js';
import { severityInfo } from './incident-severity.js';

export function IncidentTone({ severity, className = '', children, ...props }) {
  return (
    <div className={`incident-tone ${className}`.trim()} data-severity={severityTone(severity)} {...props}>
      {children}
    </div>
  );
}
export function IncidentTime({ value }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <span>Unavailable</span>;
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}
    </time>
  );
}
const statusTones = {
  NEW: 'warning',
  UNDER_INVESTIGATION: 'brand',
  CONTAINED: 'brand',
  RESOLVED: 'success',
  CLOSED: 'success',
  FALSE_POSITIVE: 'neutral',
};
export function IncidentStatus({ value }) {
  return <Badge tone={statusTones[value] ?? 'neutral'}>{label(value)}</Badge>;
}
export function IncidentRisk({ incident }) {
  const tone = severityTone(incident.severity);
  if (tone === 'NEUTRAL') return <Badge>Risk unavailable</Badge>;
  const { label: text, Icon } = severityInfo(tone);
  return (
    <span className="incident-severity incident-tone" data-severity={tone}>
      <Icon className="size-3.5" aria-hidden="true" />
      {text}
    </span>
  );
}
export function IncidentFeedback({ loading, error, retry, title = 'Loading incidents…' }) {
  if (loading)
    return (
      <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        <span className="mb-4 block h-2 w-24 animate-pulse rounded bg-brand-200" />
        {title}
      </div>
    );
  if (error)
    return (
      <div role="alert">
        <StatePanel
          icon={AlertTriangle}
          tone="error"
          title="Unable to complete request"
          description={error}
          action={
            <Button variant="secondary" onClick={retry}>
              Retry / refresh
            </Button>
          }
        />
      </div>
    );
  return null;
}
export function IncidentPager({ result, onPage, disabled = false, name = 'Incidents' }) {
  if (!result) return null;
  const first = (result.page - 1) * result.pageSize + 1;
  return (
    <nav
      aria-label={`${name} pagination`}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm"
    >
      <p className="text-slate-500" role="status">
        {Number.isInteger(result.total) && result.items.length
          ? `Showing ${first}–${first + result.items.length - 1} of ${result.total}`
          : `Page ${result.page} · ${result.items.length} shown`}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || result.page <= 1}
          onClick={() => onPage(result.page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || !result.hasMore || result.page >= 10000}
          onClick={() => onPage(result.page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
function Urgency({ incident }) {
  const urgency = isOpen(incident) && severityInfo(incident.severity).urgency;
  return urgency ? (
    <span className="incident-urgency">
      <AlertTriangle className="size-3.5" aria-hidden="true" />
      {urgency}
    </span>
  ) : null;
}
function Waiting({ incident }) {
  const open = isOpen(incident);
  const elapsed = elapsedLabel(incident.createdAt, open ? undefined : (incident.closedAt ?? incident.resolvedAt));
  if (!elapsed) return null;
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
      <Clock className="size-3.5" aria-hidden="true" />
      {open ? `Open for ${elapsed}` : `Handled in ${elapsed}`}
    </span>
  );
}
export function IncidentResults({ items, admin }) {
  const root = admin ? '/admin/incidents' : '/incidents';
  if (!items.length)
    return (
      <StatePanel
        icon={ShieldAlert}
        title="No incidents found"
        description="There are no incidents matching this view. Try another view, clear your filters or refresh later."
      />
    );
  return (
    <ul className="incident-queue" aria-label={admin ? 'Security incident queue' : 'Your reported incidents'}>
      {items.map((row) => {
        const to = `${root}/${encodeURIComponent(row.id)}`;
        return (
          <li
            key={row.id}
            className="incident-row incident-tone"
            data-severity={severityTone(row.severity)}
            data-open={isOpen(row)}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <IncidentRisk incident={row} />
                <IncidentStatus value={row.status} />
                {admin && <Urgency incident={row} />}
              </div>
              <Link className="incident-row-reference" to={to}>
                {row.reference}
              </Link>
              <p className="mt-0.5 break-words text-sm font-medium text-slate-800">{row.title}</p>
              <p className="mt-1.5 text-xs text-slate-500">
                {label(row.type)} · {label(row.detectionSource)}
                {Number.isInteger(row.riskScore) ? ` · Score ${row.riskScore}/100` : ''}
              </p>
            </div>
            {admin && (
              <div className="incident-row-people">
                <div className="min-w-0">
                  <p className="incident-row-label">Associated employee</p>
                  <UserIdentity user={row.reporter} userId={row.reporterId} department={row.department} />
                </div>
                <div className="min-w-0">
                  <p className="incident-row-label">Assigned administrator</p>
                  {row.assignee || row.assigneeId ? (
                    <UserIdentity user={row.assignee} userId={row.assigneeId} />
                  ) : (
                    <span className="incident-unassigned" data-open={isOpen(row)}>
                      <UserRoundX className="size-3.5" aria-hidden="true" />
                      Unassigned
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="incident-row-time">
              <Waiting incident={row} />
              <p>
                Created <IncidentTime value={row.createdAt} />
              </p>
              <p>
                Updated <IncidentTime value={row.updatedAt} />
              </p>
            </div>
            <Link className="incident-row-open" to={to} aria-label={`Open ${row.reference}`}>
              <ChevronRight className="size-5" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
function Lifecycle({ status }) {
  const steps = lifecycle(status);
  const current = steps.indexOf(status);
  if (current < 0) return null;
  return (
    <div className="incident-lifecycle-wrap">
      <p className="incident-row-label">
        Lifecycle stage {current + 1} of {steps.length}
      </p>
      <ol className="incident-lifecycle">
        {steps.map((step, index) => (
          <li
            key={step}
            data-state={index < current ? 'earlier' : index === current ? 'current' : 'later'}
            aria-current={index === current ? 'step' : undefined}
          >
            <span aria-hidden="true" />
            {label(step)}
          </li>
        ))}
      </ol>
    </div>
  );
}
export function IncidentOverview({ incident, admin }) {
  const { label: severityLabel, Icon } = severityInfo(incident.severity);
  const score =
    Number.isInteger(incident.riskScore) && incident.riskScore >= 0 && incident.riskScore <= 100
      ? incident.riskScore
      : null;
  const facts = [
    ['Source', label(incident.detectionSource)],
    ['Category', label(incident.type)],
    ['Created', <IncidentTime value={incident.createdAt} />],
    ['Last updated', <IncidentTime value={incident.updatedAt} />],
    ...(incident.resolvedAt ? [['Resolved', <IncidentTime value={incident.resolvedAt} />]] : []),
    ...(incident.closedAt ? [['Closed', <IncidentTime value={incident.closedAt} />]] : []),
    ...(admin
      ? [
          [
            'Assigned administrator',
            incident.assignee || incident.assigneeId ? (
              <UserIdentity user={incident.assignee} userId={incident.assigneeId} />
            ) : (
              'Unassigned'
            ),
          ],
          [
            'Reported By / Associated Employee',
            <UserIdentity user={incident.reporter} userId={incident.reporterId} department={incident.department} />,
          ],
          ['Incident ID', <CopyIdentifier value={incident.id} label="Incident ID" />],
        ]
      : []),
  ];
  return (
    <Card className="overflow-hidden">
      <div className="incident-hero">
        <span className="incident-hero-icon">
          <Icon className="size-7" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="incident-hero-eyebrow">
            {severityLabel} · {label(incident.status)}
            {isOpen(incident) && severityInfo(incident.severity).urgency
              ? ` · ${severityInfo(incident.severity).urgency}`
              : ''}
          </p>
          <h2 className="mt-1 break-words text-xl font-bold sm:text-2xl">{incident.title}</h2>
        </div>
        <div className="incident-hero-score">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Risk score</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums">{score === null ? 'Unavailable' : `${score} / 100`}</p>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <IncidentRisk incident={incident} />
          <IncidentStatus value={incident.status} />
        </div>
        <Lifecycle status={incident.status} />
        {admin && incident.description && (
          <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
            {incident.description}
          </p>
        )}
        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          {facts.map(([title, value]) => (
            <div key={title}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</dt>
              <dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="incident-note-panel mt-6">
          <h3 className="text-sm font-bold">Recorded risk assessment</h3>
          <p className="mt-2 text-sm">
            Risk score: {score === null ? 'Unavailable' : `${score} / 100`}
            {admin && incident.riskRuleVersion ? ` · Model version ${incident.riskRuleVersion}` : ''}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Severity reflects the recorded risk assessment and requires human review. It is not proof of maliciousness.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Available historical explanations, evidence and saved guidance appear below. Missing records are explicitly
            marked unavailable.
          </p>
        </div>
        {!admin && (
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Follow updates from your security team below. For urgent help, use your organization’s approved IT/security
            reporting channel.
          </p>
        )}
      </div>
    </Card>
  );
}
export function IncidentHistory({ items, admin }) {
  const safe = admin
    ? items
    : items.filter((item) => ['CREATED', 'STATUS_CHANGED', 'SEVERITY_CHANGED'].includes(item.type));
  return safe.length ? (
    <ol className="incident-timeline">
      {safe.map((item) => (
        <li key={item.id} className="relative">
          <span className="incident-timeline-dot" />
          <p className="text-sm font-bold">{label(item.type)}</p>
          {item.type === 'STATUS_CHANGED' && (
            <p className="mt-1 text-sm text-slate-600">
              {label(item.details?.fromStatus)} → {label(item.details?.toStatus)}
            </p>
          )}
          {item.type === 'SEVERITY_CHANGED' && item.details?.toSeverity && (
            <p className="mt-1 text-sm text-slate-600">
              {label(item.details.fromSeverity)} → {label(item.details.toSeverity)}
              {item.exposure === 'CREDENTIALS_SUBMITTED' ? ' · credential exposure reported by the employee' : ''}
            </p>
          )}
          {item.type === 'CREATED' && item.details?.status && (
            <p className="mt-1 text-sm text-slate-600">{label(item.details.status)}</p>
          )}
          {admin && item.type === 'ASSIGNED' && (
            <p className="mt-1 text-sm text-slate-600">
              {item.assignment?.assigneeId ? 'Assigned to a security administrator' : 'Assignment removed'}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            <IncidentTime value={item.createdAt} />
          </p>
          {admin && (
            <div className="mt-2">
              <UserIdentity user={item.actor} userId={item.actorId} kind={item.actorKind} showRole />
            </div>
          )}
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-sm text-slate-500">No history available.</p>
  );
}
export function IncidentNotes({ items, admin }) {
  const notes = visibleNotes(items, admin);
  return notes.length ? (
    <ul className="space-y-4">
      {notes.map((note) => (
        <li
          key={note.id}
          className={`rounded-xl border p-4 ${admin && note.visibility === 'SECURITY_TEAM' ? 'border-slate-200 bg-slate-50' : 'border-brand-200 bg-brand-50/40'}`}
        >
          <Badge tone={note.visibility === 'SECURITY_TEAM' ? 'neutral' : 'brand'}>
            {admin && note.visibility === 'SECURITY_TEAM' ? 'Internal · Security team only' : 'Employee-visible update'}
          </Badge>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{note.body}</p>
          <p className="mt-3 text-xs text-slate-500">
            <IncidentTime value={note.createdAt} />
          </p>
          {admin && (
            <div className="mt-2">
              <UserIdentity user={note.author} userId={note.authorId} showRole />
            </div>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-slate-500">
      {admin ? 'No investigation notes yet.' : 'No updates have been shared with you yet.'}
    </p>
  );
}
