import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle } from 'lucide-react';
import { UserIdentity, CopyIdentifier } from '../../components/UserIdentity.jsx';
import { Button, Card, Pagination, RiskBadge, StatePanel } from '../../components/ui/index.jsx';
import { securityAnalyticsApi, securityAnalyticsError } from './security-analytics-api.js';

const colors = { LOW: '#15803d', MEDIUM: '#a16207', HIGH: '#c2410c', CRITICAL: '#b91c1c' };
const number = (value) => value.toLocaleString();
const typeLabel = (value) => (value === 'FILE_HASH' ? 'SHA-256 check' : value);
export function AnalysisOverview({ data, range }) {
  if (!data)
    return <Card className="p-5">Analysis statistics are unavailable. Refresh after the backend is updated.</Card>;
  const max = Math.max(1, ...data.daily.map((r) => r.count));
  const points = data.daily
    .map((r, i) => `${20 + (i * 560) / Math.max(1, data.daily.length - 1)},${160 - (r.count / max) * 140}`)
    .join(' ');
  const slices = data.severity.map((row, index) => ({
    ...row,
    size: data.total ? (row.count / data.total) * 100 : 0,
    start: data.total
      ? (data.severity.slice(0, index).reduce((sum, item) => sum + item.count, 0) / data.total) * 100
      : 0,
  }));
  return (
    <section aria-label="Analysis statistics" className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[{ value: 'Total completed analyses', count: data.total }, ...data.severity].map((row) => (
          <Card key={row.value} className="p-5">
            <p className="text-sm font-semibold text-slate-600">{row.value}</p>
            <p className="mt-3 text-3xl font-bold tabular-nums" style={{ color: colors[row.value] }}>
              {number(row.count)}
            </p>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Completed, classified analyses in the selected period. Risk is the stored deterministic assessment, not a
        guarantee of safety. Unclassified: {data.unclassified}; recorded errors: {data.failed}. Retention limits
        historical coverage; rejected submissions are not completed scans.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-lg font-bold">Analysis activity over time</h2>
          {data.total ? (
            <svg viewBox="0 0 600 190" role="img" aria-label="Completed analyses by UTC day" className="mt-5 w-full">
              <line x1="20" y1="160" x2="580" y2="160" stroke="#cbd5e1" />
              <polygon points={`20,160 ${points} 580,160`} fill="#e0f2fe" />
              <polyline points={points} fill="none" stroke="#176b91" strokeWidth="3" />
              <text x="20" y="15" fontSize="12">
                {max}
              </text>
              <text x="20" y="180" fontSize="11">
                {data.daily[0]?.day}
              </text>
              <text x="580" y="180" textAnchor="end" fontSize="11">
                {data.daily.at(-1)?.day}
              </text>
            </svg>
          ) : (
            <p className="py-10 text-sm text-slate-500">No completed analyses in this period.</p>
          )}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-brand-800">View daily analysis counts</summary>
            <div className="mt-3 max-h-56 overflow-auto">
              <table className="w-full text-left">
                <caption className="sr-only">Completed analyses by UTC day</caption>
                <thead>
                  <tr>
                    <th>UTC date</th>
                    <th>Analyses</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((r) => (
                    <tr key={r.day}>
                      <td>{r.day}</td>
                      <td>{number(r.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
        <Card className="p-5">
          <h2 className="text-lg font-bold">Analysis risk distribution</h2>
          <div className="mt-5 flex flex-wrap items-center gap-6">
            <svg viewBox="0 0 120 120" role="img" aria-label="Analysis risk distribution" className="size-40">
              <circle cx="60" cy="60" r="44" fill="none" stroke="#e2e8f0" strokeWidth="15" />
              {slices.map(({ value, size, start }) => (
                <circle
                  key={value}
                  cx="60"
                  cy="60"
                  r="44"
                  pathLength="100"
                  fill="none"
                  stroke={colors[value]}
                  strokeWidth="15"
                  strokeDasharray={`${size} ${100 - size}`}
                  strokeDashoffset={-start}
                  transform="rotate(-90 60 60)"
                />
              ))}
              <text x="60" y="65" textAnchor="middle" fontSize="18" fontWeight="700">
                {number(data.total)}
              </text>
            </svg>
            <ul className="min-w-40 flex-1 space-y-3">
              {data.severity.map((r) => (
                <li key={r.value} className="flex items-center justify-between gap-4 text-sm">
                  <RiskBadge level={r.value} />
                  <span className="tabular-nums">
                    {number(r.count)} · {data.total ? ((r.count / data.total) * 100).toFixed(1) : '0.0'}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <h2 className="text-lg font-bold">Analysis type breakdown</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {data.byType.map((r) => (
            <div key={r.value}>
              <div className="flex justify-between text-sm font-semibold">
                <span>{typeLabel(r.value)}</span>
                <span>{number(r.count)}</span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-slate-100" aria-hidden="true">
                <div
                  className="h-3 rounded-full bg-brand-600"
                  style={{ width: `${data.total ? (r.count / data.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <RecentAnalyses items={data.recent} pagination={data.recentPage} range={range} />
    </section>
  );
}

const recentColumns = [
  'Analysis ID',
  'Submitted by / User ID',
  'Date / time (UTC)',
  'Type',
  'Risk',
  'Score',
  'Status',
  'Incident',
];

// Page 1 arrives with the overview; later pages are fetched for the same reporting window, ten at a time.
function RecentAnalyses({ items = [], pagination, range }) {
  const initial = { items, page: 1, pageSize: 10, total: items.length, totalPages: 1, ...pagination };
  const [page, setPage] = useState(initial.page),
    [retry, setRetry] = useState(0),
    [result, setResult] = useState(null);
  const useInitial = page === initial.page && retry === 0;
  useEffect(() => {
    if (useInitial || !range) return undefined;
    const controller = new AbortController();
    securityAnalyticsApi
      .analyses(range, page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ page, retry, data, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ page, retry, data: null, error: securityAnalyticsError(error) });
      });
    return () => controller.abort();
  }, [page, retry, range, useInitial]);
  const current = useInitial
    ? { data: initial, error: '' }
    : result?.page === page && result.retry === retry
      ? result
      : null;
  const shown = current?.data ?? null,
    loading = !current;
  const currentPage = shown?.page ?? page,
    totalPages = shown?.totalPages ?? initial.totalPages;
  const first = shown && shown.total ? (shown.page - 1) * shown.pageSize + 1 : 0,
    last = shown ? first + shown.items.length - (shown.items.length ? 1 : 0) : 0;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-2 p-5">
        <div>
          <h2 className="text-lg font-bold">Recent analyses</h2>
          <p className="mt-1 text-sm text-slate-500">
            Completed classifications in this period, newest first. Original submissions are not displayed.
          </p>
        </div>
        {shown && (
          <p className="text-xs font-semibold text-slate-500">
            {shown.total.toLocaleString()} {shown.total === 1 ? 'analysis' : 'analyses'}
          </p>
        )}
      </div>
      {current?.error ? (
        <div className="border-t border-slate-100 p-5">
          <StatePanel
            icon={AlertCircle}
            tone="error"
            title="Recent analyses unavailable"
            description={current.error}
            action={
              <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
                Try again
              </Button>
            }
          />
        </div>
      ) : (
        <div className="relative overflow-x-auto" aria-busy={loading}>
          <table
            className={`w-full whitespace-nowrap text-left text-sm transition-opacity ${loading ? 'opacity-50' : ''}`}
          >
            <caption className="sr-only">Recent analyses</caption>
            <thead className="bg-slate-50">
              <tr>
                {recentColumns.map((s) => (
                  <th key={s} scope="col" className="px-5 py-3">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(shown?.items ?? []).map((r) => (
                <tr key={`${r.type}:${r.id}`} className="border-t border-slate-100">
                  <td className="min-w-56 whitespace-normal px-5 py-3">
                    <CopyIdentifier value={r.id} label="Analysis ID" />
                  </td>
                  <td className="min-w-64 px-5 py-3">
                    <UserIdentity user={r.submittedBy} userId={r.userId} />
                  </td>
                  <td className="px-5 py-3">{new Date(r.analyzedAt).toISOString().replace('T', ' ').slice(0, 19)}</td>
                  <td className="px-5 py-3">{typeLabel(r.type)}</td>
                  <td className="px-5 py-3">
                    <RiskBadge level={r.severity} />
                  </td>
                  <td className="px-5 py-3">{r.riskScore ?? 'Unavailable'}</td>
                  <td className="px-5 py-3">{r.status}</td>
                  <td className="px-5 py-3">
                    {r.incidentId ? (
                      <Link
                        className="font-semibold text-brand-800 underline focus-visible:outline-2"
                        to={`/admin/incidents/${r.incidentId}`}
                      >
                        {r.incidentReference}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <p role="status" className="px-5 py-3 text-sm text-slate-500">
              Loading page {page}…
            </p>
          )}
          {shown && !shown.items.length && (
            <p className="p-6 text-center text-sm text-slate-500">No recent analyses in this period.</p>
          )}
        </div>
      )}
      <Pagination
        label="Recent analyses pages"
        page={currentPage}
        pages={totalPages}
        numbers
        disabled={loading}
        onChange={(next) => setPage(Math.min(Math.max(1, next), totalPages))}
        summary={shown?.total ? `Showing ${first}–${last} of ${shown.total.toLocaleString()}` : undefined}
      />
    </Card>
  );
}
