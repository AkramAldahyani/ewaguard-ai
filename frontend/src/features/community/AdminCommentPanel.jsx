import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../services/api.js';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card, Select, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { dateTime, label, commentError } from './community-model.js';

function ReviewComment({ item, busy, onDecision }) {
  const [reason, setReason] = useState(''), [error, setError] = useState('');
  const actions = item.status === 'PENDING_REVIEW' ? ['approve', 'reject'] : item.status === 'APPROVED' ? ['remove'] : [];
  return <Card className="p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-navy-900">{item.authorName}</h3><span className="text-xs font-semibold text-brand-800">{label(item.status)}</span></div>
    <p className="mt-1 text-xs text-slate-500">{dateTime(item.createdAt)} · {item.parentId ? 'Reply' : 'Comment'}</p>
    <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer font-semibold">Post context: {item.post.title || 'Untitled post'} ({label(item.post.status)})</summary><p className="mt-2 whitespace-pre-wrap break-words leading-6">{item.post.body}</p></details>
    {item.parent && <div className="mt-3 border-l-2 border-slate-200 pl-3 text-sm text-slate-600"><p className="text-xs font-semibold">Parent comment · {label(item.parent.status)}</p><p className="mt-1 whitespace-pre-wrap break-words">{item.parent.body || 'Deleted comment'}</p></div>}
    <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-7">{item.body || 'Comment text deleted by its author.'}</p>
    {actions.length > 0 && <div className="mt-4"><label className="block text-sm font-semibold">Comment moderation reason<Textarea className="mt-2" value={reason} maxLength={1000} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label><p className="mt-1 text-xs text-slate-500">Shared with the comment author. Do not include sensitive information.</p>
      {error && <p role="alert" className="mt-2 text-sm text-danger-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{actions.map((action) => <Button key={action} size="sm" variant={action === 'approve' ? 'primary' : 'danger'} disabled={busy || item.own || action === 'approve' && (item.post.status !== 'APPROVED' || item.parent && item.parent.status !== 'APPROVED')} onClick={() => {
        if (!reason.trim()) { setError('Enter a moderation reason.'); return; }
        setError(''); onDecision({ item, action, reason: reason.trim() });
      }}>{label(action)} comment</Button>)}</div>{item.own && <p className="mt-2 text-xs text-slate-600">Another administrator must review your comment.</p>}</div>}
    {item.history.length > 0 && <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">Comment moderation history</summary><ol className="mt-2 space-y-3">{item.history.map((entry) => <li key={entry.id}><p className="text-xs text-slate-500">{label(entry.decision)} · {dateTime(entry.createdAt)}</p><p className="whitespace-pre-wrap break-words">{entry.reason}</p></li>)}</ol></details>}
  </Card>;
}
export function AdminCommentPanel() {
  const [status, setStatus] = useState('APPROVED'), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, items: [], error: '', hasMore: false });
  const [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const write = useRef(null);
  useEffect(() => () => write.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/api/admin/community/comments?${new URLSearchParams({ status, page, pageSize: 10 })}`, { signal: controller.signal, cache: 'no-store' })
      .then((result) => { if (!controller.signal.aborted) setState({ loading: false, error: '', ...result }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ loading: false, items: [], hasMore: false, error: commentError(error) }); });
    return () => controller.abort();
  }, [status, page, revision]);
  function refresh() { setConfirm(null); setState({ loading: true, items: [], hasMore: false, error: '' }); setRevision((value) => value + 1); }
  async function decide() {
    if (!confirm || write.current) return;
    const { item, action, reason } = confirm;
    const controller = new AbortController(); write.current = controller; setBusy(true); setNotice(''); setConfirm(null);
    try {
      await apiRequest(`/api/admin/community/comments/${item.id}/${action}`, { method: 'POST', signal: controller.signal,
        body: JSON.stringify({ reason, expectedUpdatedAt: item.updatedAt }) });
      if (!controller.signal.aborted) { setNotice(`Comment ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'removed'}.`); refresh(); }
    } catch (error) {
      if (!controller.signal.aborted) { setNotice(''); setState({ loading: false, items: [], hasMore: false, error: commentError(error) }); }
    } finally { if (!controller.signal.aborted) { write.current = null; setBusy(false); } }
  }
  return <>
    <PageHeader title="Comment moderation" description="Comments publish immediately. Review published discussions and remove inappropriate content. Older pending comments remain available for review." />
    <div className="mb-5 flex flex-wrap items-center gap-3"><label className="text-sm font-semibold">Comment status<Select className="mt-1" value={status} disabled={busy} onChange={(event) => { setStatus(event.target.value); setPage(1); setNotice(''); refresh(); }}>{['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REMOVED'].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></label><Button variant="secondary" disabled={busy} onClick={refresh}>Refresh comments queue</Button></div>
    {notice && <p role="status" className="mb-4 text-sm text-brand-800">{notice}</p>}
    {state.loading && <p role="status">Loading comments for review…</p>}
    {state.error && <div role="alert" className="rounded-xl bg-danger-50 p-4"><p>{state.error}</p><Button variant="ghost" onClick={refresh}>Retry comment queue</Button></div>}
    {!state.loading && !state.error && !state.items.length && <Card className="p-6 text-sm text-slate-600">No comments in this queue.</Card>}
    <div className="space-y-4">{state.items.map((item) => <ReviewComment key={`${item.id}-${item.updatedAt}`} item={item} busy={busy} onDecision={setConfirm} />)}</div>
    {!state.loading && !state.error && <nav aria-label="Comment queue pages" className="mt-5 flex items-center justify-between"><Button variant="secondary" disabled={busy || page === 1} onClick={() => { setPage(page - 1); refresh(); }}>Previous comments</Button><span className="text-xs">Page {page}</span><Button variant="secondary" disabled={busy || !state.hasMore} onClick={() => { setPage(page + 1); refresh(); }}>Next comments</Button></nav>}
    <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={`${label(confirm?.action)} comment?`} description="This decision is audited. The reason will be visible to the author." footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button onClick={decide}>Confirm comment decision</Button></>}><p className="whitespace-pre-wrap break-words text-sm">{confirm?.reason}</p></Modal>
  </>;
}
