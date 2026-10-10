import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { Button, Card, Field, Input, Select } from '../../components/ui/index.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAuth } from '../../context/auth-context.js';
import { createIncidentFlow, statuses, categories, sources, label } from './incident-flow.js';
import { IncidentAssessment } from './IncidentAssessment.jsx';
import { AssigneeFeedback, AssigneeOptions, IncidentActions } from './IncidentActions.jsx';
import { IncidentFeedback, IncidentHistory, IncidentNotes, IncidentOverview, IncidentPager, IncidentResults } from './IncidentComponents.jsx';

function useIncidentFlow(admin, id) {
  const [flow] = useState(() => createIncidentFlow({ admin, id }));
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  useEffect(() => { void flow.load(); if (admin) void flow.assignees(); return () => flow.clear(); }, [flow, admin]);
  return [state, flow];
}
export function IncidentListPage({ admin = false }) {
  const { user } = useAuth();
  return <IncidentList key={`${user.id}:${admin}`} admin={admin} />;
}
function IncidentList({ admin }) {
  const [state, flow] = useIncidentFlow(admin);
  const [filters, setFilters] = useState({});
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return <><PageHeader eyebrow={admin ? 'Security operations' : 'Your security reports'} title={admin ? 'Incident Queue' : 'My Incidents'} description={admin ? 'Review reported concerns, coordinate investigations and keep employees informed.' : 'Follow your security reports and updates from the IT/security team.'} actions={<Button variant="secondary" disabled={state.loading} onClick={() => flow.load()}><RefreshCw className="size-4" aria-hidden="true" />Refresh</Button>} />
    <Card className="mb-6 p-5"><form onSubmit={(event) => { event.preventDefault(); void flow.load(filters, 1); }}><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Field id="incident-reference" label="Incident reference" hint="Search using the complete reference.">{(props) => <Input {...props} type="search" placeholder="INC-2026-000123" maxLength={25} value={filters.reference ?? ''} onChange={(e) => update('reference', e.target.value.toUpperCase())} />}</Field>{[['severity', 'Severity', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']], ['status', 'Status', statuses], ['type', 'Category', categories], ['source', 'Source', sources]].map(([key, title, values]) => <Field key={key} id={`filter-${key}`} label={title}>{(props) => <Select {...props} value={filters[key] ?? ''} onChange={(e) => update(key, e.target.value)}><option value="">All {title.toLowerCase()}</option>{values.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select>}</Field>)}{admin && <Field id="filter-assignee" label="Assignment">{(props) => <Select {...props} value={filters.assigneeId ?? ''} onChange={(e) => update('assigneeId', e.target.value)}><option value="">All assignments</option><option value="unassigned">Unassigned</option><AssigneeOptions state={state} /></Select>}</Field>}{[['createdFrom', 'Created from (UTC)'], ['createdTo', 'Created through (UTC)']].map(([key, title]) => <Field key={key} id={`filter-${key}`} label={title}>{(props) => <Input {...props} type="date" value={filters[key] ?? ''} onChange={(e) => update(key, e.target.value)} />}</Field>)}<Field id="incident-sort" label="Sort all matching incidents" hint="Sorting applies before pagination.">{(props) => <Select {...props} value={filters.sort ?? 'created_desc'} onChange={(e) => update('sort', e.target.value)}><option value="created_desc">Newest created</option><option value="created_asc">Oldest created</option><option value="severity_desc">Highest severity</option><option value="updated_desc">Last updated</option></Select>}</Field></div>{admin && <AssigneeFeedback state={state} flow={flow} />}<div className="mt-5 flex flex-wrap gap-2"><Button type="submit" disabled={state.loading}>Apply filters</Button><Button variant="ghost" disabled={state.loading} onClick={() => { setFilters({}); void flow.load({}, 1); }}>Clear filters</Button></div></form></Card>
    <IncidentFeedback loading={state.loading} error={state.error} retry={() => flow.load()} />{state.list && !state.loading && !state.error && <Card className="p-4 sm:p-5"><div className="mb-4 flex flex-wrap justify-between gap-2"><h2 className="font-bold">{admin ? 'Incident queue' : 'Your incidents'}</h2><p className="text-xs text-slate-500">Manual refresh · Sorted across all matching results</p></div><IncidentResults items={state.list.items} admin={admin} /><IncidentPager result={state.list} onPage={(page) => flow.load(state.filters, page)} /></Card>}</>;
}
export function IncidentDetailPage({ admin = false }) {
  const { id } = useParams(); const { user } = useAuth();
  return <IncidentDetail key={`${user.id}:${admin}:${id}`} admin={admin} id={id} />;
}
function IncidentDetail({ admin, id }) {
  const [state, flow] = useIncidentFlow(admin, id);
  const incident = state.data?.incident;
  return <><Button as={Link} to={admin ? '/admin/incidents' : '/incidents'} variant="ghost" className="mb-4">← {admin ? 'Back to incident queue' : 'Back to my incidents'}</Button><PageHeader eyebrow={admin ? 'Investigation workspace' : 'Incident tracking'} title={incident?.reference ?? 'Incident details'} description={admin ? 'Review the record and coordinate the next step.' : 'Current status and updates shared with you.'} actions={<Button variant="secondary" disabled={state.loading || state.busy} onClick={() => flow.load()}><RefreshCw className="size-4" aria-hidden="true" />Refresh incident</Button>} />{state.message && <p role="status" className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-brand-900">{state.message}</p>}<IncidentFeedback loading={state.loading} error={state.error} title="Loading incident details…" retry={() => flow.load()} />
    {incident && !state.loading && <div className={`grid items-start gap-6 ${admin ? 'xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]' : ''}`}><div className="min-w-0 space-y-6"><IncidentOverview incident={incident} admin={admin} /><IncidentAssessment assessment={incident.assessment} admin={admin} />{['history', 'notes'].map((kind) => <Card key={kind} className="p-5 sm:p-6"><h2 className="mb-5 text-lg font-bold">{kind === 'history' ? 'Incident timeline' : admin ? 'Investigation notes & shared updates' : 'Updates from your security team'}</h2><IncidentFeedback loading={state[`${kind}Loading`]} error={state[`${kind}Error`]} title={`Loading ${kind}…`} retry={() => flow.section(kind, 1)} />{state[kind] && <>{kind === 'history' ? <IncidentHistory items={state.history.items} admin={admin} /> : <IncidentNotes items={state.notes.items} admin={admin} />}<IncidentPager result={state[kind]} name={kind} disabled={state.busy} onPage={(page) => flow.section(kind, page)} /></>}</Card>)}</div>{admin && <IncidentActions key={incident.updatedAt} state={state} flow={flow} />}</div>}</>;
}
