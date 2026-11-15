import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Link2,
  Plus,
  RefreshCw,
  SearchX,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserRoundX,
  Users,
} from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card, SearchField, Select, Skeleton, StatePanel } from '../../components/ui/index.jsx';
import { useUsersResource } from './users-api.js';
import { accountStatuses, defaultFilters, directoryQuery, userError } from './users-model.js';
import { DirectorySkeleton, UserDirectory } from './UserDirectory.jsx';
import { UserPanel } from './UserPanel.jsx';
import { InviteLinksDialog } from './InviteLinksDialog.jsx';
import './users.css';

export function UserManagementPage() {
  const [filters, setFilters] = useState(defaultFilters),
    [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0),
    [selection, setSelection] = useState(null),
    [panelRevision, setPanelRevision] = useState(0);
  const [optionsRevision, setOptionsRevision] = useState(0),
    [invitesOpen, setInvitesOpen] = useState(false);
  const directory = useUsersResource(`/api/admin/users?${directoryQuery(filters)}`, revision);
  const summary = useUsersResource('/api/admin/users/summary', revision);
  const departments = useUsersResource('/api/admin/users/options', optionsRevision);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setFilters((current) =>
          current.search === search.trim() ? current : { ...current, search: search.trim(), page: 1 },
        ),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [search, setFilters]);
  const change = (values) => setFilters((current) => ({ ...current, ...values, page: 1 }));
  const clear = () => {
    setSearch('');
    setFilters(defaultFilters);
  };
  const refresh = () => setRevision((value) => value + 1);
  const open = (mode, id = null) => {
    setPanelRevision((value) => value + 1);
    setSelection({ mode, id });
  };
  const hasFilters = Boolean(filters.search || filters.departmentId || filters.role || filters.status);
  const data = directory.data,
    totals = summary.data;
  const cards = [
    ['Total users', totals?.total, Users, 'Excludes removed accounts'],
    ['Active users', totals?.active, UserCheck, 'Account access enabled'],
    [
      'Inactive / suspended',
      totals ? totals.inactive + totals.suspended : undefined,
      UserRoundX,
      'Account access restricted',
    ],
    ['Administrators', totals?.administrators, ShieldCheck, 'Privileged account holders'],
  ];
  function saved() {
    change({});
    refresh();
  }
  return (
    <div className="users-workspace">
      <PageHeader
        eyebrow="Identity & access"
        title="User Management"
        description="Manage employee accounts, access permissions, and account security."
        actions={
          <>
            <Button variant="secondary" onClick={refresh} disabled={directory.loading} aria-label="Refresh users">
              <RefreshCw className="size-4" aria-hidden="true" />
            </Button>
            <Button variant="secondary" disabled={!departments.data} onClick={() => setInvitesOpen(true)}>
              <Link2 className="size-4" aria-hidden="true" />
              Invite Link
            </Button>
            <Button disabled={!departments.data} onClick={() => open('add')}>
              <Plus className="size-4" aria-hidden="true" />
              Add User
            </Button>
          </>
        }
      />
      <section aria-label="Account overview" className="users-summary">
        {cards.map(([label, value, Icon, hint], index) => (
          <Card key={label} className="users-metric">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500">{label}</p>
              <span className={`users-metric-icon users-metric-icon-${index}`}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
            </div>
            {value === undefined ? (
              <Skeleton className="my-2 h-8 w-16" />
            ) : (
              <p className="mt-1 text-[1.8rem] font-bold tracking-tight text-navy-900">{value.toLocaleString()}</p>
            )}
            <p className="mt-1 text-[0.7rem] text-slate-500">{hint}</p>
          </Card>
        ))}
      </section>
      {summary.error && (
        <div className="users-error mb-4" role="alert">
          Account totals are unavailable. {userError(summary.error)}{' '}
          <Button variant="ghost" onClick={refresh}>
            Retry totals
          </Button>
        </div>
      )}
      {departments.error && (
        <div className="users-error mb-4" role="alert">
          Departments could not be loaded. {userError(departments.error)}{' '}
          <Button variant="ghost" onClick={() => setOptionsRevision((n) => n + 1)}>
            Retry departments
          </Button>
        </div>
      )}
      <Card className="users-directory">
        <div className="users-directory-top">
          <div>
            <h2 id="users-directory-heading" tabIndex={-1} className="text-base font-bold text-navy-900">
              User directory
            </h2>
            <p className="mt-1 text-xs text-slate-500">Manage identities and access from one place.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <ShieldCheck className="size-4 text-brand-700" aria-hidden="true" />
            MFA-protected administration
          </span>
        </div>
        <div className="users-filters">
          <SearchField
            label="Search users"
            placeholder="Search name, email, employee ID or user ID"
            value={search}
            maxLength={120}
            onChange={(event) => setSearch(event.target.value)}
            className="users-search"
          />
          <div className="users-filter-grid">
            <label>
              <span>Department</span>
              <Select
                aria-label="Filter by department"
                disabled={!departments.data}
                value={filters.departmentId}
                onChange={(event) => change({ departmentId: event.target.value })}
              >
                <option value="">All departments</option>
                {departments.data?.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span>Role</span>
              <Select
                aria-label="Filter by role"
                value={filters.role}
                onChange={(event) => change({ role: event.target.value })}
              >
                <option value="">All roles</option>
                <option value="EMPLOYEE">Employee</option>
                <option value="IT_SECURITY_ADMIN">Administrator</option>
              </Select>
            </label>
            <label>
              <span>Account status</span>
              <Select
                aria-label="Filter by status"
                value={filters.status}
                onChange={(event) => change({ status: event.target.value })}
              >
                <option value="">All current accounts</option>
                {Object.entries(accountStatuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span>Sort by</span>
              <Select
                aria-label="Sort users"
                value={`${filters.sort}:${filters.direction}`}
                onChange={(event) => {
                  const [sort, direction] = event.target.value.split(':');
                  change({ sort, direction });
                }}
              >
                <option value="name:asc">Name: A–Z</option>
                <option value="name:desc">Name: Z–A</option>
                <option value="createdAt:desc">Newest accounts</option>
                <option value="createdAt:asc">Oldest accounts</option>
                <option value="lastLoginAt:desc">Most recent login</option>
                <option value="lastLoginAt:asc">Oldest recorded login</option>
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              {hasFilters
                ? 'Filters applied'
                : 'Showing current accounts; removed accounts remain available in the status filter.'}
            </p>
            <Button
              variant="ghost"
              className="text-xs"
              disabled={!hasFilters && !search && filters.sort === 'name' && filters.direction === 'asc'}
              onClick={clear}
            >
              Clear filters
            </Button>
          </div>
        </div>
        <div aria-busy={directory.loading}>
          {directory.loading ? (
            <DirectorySkeleton />
          ) : directory.error ? (
            <StatePanel
              icon={AlertCircle}
              title={directory.error.status === 403 ? 'Administrator access required' : 'Unable to load users'}
              description={userError(directory.error)}
              tone="error"
              action={
                <Button variant="secondary" onClick={refresh}>
                  Try again
                </Button>
              }
            />
          ) : data?.items.length ? (
            <UserDirectory
              manualSetupEnabled={departments.data?.manualSetupEnabled}
              users={data.items}
              selectedId={selection?.id}
              onAction={open}
            />
          ) : (
            <StatePanel
              icon={hasFilters ? SearchX : Users}
              title={
                hasFilters
                  ? 'No users match your search'
                  : filters.page > 1
                    ? 'No users on this page'
                    : 'No accounts to display'
              }
              description={
                hasFilters
                  ? 'Try a different name, employee ID, or filter combination.'
                  : filters.page > 1
                    ? 'The directory has changed. Return to the first page to see current accounts.'
                    : 'Add an employee to begin managing account access.'
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" onClick={clear}>
                    Clear filters
                  </Button>
                ) : filters.page > 1 ? (
                  <Button variant="secondary" onClick={() => change({})}>
                    First page
                  </Button>
                ) : (
                  <Button disabled={!departments.data} onClick={() => open('add')}>
                    Add User
                  </Button>
                )
              }
            />
          )}
        </div>
        <nav aria-label="User directory pagination" className="users-pagination">
          <p className="text-xs text-slate-500" role="status">
            {directory.loading
              ? 'Updating directory…'
              : data
                ? data.items.length
                  ? `Showing ${(data.page - 1) * data.pageSize + 1}–${(data.page - 1) * data.pageSize + data.items.length} of ${data.total} users`
                  : `0 results on this page · ${data.total} matching users`
                : 'Results unavailable'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Per page
              <Select
                aria-label="Users per page"
                className="!w-20"
                value={filters.pageSize}
                onChange={(event) => change({ pageSize: Number(event.target.value) })}
              >
                {[20, 50, 100].map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </Select>
            </label>
            <Button
              variant="secondary"
              aria-label="Previous page"
              disabled={directory.loading || filters.page <= 1}
              onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="px-1 text-xs font-semibold text-slate-600">Page {filters.page}</span>
            <Button
              variant="secondary"
              aria-label="Next page"
              disabled={directory.loading || !data?.hasMore || filters.page >= 100000}
              onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      </Card>
      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Account changes are audited. Sensitive operations require a recent MFA sign-in.
      </p>
      <InviteLinksDialog
        open={invitesOpen}
        onClose={() => setInvitesOpen(false)}
        departments={departments.data?.departments}
        onRegistered={refresh}
      />
      {selection && (
        <UserPanel
          key={`${selection.mode}:${selection.id}:${panelRevision}`}
          selection={selection}
          options={departments.data ?? { departments: [] }}
          onClose={() => setSelection(null)}
          onSaved={saved}
          onAction={open}
          onReload={() => setPanelRevision((n) => n + 1)}
        />
      )}
    </div>
  );
}
