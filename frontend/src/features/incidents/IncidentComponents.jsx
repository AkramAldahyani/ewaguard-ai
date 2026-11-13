import { Link } from 'react-router';
import { UserIdentity, CopyIdentifier } from '../../components/UserIdentity.jsx';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Badge, Button, Card, RiskBadge, StatePanel } from '../../components/ui/index.jsx';
import { label, personName, visibleNotes } from './incident-flow.js';

export function IncidentTime({ value }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <span>Unavailable</span>;
  return <time dateTime={value}>{new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>;
}
export function IncidentStatus({ value }) {
  return <Badge tone={['CLOSED', 'RESOLVED'].includes(value) ? 'success' : value === 'NEW' ? 'warning' : 'neutral'}>{label(value)}</Badge>;
}
export function IncidentRisk({ incident }) {
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(incident.severity)
    ? <RiskBadge level={incident.severity} /> : <Badge>Risk unavailable</Badge>;
}
export function IncidentFeedback({ loading, error, retry, title = 'Loading incidents…' }) {
  if (loading) return <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600"><span className="mb-4 block h-2 w-24 animate-pulse rounded bg-brand-200" />{title}</div>;
  if (error) return <div role="alert"><StatePanel icon={AlertTriangle} tone="error" title="Unable to complete request" description={error} action={<Button variant="secondary" onClick={retry}>Retry / refresh</Button>} /></div>;
  return null;
}
export function IncidentPager({ result, onPage, disabled = false, name = 'Incidents' }) {
  if (!result) return null;
  return <nav aria-label={`${name} pagination`} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm"><p className="text-slate-500">Page {result.page} · {result.items.length} shown</p><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={disabled || result.page <= 1} onClick={() => onPage(result.page - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={disabled || !result.hasMore || result.page >= 10000} onClick={() => onPage(result.page + 1)}>Next</Button></div></nav>;
}
function Urgency({ incident }) {
  return ['HIGH', 'CRITICAL'].includes(incident.severity) && !['CLOSED', 'RESOLVED', 'FALSE_POSITIVE'].includes(incident.status)
    ? <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-danger-700"><AlertTriangle className="size-3.5" aria-hidden="true" />{incident.severity === 'CRITICAL' ? 'Immediate review' : 'Priority review'}</span> : null;
}
export function IncidentResults({ items, admin }) {
  const root = admin ? '/admin/incidents' : '/incidents';
  if (!items.length) return <StatePanel icon={ShieldAlert} title="No incidents found" description="There are no incidents matching this view. Try clearing your filters or refresh later." />;
  const reference = (row) => <><Link className="font-bold text-brand-700 underline-offset-4 hover:underline" to={`${root}/${encodeURIComponent(row.id)}`}>{row.reference}</Link><p className="mt-1 max-w-64 break-words text-sm text-slate-600">{row.title}</p>{admin && <Urgency incident={row} />}</>;
  return <><div className="hidden overflow-x-auto xl:block"><table className="w-full text-left text-sm"><caption className="sr-only">{admin ? 'Security incident queue' : 'Your reported incidents'}</caption><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Incident', 'Risk / status', 'Category / source', ...(admin ? ['Associated employee', 'Assigned administrator'] : []), 'Dates'].map((heading) => <th key={heading} scope="col" className="px-4 py-4">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{items.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/60"><td className="px-4 py-5">{reference(row)}</td><td className="space-y-2 px-4 py-5"><IncidentRisk incident={row} /><div><IncidentStatus value={row.status} /></div></td><td className="px-4 py-5"><p>{label(row.type)}</p><p className="mt-1 text-xs text-slate-500">{label(row.detectionSource)}</p></td>{admin && <><td className="min-w-56 px-4 py-5"><UserIdentity user={row.reporter} userId={row.reporterId} department={row.department} /></td><td className="px-4 py-5">{row.assignee || row.assigneeId ? <UserIdentity user={row.assignee} userId={row.assigneeId} /> : 'Unassigned'}</td></>}<td className="space-y-2 px-4 py-5 text-xs text-slate-500"><p>Created <IncidentTime value={row.createdAt} /></p><p>Updated <IncidentTime value={row.updatedAt} /></p></td></tr>)}</tbody></table></div>
    <ul className="grid gap-4 xl:hidden">{items.map((row) => <li key={row.id} className="rounded-xl border border-slate-200 p-4"><div>{reference(row)}</div><div className="my-4 flex flex-wrap gap-2"><IncidentRisk incident={row} /><IncidentStatus value={row.status} /></div><p className="text-sm text-slate-600">{label(row.type)} · {label(row.detectionSource)}</p>{admin && <div className="mt-3 space-y-3"><div><p className="mb-1 text-xs text-slate-500">Associated employee</p><UserIdentity user={row.reporter} userId={row.reporterId} department={row.department} /></div><p className="text-sm font-medium">Assigned administrator: {personName(row.assignee)}</p></div>}<div className="mt-3 space-y-1 text-xs leading-5 text-slate-500"><p>Created <IncidentTime value={row.createdAt} /></p><p>Updated <IncidentTime value={row.updatedAt} /></p></div></li>)}</ul></>;
}
export function IncidentOverview({ incident, admin }) {
  const facts = [['Source', label(incident.detectionSource)], ['Category', label(incident.type)],
    ['Created', <IncidentTime value={incident.createdAt} />], ['Last updated', <IncidentTime value={incident.updatedAt} />],
    ...(incident.resolvedAt ? [['Resolved', <IncidentTime value={incident.resolvedAt} />]] : []),
    ...(incident.closedAt ? [['Closed', <IncidentTime value={incident.closedAt} />]] : []),
    ...(admin ? [['Assigned administrator', incident.assignee || incident.assigneeId ? <UserIdentity user={incident.assignee} userId={incident.assigneeId} /> : 'Unassigned'], ['Reported By / Associated Employee', <UserIdentity user={incident.reporter} userId={incident.reporterId} department={incident.department} />], ['Incident ID', <CopyIdentifier value={incident.id} label="Incident ID" />]] : [])];
  return <Card className="p-5 sm:p-6"><div className="flex flex-wrap items-center gap-2"><IncidentRisk incident={incident} /><IncidentStatus value={incident.status} /></div><h2 className="mt-5 break-words text-xl font-bold">{incident.title}</h2>{admin && incident.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{incident.description}</p>}<dl className="mt-6 grid gap-5 sm:grid-cols-2">{facts.map(([title, value]) => <div key={title}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd></div>)}</dl><div className="mt-6 rounded-xl border border-brand-100 bg-brand-50/60 p-4"><h3 className="text-sm font-bold">Recorded risk assessment</h3><p className="mt-2 text-sm">Risk score: {Number.isInteger(incident.riskScore) && incident.riskScore >= 0 && incident.riskScore <= 100 ? `${incident.riskScore} / 100` : 'Unavailable'}{admin && incident.riskRuleVersion ? ` · Model version ${incident.riskRuleVersion}` : ''}</p><p className="mt-2 text-sm leading-6 text-slate-600">Severity reflects the recorded risk assessment and requires human review. It is not proof of maliciousness.</p><p className="mt-2 text-xs leading-5 text-slate-500">Available historical explanations, evidence and saved guidance appear below. Missing records are explicitly marked unavailable.</p></div>{!admin && <p className="mt-4 text-sm leading-6 text-slate-600">Follow updates from your security team below. For urgent help, use your organization’s approved IT/security reporting channel.</p>}</Card>;
}
export function IncidentHistory({ items, admin }) {
  const safe = admin ? items : items.filter((item) => ['CREATED', 'STATUS_CHANGED', 'SEVERITY_CHANGED'].includes(item.type));
  return safe.length ? <ol className="space-y-5 border-l-2 border-brand-100 pl-5">{safe.map((item) => <li key={item.id} className="relative"><span className="absolute -left-[1.7rem] top-1.5 size-3 rounded-full border-2 border-white bg-brand-500" /><p className="text-sm font-bold">{label(item.type)}</p>{item.type === 'STATUS_CHANGED' && <p className="mt-1 text-sm text-slate-600">{label(item.details?.fromStatus)} → {label(item.details?.toStatus)}</p>}{item.type === 'SEVERITY_CHANGED' && item.details?.toSeverity && <p className="mt-1 text-sm text-slate-600">{label(item.details.fromSeverity)} → {label(item.details.toSeverity)}{item.exposure === 'CREDENTIALS_SUBMITTED' ? ' · credential exposure reported by the employee' : ''}</p>}{item.type === 'CREATED' && item.details?.status && <p className="mt-1 text-sm text-slate-600">{label(item.details.status)}</p>}{admin && item.type === 'ASSIGNED' && <p className="mt-1 text-sm text-slate-600">{item.assignment?.assigneeId ? 'Assigned to a security administrator' : 'Assignment removed'}</p>}<p className="mt-2 text-xs text-slate-500"><IncidentTime value={item.createdAt} /></p>{admin && <div className="mt-2"><UserIdentity user={item.actor} userId={item.actorId} kind={item.actorKind} showRole /></div>}</li>)}</ol> : <p className="text-sm text-slate-500">No history available.</p>;
}
export function IncidentNotes({ items, admin }) {
  const notes = visibleNotes(items, admin);
  return notes.length ? <ul className="space-y-4">{notes.map((note) => <li key={note.id} className={`rounded-xl border p-4 ${admin && note.visibility === 'SECURITY_TEAM' ? 'border-slate-200 bg-slate-50' : 'border-brand-200 bg-brand-50/40'}`}><Badge tone={note.visibility === 'SECURITY_TEAM' ? 'neutral' : 'brand'}>{admin && note.visibility === 'SECURITY_TEAM' ? 'Internal · Security team only' : 'Employee-visible update'}</Badge><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{note.body}</p><p className="mt-3 text-xs text-slate-500"><IncidentTime value={note.createdAt} /></p>{admin && <div className="mt-2"><UserIdentity user={note.author} userId={note.authorId} showRole /></div>}</li>)}</ul> : <p className="text-sm text-slate-500">{admin ? 'No investigation notes yet.' : 'No updates have been shared with you yet.'}</p>;
}
