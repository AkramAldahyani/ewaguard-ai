import { Card } from '../../components/ui/index.jsx';

const label = (value) => String(value ?? '').toLowerCase().replaceAll('_', ' ').replace(/^\w/u, (letter) => letter.toUpperCase());
const number = (value) => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '—';

export function CreationTrend({ days }) {
  const highest = Math.max(0, ...days.map((day) => day.count));
  const scale = Math.max(highest, 1);
  const left = 46, top = 15, width = 566, height = 158;
  const x = (index) => left + (days.length === 1 ? width / 2 : index * width / (days.length - 1));
  const y = (value) => top + height - (value / scale) * height;
  const points = days.map((day, index) => `${x(index)},${y(day.count)}`).join(' ');
  const labels = [...new Set([0, Math.floor(highest / 2), highest])];
  const ticks = days.filter((_, index) => index === 0 || index === days.length - 1 || index % Math.max(1, Math.ceil(days.length / 6)) === 0);
  return <Card className="min-w-0 p-5 sm:p-6"><h2 className="text-lg font-bold text-slate-950">Incidents created by day</h2><p className="mt-1 text-sm text-slate-500">UTC creation dates. The vertical scale starts at zero.</p>{highest === 0 ? <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">No incidents were created during this period.</p> : <figure className="mt-6" aria-label="Daily incident creation trend"><svg viewBox="0 0 640 215" role="img" aria-label={`Incident creation trend: ${days.length} UTC days, maximum ${highest} incidents in a day`} className="w-full overflow-visible" preserveAspectRatio="xMidYMid meet">
      {labels.map((tick) => <g key={tick}><line x1={left} y1={y(tick)} x2={left + width} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" /><text x={left - 9} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#475569">{tick}</text></g>)}
      <polyline points={points} fill="none" stroke="#176b91" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {days.length <= 30 && days.map((day, index) => <circle key={day.day} cx={x(index)} cy={y(day.count)} r="2.5" fill="#176b91" />)}
      {ticks.map((day) => <text key={day.day} x={x(days.indexOf(day))} y="202" textAnchor="middle" fontSize="10" fill="#475569">{day.day.slice(5)}</text>)}
    </svg><figcaption className="mt-1 text-xs text-slate-500">Horizontal axis: UTC date · Vertical axis: incident count</figcaption></figure>}
    <details className="mt-5 rounded-xl border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600">View daily counts as a table</summary><div className="max-h-64 overflow-auto border-t border-slate-200"><table className="w-full text-left text-sm"><caption className="sr-only">Incident creation counts by UTC day</caption><thead><tr className="bg-slate-50"><th scope="col" className="px-4 py-2">UTC date</th><th scope="col" className="px-4 py-2 text-right">Incidents</th></tr></thead><tbody>{days.map((day) => <tr key={day.day} className="border-t border-slate-100"><th scope="row" className="px-4 py-2 font-medium">{day.day}</th><td className="px-4 py-2 text-right tabular-nums">{number(day.count)}</td></tr>)}</tbody></table></div></details></Card>;
}

export function DistributionChart({ title, description, rows, total, tone = 'brand' }) {
  const fill = tone === 'danger' ? 'bg-danger-600' : tone === 'warning' ? 'bg-warning-500' : 'bg-brand-600';
  return <Card className="min-w-0 p-5 sm:p-6"><h2 className="text-lg font-bold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p>{total === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">No incidents in this period.</p> : <div className="mt-5 space-y-3" role="list" aria-label={title}>{rows.map((row) => <div key={row.value} role="listitem"><div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 break-words font-medium text-slate-700">{label(row.value)}</span><span className="shrink-0 font-bold tabular-nums text-slate-900">{number(row.count)}</span></div><div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(0, Math.min(100, row.count / total * 100))}%` }} /></div></div>)}</div>}<p className="mt-4 text-xs text-slate-500">Bar scale: 0 to {number(total)} incidents. Counts are shown beside each category.</p></Card>;
}

export function AssignmentChart({ assigned, unassigned }) {
  const total = assigned + unassigned;
  return <DistributionChart title="Current assignment" description="Assignment state of incidents created in the selected period." total={total}
    rows={[{ value: 'ASSIGNED', count: assigned }, { value: 'UNASSIGNED', count: unassigned }]} />;
}
