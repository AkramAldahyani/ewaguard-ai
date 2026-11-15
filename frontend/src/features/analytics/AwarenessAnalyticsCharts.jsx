import { BarChart3 } from 'lucide-react';
import { Card } from '../../components/ui/index.jsx';
import { count, percent } from './awareness-format.js';

const BRAND = '#087fba';
const share = (value, total) => (Number.isFinite(value) && total > 0 ? Math.min(100, (value / total) * 100) : 0);
const monthLabel = (period) =>
  /^\d{4}-\d{2}$/.test(period ?? '')
    ? new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
        new Date(`${period}-01T00:00:00Z`),
      )
    : period;

export function ChartCard({ title, description, children, footer, action, className = '' }) {
  return (
    <Card className={`flex min-w-0 flex-col p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5 min-w-0 flex-1">{children}</div>
      {footer && <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">{footer}</p>}
    </Card>
  );
}

export function EmptyChart({ children }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center text-sm text-slate-600">
      <BarChart3 className="size-5 text-slate-400" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function Bar({ value, max, color = BRAND, label }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" title={label} aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${share(value, max)}%`, background: color }} />
    </div>
  );
}

export function MetricBars({
  title,
  description,
  rows,
  unit = 'assignments',
  maximum,
  empty = 'No records in this period.',
  truncated = false,
}) {
  const max = Math.max(maximum ?? 0, ...rows.map((row) => row.value ?? 0), 0);
  return (
    <ChartCard
      title={title}
      description={description}
      footer={
        max > 0
          ? `Bar length is relative to ${count(max)} ${unit}.${truncated ? ' Showing the first 20 programs.' : ''}`
          : truncated
            ? 'Showing the first 20 programs.'
            : null
      }
    >
      {max === 0 ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <div role="list" aria-label={title} className="space-y-4">
          {rows.map((row) => (
            <div role="listitem" key={row.key ?? row.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words font-medium text-slate-700">{row.label}</span>
                <span className="shrink-0 text-right">
                  <strong className="font-semibold tabular-nums text-slate-950">
                    {row.value == null ? 'Suppressed' : count(row.value)}
                  </strong>
                  {row.detail && <span className="ml-1.5 text-xs text-slate-500">{row.detail}</span>}
                </span>
              </div>
              <Bar
                value={row.value}
                max={max}
                color={row.color}
                label={`${row.label}: ${row.value == null ? 'suppressed' : count(row.value)}${row.detail ? ` · ${row.detail}` : ''}`}
              />
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

// Part-to-whole view of current assignment status: one segmented bar plus a labelled legend list.
export function StatusBreakdown({ title, description, rows, total }) {
  return (
    <ChartCard title={title} description={description}>
      {!total ? (
        <EmptyChart>No training assignments in this period.</EmptyChart>
      ) : (
        <>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            {rows
              .filter((row) => row.value > 0)
              .map((row) => (
                <div
                  key={row.label}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  title={`${row.label}: ${count(row.value)} (${Math.round(share(row.value, total))}%)`}
                  style={{ width: `${share(row.value, total)}%`, background: row.color }}
                />
              ))}
          </div>
          <div role="list" aria-label={title} className="mt-5 grid gap-3 sm:grid-cols-3">
            {rows.map((row) => (
              <div role="listitem" key={row.label} className="rounded-xl border border-slate-200 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: row.color }}
                    aria-hidden="true"
                  />
                  {row.label}
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{count(row.value)}</p>
                <p className="text-xs text-slate-500">
                  {Math.round(share(row.value, total))}% of {count(total)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}

export function MonthlyTrends({ rows }) {
  const scored = rows.filter((row) => Number.isFinite(row.averageScorePercent));
  const left = 52,
    right = 600,
    top = 18,
    bottom = 176;
  const x = (index) =>
    left + 18 + (rows.length === 1 ? (right - left - 36) / 2 : (index * (right - left - 36)) / (rows.length - 1));
  const y = (score) => bottom - (score * (bottom - top)) / 100;
  const latest = [...rows].reverse().find((row) => Number.isFinite(row.averageScorePercent));
  const change = latest?.averageChangePoints;
  return (
    <ChartCard
      title="Monthly quiz trend"
      description="Mean of each employee’s best submitted score per quiz month, with participation as employees who submitted ÷ employees expected to take the quiz."
      action={
        latest && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-500">Latest scored month</p>
            <p className="text-sm font-semibold text-slate-900">
              {monthLabel(latest.period)} · {percent(latest.averageScorePercent)}
            </p>
            {Number.isFinite(change) && (
              <p className="text-xs text-slate-500">
                {change > 0 ? '+' : ''}
                {change} points vs previous month
              </p>
            )}
          </div>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyChart>No monthly quizzes in this period.</EmptyChart>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
            <figure className="ui-chart min-w-0" tabIndex={0} aria-label="Monthly average score trend">
              <svg
                role="img"
                aria-label={`Average score trend for ${scored.length} scored months, on a 0 to 100 percent scale`}
                viewBox="0 0 624 205"
                className="w-full"
              >
                {[0, 25, 50, 75, 100].map((tick) => (
                  <g key={tick}>
                    <line
                      x1={left}
                      x2={right}
                      y1={y(tick)}
                      y2={y(tick)}
                      stroke={tick === 0 ? '#94a3b8' : '#e8edf3'}
                      strokeDasharray={tick === 0 ? undefined : '3 4'}
                    />
                    <text x={left - 10} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#64748b">
                      {tick}%
                    </text>
                  </g>
                ))}
                {rows
                  .slice(1)
                  .map((row, index) =>
                    Number.isFinite(row.averageScorePercent) && Number.isFinite(rows[index].averageScorePercent) ? (
                      <line
                        key={row.period}
                        x1={x(index)}
                        y1={y(rows[index].averageScorePercent)}
                        x2={x(index + 1)}
                        y2={y(row.averageScorePercent)}
                        stroke={BRAND}
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    ) : null,
                  )}
                {rows.map((row, index) => (
                  <g key={row.period}>
                    {Number.isFinite(row.averageScorePercent) && (
                      <g>
                        <title>{`${monthLabel(row.period)}: mean best score ${percent(row.averageScorePercent)} · ${count(row.submitted)} of ${count(row.assigned)} submitted`}</title>
                        <circle cx={x(index)} cy={y(row.averageScorePercent)} r="12" fill="transparent" />
                        <circle
                          cx={x(index)}
                          cy={y(row.averageScorePercent)}
                          r="4.5"
                          fill={BRAND}
                          stroke="#fff"
                          strokeWidth="2"
                        />
                        {(rows.length <= 6 || row === latest) && (
                          <text
                            x={x(index)}
                            y={y(row.averageScorePercent) - 10}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="600"
                            fill="#334155"
                          >
                            {Math.round(row.averageScorePercent)}%
                          </text>
                        )}
                      </g>
                    )}
                    <text x={x(index)} y="197" textAnchor="middle" fontSize="11" fill="#64748b">
                      {monthLabel(row.period)}
                    </text>
                  </g>
                ))}
              </svg>
              <figcaption className="mt-1 text-xs text-slate-500">
                Score axis 0–100%. Hover a point for details; gaps mark months without scores.
              </figcaption>
            </figure>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-800">Participation by month</h3>
              <div role="list" aria-label="Monthly participation" className="mt-4 space-y-3.5">
                {rows.map((row) => (
                  <div key={row.period} role="listitem">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-slate-600">{monthLabel(row.period)}</span>
                      <span className="tabular-nums">
                        <strong className="font-semibold text-slate-900">
                          {percent(row.participationRatePercent)}
                        </strong>
                        <span className="ml-1.5 text-xs text-slate-500">
                          {count(row.submitted)} / {count(row.assigned)}
                        </span>
                      </span>
                    </div>
                    <Bar
                      value={row.participationRatePercent ?? 0}
                      max={100}
                      label={`${monthLabel(row.period)}: ${count(row.submitted)} of ${count(row.assigned)} submitted`}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Bars show 0–100% of expected employees, including those who never started.
              </p>
            </div>
          </div>
          <details className="mt-5 rounded-xl border border-slate-200">
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600">
              View monthly data table
            </summary>
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="w-full min-w-[35rem] text-left text-sm">
                <caption className="sr-only">Monthly quiz participation and best score averages</caption>
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="p-3">
                      Month
                    </th>
                    <th scope="col" className="p-3">
                      Expected
                    </th>
                    <th scope="col" className="p-3">
                      Submitted
                    </th>
                    <th scope="col" className="p-3">
                      Mean best score
                    </th>
                    <th scope="col" className="p-3">
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className="border-t border-slate-100" key={row.period}>
                      <th scope="row" className="p-3 font-semibold">
                        {row.period}
                      </th>
                      <td className="p-3 tabular-nums">{count(row.assigned)}</td>
                      <td className="p-3 tabular-nums">{count(row.submitted)}</td>
                      <td className="p-3 tabular-nums">{percent(row.averageScorePercent)}</td>
                      <td className="p-3 tabular-nums">
                        {row.averageChangePoints == null
                          ? 'Unavailable'
                          : `${row.averageChangePoints > 0 ? '+' : ''}${row.averageChangePoints} points`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </ChartCard>
  );
}
