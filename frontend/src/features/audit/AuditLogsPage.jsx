import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Filter, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card, Badge, Input, Select } from '../../components/ui/index.jsx';
import { CopyIdentifier, UserIdentity } from '../../components/UserIdentity.jsx';
import { apiRequest } from '../../services/api.js';

const emptyFilters = { action: '', resourceType: '', outcome: '', actorScope: '', start: '', end: '' };

export function AuditLogsPage() {
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState(emptyFilters), [applied, setApplied] = useState(emptyFilters);
  const [validation, setValidation] = useState(''), [result, setResult] = useState(null);
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  for (const [key, value] of Object.entries(applied)) if (value) query.set(key, value);
  const queryString = query.toString(), requestKey = `${queryString}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/api/admin/audit?${queryString}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setResult({ key: requestKey, data, error: '' }); })
      .catch((error) => { if (!controller.signal.aborted) setResult({ key: requestKey, data: null,
        error: error.status === 401 ? 'Your session has expired. Sign in again.' : error.status === 403
          ? 'Administrator access with verified MFA is required.' : error.status === 400
            ? 'Review the audit filters and try again.' : 'Audit logs could not be loaded. Try again.' }); });
    return () => controller.abort();
  }, [requestKey, queryString]);
  const state = result?.key === requestKey ? { ...result, loading: false } : { loading: true, data: null, error: '' };
  const hasFilters = Object.values(applied).some(Boolean);
  const update = (key) => (event) => { setDraft((current) => ({ ...current, [key]: event.target.value })); setValidation(''); };
  function applyFilters(event) {
    event.preventDefault();
    if (draft.start && draft.end && draft.start > draft.end) { setValidation('Start date must be on or before end date.'); return; }
    if (draft.start && draft.end && (Date.parse(`${draft.end}T00:00:00Z`) - Date.parse(`${draft.start}T00:00:00Z`)) / 86_400_000 > 365) {
      setValidation('Date range cannot exceed 366 days.'); return;
    }
    setApplied(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])));
    setPage(1);
  }
  function clearFilters() { setDraft(emptyFilters); setApplied(emptyFilters); setValidation(''); setPage(1); }
  return <>
    <PageHeader eyebrow="Accountability" title="Audit Logs"
      description="Recorded actions and the users or system processes responsible."
      actions={<Button variant="secondary" disabled={state.loading} onClick={() => setRevision((n) => n + 1)}><RefreshCw className="size-4" aria-hidden="true" />Refresh audit logs</Button>} />
    <p className="mb-4 text-xs text-slate-500">Actor is the person who performed the action. Account roles shown are current; historical roles are not recorded. Related resource identifies the affected record.</p>
    <Card className="mb-5 overflow-hidden">
      <form onSubmit={applyFilters}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2"><Filter className="size-4 text-brand-700" aria-hidden="true" /><div><h2 className="text-sm font-bold text-navy-900">Filter audit logs</h2><p className="mt-0.5 text-xs text-slate-500">Filters apply to all audit records, not only this page.</p></div></div>
          {hasFilters && <Badge tone="brand">Filters applied</Badge>}
        </div>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">Action contains<Input className="mt-2" value={draft.action} maxLength={100} placeholder="e.g. USER_UPDATED" onChange={update('action')} /></label>
          <label className="text-xs font-semibold text-slate-600">Resource type contains<Input className="mt-2" value={draft.resourceType} maxLength={80} placeholder="e.g. USER or INCIDENT" onChange={update('resourceType')} /></label>
          <label className="text-xs font-semibold text-slate-600">Outcome<Select className="mt-2" value={draft.outcome} onChange={update('outcome')}><option value="">All outcomes</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option><option value="DENIED">Denied</option></Select></label>
          <label className="text-xs font-semibold text-slate-600">Actor source<Select className="mt-2" value={draft.actorScope} onChange={update('actorScope')}><option value="">All actors</option><option value="USER">Named user</option><option value="NON_USER">System or unknown</option></Select></label>
          <label className="text-xs font-semibold text-slate-600">From date <span className="font-normal">(UTC)</span><Input className="mt-2" type="date" value={draft.start} max={draft.end || undefined} onChange={update('start')} /></label>
          <label className="text-xs font-semibold text-slate-600">To date <span className="font-normal">(UTC)</span><Input className="mt-2" type="date" value={draft.end} min={draft.start || undefined} onChange={update('end')} /></label>
        </div>
        {validation && <p className="mx-5 mb-4 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700" role="alert">{validation}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-4"><Button variant="ghost" disabled={!hasFilters && !Object.values(draft).some(Boolean)} onClick={clearFilters}>Clear filters</Button><Button type="submit">Apply filters</Button></div>
      </form>
    </Card>
    {state.loading && <p role="status">Loading audit logs…</p>}
    {state.error && <Card className="p-5"><p role="alert">{state.error}</p><Button className="mt-3" variant="secondary" onClick={() => setRevision((n) => n + 1)}>Try again</Button></Card>}
    {state.data && <Card className="overflow-hidden">
      {/* relative: screen-reader-only labels are absolutely positioned and must stay inside this scroll area on narrow screens */}
      <div className="relative overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">Audit logs</caption>
        <thead className="bg-slate-50"><tr>{['Log / timestamp', 'Actor / User ID', 'Action / outcome', 'Related resource'].map((title) => <th scope="col" key={title} className="px-5 py-3">{title}</th>)}</tr></thead>
        <tbody>{state.data.items.map((row) => <tr key={row.id} className="border-t border-slate-100 align-top">
          <td className="min-w-64 px-5 py-4"><CopyIdentifier value={row.id} label="Log ID" /><p className="mt-2 text-xs text-slate-500"><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time></p></td>
          <td className="min-w-64 px-5 py-4"><UserIdentity user={row.actor} userId={row.actorId} kind={row.actorKind} showRole /></td>
          <td className="px-5 py-4"><p className="mb-2 font-semibold">{row.action}</p><Badge>{row.outcome}</Badge></td>
          <td className="min-w-56 px-5 py-4"><p className="mb-1 text-xs font-semibold text-slate-500">{row.resourceType}</p><CopyIdentifier value={row.resourceId} label="Resource ID" />{row.resourceType === 'INCIDENT' && /^[0-9a-f-]{36}$/i.test(row.resourceId ?? '') && <Link className="mt-2 block font-semibold text-brand-700 underline" to={`/admin/incidents/${row.resourceId}`}>View incident</Link>}</td>
        </tr>)}</tbody>
      </table></div>
      {!state.data.items.length && <p className="p-6 text-center text-slate-500">{hasFilters ? 'No audit records match the selected filters.' : 'No audit records available.'}</p>}
      <nav aria-label="Audit pagination" className="flex items-center justify-between gap-3 border-t p-4">
        <p className="text-sm text-slate-500" role="status">Page {state.data.page} of {state.data.totalPages}</p><div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Previous</Button>
          <Button variant="secondary" disabled={!state.data.hasMore || page >= 10000} onClick={() => setPage((n) => n + 1)}>Next</Button>
        </div>
      </nav>
    </Card>}
  </>;
}
