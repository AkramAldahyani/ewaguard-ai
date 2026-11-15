import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ClipboardCheck, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Badge, Button, Card, Input, Select, StatePanel, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { createAdminCommunityApi } from './admin-community-api.js';
import { CommunityImageReview } from './CommunityImages.jsx';
import { categories, dateTime, label, moderationError, statuses, validReason } from './community-model.js';
import { AdminCommentPanel } from './AdminCommentPanel.jsx';
import { AdminReportsPanel } from './AdminReportsPanel.jsx';

const api = createAdminCommunityApi();
const initialFilters = {
  search: '',
  status: 'PENDING_REVIEW',
  category: '',
  authorId: '',
  submittedFrom: '',
  submittedTo: '',
  sort: 'submitted_desc',
};
const actions = { PENDING_REVIEW: ['approve', 'reject'], APPROVED: ['remove'] };
const statusTone = { PENDING_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger', REMOVED: 'neutral' };
function Status({ value }) {
  return <Badge tone={statusTone[value] ?? 'neutral'}>{label(value)}</Badge>;
}

export function AdminCommunityPage() {
  const [section, setSection] = useState('Post moderation');
  return (
    <>
      <nav aria-label="Moderation sections" className="mb-5 flex flex-wrap gap-2">
        {['Post moderation', 'Comment moderation', 'Reported content'].map((name) => (
          <Button
            key={name}
            variant={section === name ? 'primary' : 'secondary'}
            aria-pressed={section === name}
            onClick={() => setSection(name)}
          >
            {name}
          </Button>
        ))}
      </nav>
      {section === 'Comment moderation' ? (
        <AdminCommentPanel />
      ) : section === 'Reported content' ? (
        <AdminReportsPanel />
      ) : (
        <PostModerationPanel />
      )}
    </>
  );
}

function PostModerationPanel() {
  const [draft, setDraft] = useState(initialFilters),
    [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [queue, setQueue] = useState({ loading: true, error: '', result: null });
  const [selectedId, setSelectedId] = useState(null),
    [detail, setDetail] = useState({ loading: false, error: '', post: null });
  const [reason, setReason] = useState(''),
    [reasonError, setReasonError] = useState('');
  const [confirm, setConfirm] = useState(null),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(''),
    [actionError, setActionError] = useState(''),
    [stale, setStale] = useState(false);
  const detailRequest = useRef(0);
  const [reviewedImages, setReviewedImages] = useState([]);
  const clearProtected = (message) => {
    ++detailRequest.current;
    setQueue({ loading: false, error: message, result: null });
    setDetail({ loading: false, error: '', post: null });
    setSelectedId(null);
    setConfirm(null);
  };
  const loadDetail = useCallback(async (id, { preserveReason = false } = {}) => {
    const requestId = ++detailRequest.current;
    setReviewedImages([]);
    setSelectedId(id);
    setDetail({ loading: true, error: '', post: null });
    if (!preserveReason) {
      setReason('');
      setReasonError('');
      setStale(false);
      setNotice('');
      setActionError('');
    }
    try {
      const { post } = await api.detail(id);
      if (requestId === detailRequest.current) setDetail({ loading: false, error: '', post });
    } catch (error) {
      if (requestId !== detailRequest.current) return;
      if ([401, 403].includes(error.status)) clearProtected(moderationError(error));
      setDetail({ loading: false, error: moderationError(error), post: null });
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setQueue({ loading: true, error: '', result: null });
    });
    api
      .list(
        { page, pageSize: 20, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) setQueue({ loading: false, error: '', result });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if ([401, 403].includes(error.status)) {
          ++detailRequest.current;
          setDetail({ loading: false, error: '', post: null });
          setSelectedId(null);
          setConfirm(null);
        }
        setQueue({ loading: false, error: moderationError(error), result: null });
      });
    return () => controller.abort();
  }, [filters, page, revision]);
  const refreshQueue = () => setRevision((value) => value + 1);
  const change = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  function apply(event) {
    event.preventDefault();
    if (draft.submittedFrom && draft.submittedTo && draft.submittedFrom > draft.submittedTo) return;
    setPage(1);
    setFilters({ ...draft, search: draft.search.trim() });
  }
  function requestDecision(action) {
    if (action === 'approve' && detail.post?.images?.length && reviewedImages.length !== detail.post.images.length) {
      setActionError('Preview and acknowledge every attached photo before approving this post.');
      return;
    }
    if (!validReason(reason)) {
      setReasonError('Enter a plain-text reason of 1–1000 characters without HTML.');
      return;
    }
    setReasonError('');
    setActionError('');
    setConfirm(action);
  }
  async function decide() {
    const action = confirm,
      post = detail.post;
    if (!action || !post || busy || stale || !actions[post.status]?.includes(action)) return;
    setConfirm(null);
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await api.decide(
        post.id,
        action,
        reason.trim(),
        post.updatedAt,
        post.images?.length && action === 'approve' ? reviewedImages : undefined,
      );
      await loadDetail(post.id, { preserveReason: true });
      setReason('');
      setStale(false);
      setNotice(
        `Post ${action === 'remove' ? 'removed' : action === 'reject' ? 'rejected' : 'approved'} successfully.`,
      );
      refreshQueue();
    } catch (error) {
      setActionError(moderationError(error));
      if (error.status === 409 && error.code !== 'COMMUNITY_ATTACHMENTS_UNREVIEWED') {
        setStale(true);
        await loadDetail(post.id, { preserveReason: true });
        refreshQueue();
      } else if ([401, 403].includes(error.status)) clearProtected(moderationError(error));
    } finally {
      setBusy(false);
    }
  }
  const post = detail.post;
  const selectedActions = actions[post?.status] ?? [];
  return (
    <>
      <PageHeader
        eyebrow="Security awareness administration"
        title="Community moderation"
        description="Review employee submissions before they appear in the shared security community."
      />
      <Card className="mb-6 p-5 sm:p-6">
        <form onSubmit={apply}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">
              Search posts or author
              <Input
                className="mt-2"
                type="search"
                maxLength={100}
                value={draft.search}
                onChange={(event) => change('search', event.target.value)}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Status
              <Select className="mt-2" value={draft.status} onChange={(event) => change('status', event.target.value)}>
                <option value="">All statuses</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Category
              <Select
                className="mt-2"
                value={draft.category}
                onChange={(event) => change('category', event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Sort
              <Select className="mt-2" value={draft.sort} onChange={(event) => change('sort', event.target.value)}>
                <option value="submitted_desc">Newest submissions</option>
                <option value="submitted_asc">Oldest submissions</option>
                <option value="updated_desc">Recently updated</option>
              </Select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Author ID
              <Input
                className="mt-2"
                value={draft.authorId}
                onChange={(event) => change('authorId', event.target.value)}
                placeholder="Exact author ID"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Submitted from (UTC)
              <Input
                className="mt-2"
                type="date"
                value={draft.submittedFrom}
                onChange={(event) => change('submittedFrom', event.target.value)}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Submitted to (UTC)
              <Input
                className="mt-2"
                type="date"
                min={draft.submittedFrom || undefined}
                value={draft.submittedTo}
                onChange={(event) => change('submittedTo', event.target.value)}
              />
            </label>
          </div>
          {draft.submittedFrom && draft.submittedTo && draft.submittedFrom > draft.submittedTo && (
            <p role="alert" className="mt-3 text-sm text-danger-700">
              End date must be on or after start date.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="submit">
              <Search className="size-4" aria-hidden="true" />
              Apply filters
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(initialFilters);
                setFilters(initialFilters);
                setPage(1);
              }}
            >
              Clear
            </Button>
            <Button variant="ghost" onClick={refreshQueue}>
              Refresh queue
            </Button>
          </div>
        </form>
      </Card>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section aria-label="Review queue">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Submissions</h2>
            {queue.result && <span className="text-xs text-slate-500">Page {queue.result.page}</span>}
          </div>
          {queue.loading && (
            <Card className="p-6" role="status">
              Loading community submissions…
            </Card>
          )}
          {queue.error && (
            <Card className="p-5">
              <StatePanel
                icon={AlertCircle}
                tone="error"
                title="Community submissions could not be loaded"
                description={queue.error}
                action={
                  <Button variant="secondary" onClick={refreshQueue}>
                    Try again
                  </Button>
                }
              />
            </Card>
          )}
          {!queue.loading && !queue.error && queue.result?.items.length === 0 && (
            <Card className="p-5">
              <StatePanel
                icon={ClipboardCheck}
                title="No matching submissions"
                description="There are no posts for these filters. Try another status or search."
              />
            </Card>
          )}
          {queue.result?.items.length > 0 && (
            <>
              <div className="space-y-3">
                {queue.result.items.map((item) => (
                  <Card key={item.id} className={`p-4 sm:p-5 ${selectedId === item.id ? 'ring-2 ring-brand-400' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Status value={item.status} />
                      <span className="text-xs text-slate-500">{dateTime(item.submittedAt)}</span>
                    </div>
                    <h3 className="mt-3 break-words font-bold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      {label(item.category)} · {item.author.name}
                    </p>
                    <p className="mt-3 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                      {item.body}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-4"
                      disabled={busy}
                      onClick={() => loadDetail(item.id)}
                    >
                      Review post
                    </Button>
                  </Card>
                ))}
              </div>
              <nav aria-label="Community pages" className="mt-4 flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600">Page {queue.result.page}</span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={queue.loading || page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={queue.loading || !queue.result.hasMore}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </nav>
            </>
          )}
        </section>
        <section aria-label="Post review" className="xl:sticky xl:top-24">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Post review</h2>
          {!selectedId && (
            <Card className="p-5">
              <StatePanel
                icon={ShieldCheck}
                title="Select a submission"
                description="Open a post to review its full content and moderation history before deciding."
              />
            </Card>
          )}
          {detail.loading && (
            <Card className="p-6" role="status">
              Loading post details…
            </Card>
          )}
          {detail.error && (
            <Card className="p-5">
              <StatePanel
                icon={AlertCircle}
                tone="error"
                title="Post could not be loaded"
                description={detail.error}
                action={
                  selectedId && (
                    <Button variant="secondary" onClick={() => loadDetail(selectedId, { preserveReason: true })}>
                      Try again
                    </Button>
                  )
                }
              />
            </Card>
          )}
          {post && (
            <Card className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Status value={post.status} />
                <span className="text-xs text-slate-500">{label(post.category)}</span>
              </div>
              <h3 className="mt-4 break-words text-xl font-bold text-slate-950">{post.title}</h3>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Author</dt>
                  <dd className="mt-1 break-words">{post.author.name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted</dt>
                  <dd className="mt-1">{dateTime(post.submittedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approved</dt>
                  <dd className="mt-1">{dateTime(post.approvedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Removed</dt>
                  <dd className="mt-1">{dateTime(post.removedAt)}</dd>
                </div>
              </dl>
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Submitted content</h4>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">{post.body}</p>
              </div>
              {post.images?.length > 0 && (
                <CommunityImageReview
                  key={`${post.id}-${post.updatedAt}`}
                  images={post.images}
                  onReview={setReviewedImages}
                />
              )}
              {notice && (
                <p role="status" className="mt-5 rounded-lg bg-success-50 p-3 text-sm text-success-800">
                  {notice}
                </p>
              )}
              {actionError && (
                <p role="alert" className="mt-5 rounded-lg bg-danger-50 p-3 text-sm text-danger-800">
                  {actionError}
                </p>
              )}
              {stale && (
                <div className="mt-5 rounded-xl border border-warning-200 bg-warning-50 p-4">
                  <p className="text-sm font-semibold text-warning-900">
                    This post changed during your review. Read the updated content and history before choosing another
                    action.
                  </p>
                  <Button
                    variant="secondary"
                    className="mt-3"
                    onClick={() => {
                      setStale(false);
                      setActionError('');
                    }}
                  >
                    I have reviewed the latest post
                  </Button>
                </div>
              )}
              {selectedActions.length > 0 && (
                <div className="mt-6 border-t border-slate-200 pt-5">
                  <label htmlFor="moderation-reason" className="text-sm font-semibold text-slate-800">
                    Moderation reason <span className="text-danger-700">*</span>
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    Required for every decision. Internal to authorized administrators.
                  </p>
                  <Textarea
                    id="moderation-reason"
                    className="mt-2"
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setReasonError('');
                    }}
                    aria-invalid={Boolean(reasonError)}
                    aria-describedby={reasonError ? 'moderation-reason-error' : undefined}
                    disabled={busy}
                  />
                  {reasonError && (
                    <p id="moderation-reason-error" role="alert" className="mt-2 text-sm text-danger-700">
                      {reasonError}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedActions.map((action) => (
                      <Button
                        key={action}
                        variant={action === 'approve' ? 'primary' : 'danger'}
                        disabled={busy || stale}
                        onClick={() => requestDecision(action)}
                      >
                        {busy ? 'Saving…' : `${label(action)} post`}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-7 border-t border-slate-200 pt-5">
                <h4 className="font-bold text-slate-900">Moderation history</h4>
                {post.history.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No moderation decisions yet.</p>
                ) : (
                  <ol className="mt-4 space-y-4 border-l-2 border-slate-200 pl-5">
                    {post.history.map((entry) => (
                      <li key={entry.id} className="relative text-sm">
                        <span
                          className="absolute -left-[1.65rem] top-1 size-3 rounded-full border-2 border-white bg-brand-600"
                          aria-hidden="true"
                        />
                        <p className="font-semibold text-slate-900">
                          {label(entry.previousStatus)} → {label(entry.decision)}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {entry.moderator.name} · {dateTime(entry.createdAt)}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-slate-700">{entry.reason}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Card>
          )}
        </section>
      </div>
      <Modal
        open={Boolean(confirm)}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={`${label(confirm)} this post?`}
        description="This decision changes which employees can see the post and is recorded in moderation history."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={confirm === 'approve' ? 'primary' : 'danger'} onClick={decide} disabled={busy}>
              {busy ? 'Saving…' : `Confirm ${confirm}`}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          <strong>Post:</strong> {post?.title}
        </p>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">
          <strong>Reason:</strong> {reason.trim()}
        </p>
      </Modal>
    </>
  );
}
