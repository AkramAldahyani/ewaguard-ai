import { useEffect, useRef, useState } from 'react';
import { Button, Card, Select, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { apiRequest } from '../../services/api.js';
import { dateTime, label, reportError } from './community-model.js';
import { CommunityImages } from './CommunityImages.jsx';

export function AdminReportsPanel() {
  const [status, setStatus] = useState('PENDING'), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, items: [], hasMore: false, error: '' });
  const [selected, setSelected] = useState(null), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const writing = useRef(null);
  useEffect(() => () => writing.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/api/admin/community/reports?${new URLSearchParams({ status, page, pageSize: 10 })}`, { signal: controller.signal, cache: 'no-store' })
      .then((result) => { if (!controller.signal.aborted) setState({ ...result, loading: false, error: '' }); })
      .catch((error) => { if (!controller.signal.aborted) { setState({ loading: false, items: [], hasMore: false, error: reportError(error) }); setSelected(null); } });
    return () => controller.abort();
  }, [status, page, revision]);
  function refresh() { setState({ loading: true, items: [], hasMore: false, error: '' }); setRevision((value) => value + 1); }
  async function decide(event) {
    event.preventDefault(); if (writing.current || !selected) return;
    const controller = new AbortController(); writing.current = controller; setBusy(true); setNotice('');
    try {
      const { item, action } = selected;
      await apiRequest(`/api/admin/community/reports/${item.id}/resolve`, { method: 'POST', signal: controller.signal,
        body: JSON.stringify({ action, reason, expectedUpdatedAt: item.updatedAt, expectedContentUpdatedAt: (item.comment ?? item.post).updatedAt }) });
      if (!controller.signal.aborted) { setSelected(null); setReason(''); setNotice('Report resolved.'); refresh(); }
    } catch (error) {
      if (!controller.signal.aborted) { setSelected(null); setState({ loading: false, items: [], hasMore: false, error: reportError(error) }); }
    } finally { if (!controller.signal.aborted) { writing.current = null; setBusy(false); } }
  }
  return <section aria-label="Reported content" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-navy-900">Reported content</h1><p className="mt-1 text-sm text-slate-600">Review employee concerns and record the outcome.</p></div>
      <label className="text-sm font-semibold">Report status<Select value={status} disabled={busy} onChange={(event) => { setStatus(event.target.value); setPage(1); refresh(); }}>{['PENDING', 'ACTIONED', 'DISMISSED'].map((value) => <option key={value}>{value}</option>)}</Select></label><Button variant="secondary" disabled={busy} onClick={refresh}>Refresh reports</Button></div>
    {notice && <p role="status">{notice}</p>}{state.loading && <p role="status">Loading reports…</p>}
    {state.error && <p role="alert" className="text-danger-700">{state.error}</p>}
    {!state.loading && !state.error && !state.items.length && <Card className="p-8 text-center text-slate-600">No reports in this queue.</Card>}
    {state.items.map((item) => <Card key={item.id} className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold text-navy-900">{label(item.category)} · {label(item.targetType)}</h2><time className="text-xs text-slate-500">{dateTime(item.createdAt)}</time></div>
      <p className="text-sm text-slate-600">Reported by {item.reporter.firstName} {item.reporter.lastName}</p>
      {item.details && <p className="whitespace-pre-wrap break-words text-sm">{item.details}</p>}
      <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Post by {item.post.author.name} · {label(item.post.status)}</p><h3 className="mt-2 font-semibold">{item.post.title}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.post.body}</p><CommunityImages images={item.post.images} admin />
        {item.comment && <div className="mt-4 border-l-2 border-brand-200 pl-4"><p className="text-xs font-semibold">Reported comment by {item.comment.author.firstName} {item.comment.author.lastName} · {label(item.comment.status)}</p>{item.comment.parent && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-500">Reply to: {item.comment.parent.body || 'Deleted comment'}</p>}<p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.comment.body || 'Comment deleted by its author.'}</p></div>}
      </div>
      {item.status === 'PENDING' ? <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => { setReason(''); setSelected({ item, action: 'dismiss' }); }}>Dismiss report</Button><Button variant="danger" disabled={busy || (item.comment ?? item.post).status !== 'APPROVED'} onClick={() => { setReason(''); setSelected({ item, action: 'remove' }); }}>Remove {item.targetType.toLowerCase()}</Button></div>
        : <p className="whitespace-pre-wrap break-words text-sm">{label(item.status)} by {item.reviewer?.firstName} {item.reviewer?.lastName} · {dateTime(item.reviewedAt)}<br />{item.reason}</p>}
    </Card>)}
    {!state.loading && !state.error && <div className="flex gap-2"><Button variant="secondary" disabled={page === 1 || busy} onClick={() => { setPage(page - 1); refresh(); }}>Previous</Button><Button variant="secondary" disabled={!state.hasMore || busy} onClick={() => { setPage(page + 1); refresh(); }}>Next</Button></div>}
    <Modal open={Boolean(selected)} onClose={() => { if (!busy) setSelected(null); }} title={selected?.action === 'remove' ? 'Remove reported content?' : 'Dismiss this report?'} description="Your decision and reason will be recorded in the audit history.">
      <form onSubmit={decide} className="space-y-4"><label className="block text-sm font-semibold">Resolution reason<Textarea className="mt-2" required maxLength={1000} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button><Button type="submit" disabled={busy || !reason.trim()}>{busy ? 'Saving…' : 'Confirm decision'}</Button></div></form>
    </Modal>
  </section>;
}
