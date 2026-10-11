import { useEffect, useRef, useState } from 'react';
import { AlertCircle, BookOpenText, MessageSquareText, Send, ShieldCheck } from 'lucide-react';
import { DISCLAIMER_DEFINITION } from '../../../../shared/disclaimer.js';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Badge, Button, Card, Input, Select, StatePanel, Tabs, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { createEmployeeCommunityApi } from './employee-community-api.js';
import { categories, communityError, dateTime, label, statuses, validateCommunityPost } from './community-model.js';

const api = createEmployeeCommunityApi();
const initialPost = { title: '', category: '', body: '' };
const statusTone = { PENDING_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger', REMOVED: 'neutral' };
const tabs = [{ id: 'feed', label: 'Community feed' }, { id: 'mine', label: 'My submissions' }, { id: 'create', label: 'Create post' }];
function Status({ value }) { return <Badge tone={statusTone[value] ?? 'neutral'}>{label(value)}</Badge>; }
function Pager({ result, page, onChange }) { return <nav aria-label="Community pages" className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4"><span className="text-sm text-slate-600">Page {result.page}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={!result.hasMore} onClick={() => onChange(page + 1)}>Next</Button></div></nav>; }

export function EmployeeCommunityPage() {
  const [tab, setTab] = useState('feed'), [draftFilters, setDraftFilters] = useState({ search: '', category: '', status: '' });
  const [filters, setFilters] = useState({ search: '', category: '', status: '' });
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [listing, setListing] = useState({ loading: true, error: '', result: null });
  const [selected, setSelected] = useState(null), [detail, setDetail] = useState({ loading: false, error: '', post: null });
  const [post, setPost] = useState(initialPost), [acknowledged, setAcknowledged] = useState(false);
  const [formError, setFormError] = useState(''), [submitting, setSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false), [notice, setNotice] = useState('');
  const detailRequest = useRef(0), submittingRef = useRef(false);
  useEffect(() => {
    if (tab === 'create') return undefined;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) setListing({ loading: true, error: '', result: null }); });
    const query = { page, pageSize: 20, ...(filters.search ? { search: filters.search } : {}),
      ...(filters.category ? { category: filters.category } : {}), ...(tab === 'mine' && filters.status ? { status: filters.status } : {}) };
    (tab === 'mine' ? api.mine(query, controller.signal) : api.feed(query, controller.signal))
      .then((result) => { if (!controller.signal.aborted) setListing({ loading: false, error: '', result }); })
      .catch((error) => { if (controller.signal.aborted) return; setListing({ loading: false, error: communityError(error), result: null });
        if ([401, 403].includes(error.status)) { ++detailRequest.current; setSelected(null); setDetail({ loading: false, error: '', post: null }); } });
    return () => controller.abort();
  }, [tab, filters, page, revision]);
  function changeTab(next) { ++detailRequest.current; setTab(next); setPage(1); setFilters({ search: '', category: '', status: '' });
    setDraftFilters({ search: '', category: '', status: '' }); setListing({ loading: true, error: '', result: null });
    setSelected(null); setDetail({ loading: false, error: '', post: null }); setNotice(''); }
  function clearSelection() { ++detailRequest.current; setSelected(null); setDetail({ loading: false, error: '', post: null }); }
  function apply(event) { event.preventDefault(); clearSelection(); setPage(1); setFilters({ ...draftFilters, search: draftFilters.search.trim() }); }
  function refresh() { clearSelection(); setListing({ loading: true, error: '', result: null }); setRevision((value) => value + 1); }
  function changePage(next) { clearSelection(); setPage(next); }
  async function openPost(item) {
    const request = ++detailRequest.current, own = tab === 'mine';
    setSelected({ id: item.id, own }); setDetail({ loading: true, error: '', post: null });
    try { const response = await api.detail(item.id, own);
      if (request === detailRequest.current) setDetail({ loading: false, error: '', post: response.post }); }
    catch (error) { if (request !== detailRequest.current) return;
      if ([401, 403].includes(error.status)) { setListing({ loading: false, error: communityError(error), result: null }); setSelected(null); }
      setDetail({ loading: false, error: communityError(error), post: null }); }
  }
  function review(event) { event.preventDefault(); const error = validateCommunityPost(post, acknowledged);
    if (error) { setFormError(error); return; } setFormError(''); setReviewOpen(true); }
  async function submit() {
    if (submittingRef.current || !reviewOpen) return;
    const error = validateCommunityPost(post, acknowledged);
    if (error) { setFormError(error); setReviewOpen(false); return; }
    submittingRef.current = true; setSubmitting(true); setFormError('');
    try {
      const { acknowledgement } = await api.acknowledge();
      const result = await api.submit(post, acknowledgement.id);
      setReviewOpen(false); setPost(initialPost); setAcknowledged(false);
      setNotice(result.alreadySubmitted ? 'This submission was already received and remains pending administrator review.' : 'Your post was submitted for administrator review. It will appear in the community feed only after approval.');
      setTab('mine'); setPage(1); setFilters({ search: '', category: '', status: '' }); setListing({ loading: true, error: '', result: null });
      setDraftFilters({ search: '', category: '', status: '' }); setRevision((value) => value + 1);
    } catch (failure) { setReviewOpen(false); setFormError(communityError(failure, 'submit')); }
    finally { submittingRef.current = false; setSubmitting(false); }
  }
  const result = listing.result;
  const visibleItems = result?.items.filter((item) => tab === 'mine' || item.status === 'APPROVED') ?? [];
  return <>
    <PageHeader eyebrow="Security awareness" title="Security Community" description="Share practical cybersecurity guidance. Every new post is reviewed before it appears in the organization-wide feed." />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Tabs tabs={tabs} active={tab} onChange={changeTab} /><p className="text-xs text-slate-500">Text posts only · Attachments are unavailable</p></div>
    {notice && <div role="status" className="mb-5 rounded-xl border border-success-200 bg-success-50 p-4 text-sm font-medium text-success-900">{notice}</div>}
    {tab !== 'create' && <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.78fr)]"><section aria-label={tab === 'mine' ? 'My submissions' : 'Approved community feed'}>
      <Card className="mb-5 p-5 sm:p-6"><form onSubmit={apply} className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Search title or description<Input className="mt-2" type="search" maxLength={100} value={draftFilters.search} onChange={(event) => setDraftFilters((value) => ({ ...value, search: event.target.value }))} /></label><label className="text-sm font-semibold text-slate-700">Category<Select className="mt-2" value={draftFilters.category} onChange={(event) => setDraftFilters((value) => ({ ...value, category: event.target.value }))}><option value="">All categories</option>{categories.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></label>{tab === 'mine' && <label className="text-sm font-semibold text-slate-700">Moderation status<Select className="mt-2" value={draftFilters.status} onChange={(event) => setDraftFilters((value) => ({ ...value, status: event.target.value }))}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></label>}<div className="flex flex-wrap items-end gap-2"><Button type="submit">Apply filters</Button><Button variant="secondary" onClick={refresh}>Refresh</Button></div></form></Card>
      {listing.loading && <Card className="p-6" role="status">Loading community posts…</Card>}
      {listing.error && <Card className="p-5"><StatePanel icon={AlertCircle} tone="error" title="Community posts could not be loaded" description={listing.error} action={<Button variant="secondary" onClick={refresh}>Try again</Button>} /></Card>}
      {!listing.loading && !listing.error && result && visibleItems.length === 0 && <Card className="p-5"><StatePanel icon={MessageSquareText} title={tab === 'mine' ? 'No matching submissions' : 'No approved posts yet'} description={tab === 'mine' ? 'Your submitted posts and moderation statuses will appear here. Try another filter or create a post.' : 'Approved security tips and warnings will appear here after administrator review.'} action={tab === 'mine' && <Button onClick={() => changeTab('create')}>Create post</Button>} /></Card>}
      {visibleItems.length > 0 && <Card className="p-4 sm:p-5"><div className="space-y-3">{visibleItems.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><Badge tone="brand">{label(item.category)}</Badge>{tab === 'mine' && <Status value={item.status} />}</div><h2 className="mt-3 break-words text-lg font-bold text-slate-900">{item.title}</h2><p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.body}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">{item.authorName} · {dateTime(tab === 'mine' ? item.submittedAt : item.approvedAt)}</p><Button variant="secondary" size="sm" onClick={() => openPost(item)}>View post</Button></div></article>)}</div><Pager result={result} page={page} onChange={changePage} /></Card>}
    </section><section aria-label="Post details" className="xl:sticky xl:top-24"><h2 className="mb-3 text-lg font-bold text-slate-900">Post details</h2>{!selected && <Card className="p-5"><StatePanel icon={BookOpenText} title="Select a post" description="Open a post to read the full guidance and its publication or submission status." /></Card>}{detail.loading && <Card className="p-6" role="status">Loading post details…</Card>}{detail.error && <Card className="p-5"><StatePanel icon={AlertCircle} tone="error" title="Post could not be loaded" description={detail.error} action={selected && <Button variant="secondary" onClick={() => openPost(selected)}>Try again</Button>} /></Card>}{detail.post && <Card className="p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-2"><Badge tone="brand">{label(detail.post.category)}</Badge>{selected?.own && <Status value={detail.post.status} />}</div><h3 className="mt-4 break-words text-xl font-bold text-slate-900">{detail.post.title}</h3><p className="mt-2 text-xs text-slate-500">{detail.post.authorName} · {dateTime(selected?.own ? detail.post.submittedAt : detail.post.approvedAt)}</p><p className="mt-6 whitespace-pre-wrap break-words border-t border-slate-100 pt-5 text-sm leading-7 text-slate-700">{detail.post.body}</p>{selected?.own && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{detail.post.status === 'PENDING_REVIEW' ? 'Awaiting administrator review. This post is not visible in the shared feed.' : detail.post.status === 'APPROVED' ? 'Approved and visible in the shared community feed.' : detail.post.status === 'REJECTED' ? 'This post was not approved and remains private to you.' : 'This post was removed from the shared feed.'}</p>}</Card>}</section></div>}
    {tab === 'create' && <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]"><Card className="p-5 sm:p-7"><h2 className="text-lg font-bold text-slate-900">Create a community post</h2><p className="mt-1 text-sm text-slate-600">Share a tip, warning, or educational example. An administrator reviews every submission.</p><form onSubmit={review} className="mt-6 space-y-5" noValidate><label className="block text-sm font-semibold text-slate-700">Title <span className="text-danger-700">*</span><Input className="mt-2" value={post.title} maxLength={200} onChange={(event) => setPost((value) => ({ ...value, title: event.target.value }))} /></label><label className="block text-sm font-semibold text-slate-700">Category <span className="text-danger-700">*</span><Select className="mt-2" value={post.category} onChange={(event) => setPost((value) => ({ ...value, category: event.target.value }))}><option value="">Choose a category</option>{categories.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></label><label className="block text-sm font-semibold text-slate-700">Description <span className="text-danger-700">*</span><Textarea className="mt-2 min-h-52" value={post.body} maxLength={5000} onChange={(event) => setPost((value) => ({ ...value, body: event.target.value }))} /></label><p className="text-xs text-slate-500">{post.body.length} / 5,000 characters. Plain text only; attachments are unavailable.</p>
      <section className="rounded-xl border border-warning-200 bg-warning-50 p-5" aria-label="Sensitive-information notice"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-warning-800" aria-hidden="true" /><div><h3 className="font-bold text-warning-950">{DISCLAIMER_DEFINITION.title}</h3><p className="mt-2 text-sm leading-6 text-warning-900">{DISCLAIMER_DEFINITION.summary}</p></div></div><ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-6 text-warning-900">{DISCLAIMER_DEFINITION.prohibitedItems.map((item) => <li key={item}>{item}</li>)}<li>Internal documents not approved for sharing</li></ul><p className="mt-4 text-sm font-semibold leading-6 text-warning-900">{DISCLAIMER_DEFINITION.restrictedGuidance}</p><label className="mt-5 flex items-start gap-3 rounded-lg border border-warning-300 bg-white p-4 text-sm font-semibold text-slate-800"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-4 accent-brand-600" /><span>{DISCLAIMER_DEFINITION.confirmation}</span></label></section>
      {formError && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-800">{formError}</p>}<Button type="submit" disabled={submitting}><Send className="size-4" aria-hidden="true" />Review submission</Button></form></Card><Card className="p-5 sm:p-6"><h2 className="font-bold text-slate-900">How publication works</h2><ol className="mt-4 space-y-4 text-sm leading-6 text-slate-600"><li><strong>1. Submit.</strong> Your post starts as pending review.</li><li><strong>2. Security review.</strong> An administrator checks the content before publication.</li><li><strong>3. Publication.</strong> Only approved posts appear in the shared feed.</li></ol><p className="mt-5 text-xs leading-5 text-slate-500">Use the approved security-reporting channel for confidential or urgent incidents.</p></Card></div>}
    <Modal open={reviewOpen} onClose={() => { if (!submitting) setReviewOpen(false); }} title="Review your community post" description="Confirm the text is appropriate for the shared community. The post will remain private until approved." footer={<><Button variant="secondary" disabled={submitting} onClick={() => setReviewOpen(false)}>Edit post</Button><Button disabled={submitting} onClick={submit}>{submitting ? 'Submitting…' : 'Submit for review'}</Button></>}><p className="text-xs font-bold uppercase tracking-wide text-brand-700">{label(post.category)}</p><h3 className="mt-2 break-words font-bold text-slate-900">{post.title}</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{post.body}</p></Modal>
  </>;
}
