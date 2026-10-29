import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, ArrowRight, CheckCircle2, MessageSquareText, PenLine, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, IconButton, Input, Select, Skeleton, Tabs } from '../../components/ui/index.jsx';
import { useAuth } from '../../context/auth-context.js';
import { createEmployeeCommunityApi } from './employee-community-api.js';
import { categories, communityError, label, statuses } from './community-model.js';
import { CommunityPostCard } from './CommunityPostCard.jsx';
import { CommunityComposer } from './CommunityComposer.jsx';
import './community.css';

const api = createEmployeeCommunityApi();
const tabs = [{ id: 'feed', label: 'Latest' }, { id: 'mine', label: 'My Posts' }, { id: 'saved', label: 'Saved' }];
const emptyFilters = { search: '', category: '', status: '' };
const emptyListing = { loading: true, error: '', items: [], hasMore: false };

export function EmployeeCommunityPage() {
  const { user } = useAuth();
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const [tab, setTab] = useState('feed');
  const [draftSearch, setDraftSearch] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [listing, setListing] = useState(emptyListing);
  const [composing, setComposing] = useState(false), [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const query = { page, pageSize: 20, ...(filters.search ? { search: filters.search } : {}),
      ...(filters.category ? { category: filters.category } : {}), ...(tab === 'mine' && filters.status ? { status: filters.status } : {}) };
    (tab === 'mine' ? api.mine(query, controller.signal) : tab === 'saved' ? api.saved(query, controller.signal) : api.feed(query, controller.signal))
      .then((result) => {
        if (controller.signal.aborted) return;
        const incoming = result.items.filter((item) => tab === 'mine' || item.status === 'APPROVED');
        setListing((current) => ({ loading: false, error: '', hasMore: result.hasMore,
          items: page === 1 ? incoming : [...new Map([...current.items, ...incoming].map((item) => [item.id, item])).values()] }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setListing((current) => ({ ...current, loading: false, error: communityError(error),
          ...([401, 403].includes(error.status) ? { items: [], hasMore: false } : {}) }));
      });
    return () => controller.abort();
  }, [tab, filters, page, revision]);

  function reset(nextFilters = filters) {
    setPage(1); setFilters(nextFilters); setListing(emptyListing); setRevision((value) => value + 1);
  }
  function changeTab(next) {
    setTab(next); setDraftSearch(''); setNotice(''); reset(emptyFilters);
  }
  function retry() {
    setListing((current) => ({ ...current, loading: true, error: '' })); setRevision((value) => value + 1);
  }
  function submitted(result) {
    setComposing(false); setTab('mine'); setDraftSearch(''); reset(emptyFilters);
    setNotice(result.alreadySubmitted ? 'This post was already received and is awaiting review.' : 'Post submitted for review. It will appear in the community once approved.');
  }
  const filtered = Boolean(filters.search || filters.category || filters.status);
  function engagementChanged(id, engagement) {
    if (tab === 'saved' && engagement.saved === false) { reset(); return; }
    setListing((current) => ({ ...current, items: current.items.map((post) => post.id === id ? { ...post, ...engagement } : post) }));
  }

  return <div className="community-page">
    <PageHeader title="Security Community" description="Share knowledge, stay informed, and help build a stronger security culture."
      actions={<Button onClick={() => setComposing(true)}><PenLine className="size-4" aria-hidden="true" />Create Post</Button>} />
    <div className="community-layout">
      <section className="community-feed" aria-label="Community feed">
        {notice && <p role="status" className="flex items-start gap-2 rounded-xl bg-success-50 p-4 text-sm leading-6 text-success-800"><CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />{notice}</p>}
        <div className="community-toolbar">
          <div className="flex items-center justify-between gap-3"><Tabs tabs={tabs} active={tab} onChange={changeTab} label="Community views" panelId="community-panel" /><IconButton label="Refresh" onClick={() => reset()}><RefreshCw className="size-4" aria-hidden="true" /></IconButton></div>
          <form className="community-filters" role="search" onSubmit={(event) => { event.preventDefault(); reset({ ...filters, search: draftSearch.trim() }); }}>
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-slate-200 bg-white pr-1"><Input type="search" className="border-0 bg-transparent shadow-none" aria-label="Search title or description" placeholder="Search the community" maxLength={100} value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} /><IconButton label="Search posts" type="submit"><Search className="size-4" aria-hidden="true" /></IconButton></div>
            <Select aria-label="Filter by category" value={filters.category} onChange={(event) => reset({ ...filters, category: event.target.value })}><option value="">All topics</option>{categories.map((category) => <option key={category} value={category}>{label(category)}</option>)}</Select>
            {tab === 'mine' && <Select aria-label="Moderation status" value={filters.status} onChange={(event) => reset({ ...filters, status: event.target.value })}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status === 'APPROVED' ? 'Published' : label(status)}</option>)}</Select>}
          </form>
          {filtered && <button className="community-text-action" onClick={() => { setDraftSearch(''); reset(emptyFilters); }}>Clear filters</button>}
        </div>
        <section id="community-panel" role="tabpanel" aria-labelledby={`community-panel-${tab}`} tabIndex={0} className="space-y-4" aria-busy={listing.loading}>
          {listing.items.map((post) => <CommunityPostCard key={`${tab}-${post.id}`} post={post} own={tab === 'mine'} onEngagement={engagementChanged} onUnavailable={() => reset()} onDeleted={() => { reset(); setNotice('Post deleted.'); }} />)}
          {listing.loading && <div role="status" className="community-post"><span className="sr-only">Loading community posts…</span><div className="flex items-center gap-3"><Skeleton className="size-11 rounded-full" /><Skeleton className="h-4 w-36" /></div><div className="mt-6 space-y-3"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div></div>}
          {listing.error && <div role="alert" className="community-empty"><AlertCircle className="size-7 text-danger-600" aria-hidden="true" /><h2>Community posts could not be loaded</h2><p>{listing.error}</p><Button variant="secondary" onClick={retry}>Try again</Button></div>}
          {!listing.loading && !listing.error && listing.items.length === 0 && <div className="community-empty"><MessageSquareText className="size-8 text-brand-700" aria-hidden="true" /><h2>{filtered ? 'No matching posts' : tab === 'saved' ? 'No saved posts yet' : tab === 'mine' ? 'Your ideas belong here' : 'Start a stronger security conversation'}</h2><p>{filtered ? 'Try a different search or topic to find what you need.' : tab === 'saved' ? 'Save useful posts from the feed to find them here later. Only published posts are shown.' : tab === 'mine' ? 'Your submissions and review statuses will appear here. Share something useful with your colleagues.' : 'Approved tips, experiences, and warnings will appear here. Be the first to contribute.'}</p><Button variant="subtle" onClick={() => filtered ? (setDraftSearch(''), reset(emptyFilters)) : tab === 'saved' ? changeTab('feed') : setComposing(true)}>{filtered ? 'Clear filters' : tab === 'saved' ? 'Browse latest posts' : 'Create a post'}</Button></div>}
          {!listing.error && listing.hasMore && <div className="flex justify-center py-3"><Button variant="secondary" disabled={listing.loading} onClick={() => { setListing((current) => ({ ...current, loading: true })); setPage((value) => value + 1); }}>{listing.loading ? 'Loading…' : 'Load more'}</Button></div>}
          {!listing.loading && !listing.error && !listing.hasMore && listing.items.length > 0 && <p className="py-3 text-center text-xs text-slate-500">You’re all caught up.</p>}
        </section>
      </section>
      <aside className="community-guidelines" aria-label="Community guidelines">
        <ShieldCheck className="size-7 text-brand-700" aria-hidden="true" /><h2 className="mt-4 font-bold text-navy-900">A more secure workplace,<br />one conversation at a time.</h2><p className="mt-3 text-sm leading-6 text-slate-600">Practical knowledge makes a difference. Share what you’ve learned and help colleagues spot the warning signs.</p>
        <ul className="mt-5 space-y-4 text-sm leading-6 text-slate-600"><li><strong className="block text-navy-900">Make it useful</strong>Offer clear tips and lessons others can apply.</li><li><strong className="block text-navy-900">Keep it respectful</strong>Focus on learning, never blame.</li><li><strong className="block text-navy-900">Protect private information</strong>Remove sensitive details before sharing.</li></ul>
        <div className="mt-6 border-t border-slate-200 pt-5"><p className="text-sm font-semibold text-navy-900">Have a security concern?</p><p className="mt-1 text-xs leading-5 text-slate-600">Use the approved reporting process for incidents or confidential evidence.</p><Link to="/incidents" className="community-text-action mt-2">Go to My Incidents<ArrowRight className="size-4" aria-hidden="true" /></Link></div>
      </aside>
    </div>
    <CommunityComposer open={composing} onClose={() => setComposing(false)} onSubmitted={submitted} api={api} name={name} />
  </div>;
}
