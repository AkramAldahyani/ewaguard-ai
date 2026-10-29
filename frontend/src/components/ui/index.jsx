import { Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const buttonVariants = {
  primary: 'bg-brand-600 text-white shadow-button hover:bg-brand-700 active:bg-brand-800',
  secondary: 'border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  danger: 'bg-danger-600 text-white shadow-button hover:bg-danger-700',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
};

export function Button({ as: Component = 'button', variant = 'primary', size = 'md', className, type = 'button', children, ...props }) {
  const sizes = { sm: 'min-h-11 px-3 text-sm', md: 'min-h-11 px-4 text-sm', lg: 'min-h-12 px-5 text-base' };
  const buttonProps = Component === 'button' ? { type } : {};
  return <Component {...buttonProps} className={cn('ui-button', buttonVariants[variant], sizes[size], className)} {...props}>{children}</Component>;
}

export function IconButton({ label, className, children, ...props }) {
  return <button type="button" aria-label={label} title={label} className={cn('ui-icon-button', className)} {...props}>{children}</button>;
}

export function Card({ className, children, ...props }) {
  return <section className={cn('ui-card', className)} {...props}>{children}</section>;
}

export function Badge({ tone = 'neutral', children, className }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700 ring-slate-200', brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    success: 'bg-success-50 text-success-700 ring-success-200', warning: 'bg-warning-50 text-warning-800 ring-warning-200',
    danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  };
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

export function RiskBadge({ level, score, neutral = false }) {
  const styles = {
    LOW: 'bg-success-50 text-success-800 ring-success-200', MEDIUM: 'bg-warning-50 text-warning-900 ring-warning-300',
    HIGH: 'bg-danger-50 text-danger-800 ring-danger-200', CRITICAL: 'bg-danger-700 text-white ring-danger-700',
  };
  const labels = { LOW: 'Low risk', MEDIUM: 'Medium risk', HIGH: 'High risk', CRITICAL: 'Critical risk' };
  const normalizedLevel = typeof level === 'string' ? level.trim().toUpperCase() : '';
  if (!labels[normalizedLevel]) {
    return <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-inset ring-slate-300"><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />Risk unavailable</span>;
  }
  const badgeStyle = neutral ? 'bg-slate-100 text-slate-700 ring-slate-300' : styles[normalizedLevel];
  return <span className={cn('inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset', badgeStyle)}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{labels[normalizedLevel]}{Number.isFinite(score) && <span className="font-medium opacity-80">{score}/100</span>}</span>;
}

export function Field({ label, hint, error, id, children, required = false }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return <div className="space-y-1.5"><label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}{required && <span className="ml-1 text-danger-600" aria-hidden="true">*</span>}</label>{children({ id, required, 'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined, invalid: Boolean(error) })}{hint && <p id={hintId} className="text-xs leading-5 text-slate-500">{hint}</p>}{error && <p id={errorId} className="text-xs font-medium text-danger-700" role="alert">{error}</p>}</div>;
}

export function Input({ className, invalid, ...props }) {
  return <input className={cn('ui-field', invalid && 'border-danger-400 focus:border-danger-500 focus:ring-danger-500/15', className)} aria-invalid={invalid || undefined} {...props} />;
}

export function Select({ className, invalid, children, ...props }) {
  return <select className={cn('ui-field', invalid && 'border-danger-400', className)} aria-invalid={invalid || undefined} {...props}>{children}</select>;
}

export function Textarea({ className, invalid, ...props }) {
  return <textarea className={cn('ui-field min-h-28 resize-y py-2.5', invalid && 'border-danger-400', className)} aria-invalid={invalid || undefined} {...props} />;
}

export function SearchField({ label = 'Search', onFilter, className, ...props }) {
  return <div className={cn('flex min-w-0 items-center gap-2', className)}><label className="relative block min-w-0 flex-1"><span className="sr-only">{label}</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" className="ui-field pl-9" placeholder={label} {...props} /></label>{onFilter && <IconButton label="Open filters" onClick={onFilter}><SlidersHorizontal className="size-4" /></IconButton>}</div>;
}

export function Skeleton({ className }) {
  return <span className={cn('block max-w-full animate-pulse rounded-lg bg-slate-200', className)} aria-hidden="true" />;
}

export function LoadingPanel({ label = 'Loading…' }) {
  return <Card className="p-5 sm:p-6"><div role="status" className="space-y-3 text-sm text-slate-600"><Skeleton className="h-5 w-44" /><Skeleton className="h-20 w-full" /><p>{label}</p></div></Card>;
}

export function StatePanel({ icon: Icon, title, description, action, tone = 'neutral' }) {
  return <div className="ui-state-panel" role={tone === 'error' ? 'alert' : undefined}><span className={cn('mb-4 grid size-12 place-items-center rounded-xl', tone === 'error' ? 'bg-danger-50 text-danger-700 ring-1 ring-danger-200' : 'bg-brand-50 text-brand-700 ring-1 ring-brand-100')}><Icon className="size-5" aria-hidden="true" /></span><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-600">{description}</p>{action && <div className="mt-5 flex max-w-full flex-wrap justify-center gap-2">{action}</div>}</div>;
}

export function Table({ caption, columns, rows }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><caption className="sr-only">{caption}</caption><thead><tr className="border-b border-slate-200 bg-slate-50/80">{columns.map((column) => <th key={column.key} scope="col" className="whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="transition-colors hover:bg-slate-50/80">{columns.map((column) => <td key={column.key} className="max-w-72 break-words px-5 py-4 align-top text-slate-700">{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody></table></div>;
}

export function Pagination({ page = 1, pages = 1, onChange = () => {} }) {
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"><p className="text-sm text-slate-500">Page <strong className="text-slate-700">{page}</strong> of {pages}</p><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button></div></nav>;
}

export function Tabs({ tabs, active, onChange, label = 'Sections', panelId }) {
  const handleKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.id === active);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
      (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[nextIndex].id);
    event.currentTarget.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };
  return <div role="tablist" aria-label={label} onKeyDown={handleKeyDown} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xs">{tabs.map((tab) => <button key={tab.id} id={panelId ? `${panelId}-${tab.id}` : undefined} type="button" role="tab" aria-controls={panelId} aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1} onClick={() => onChange(tab.id)} className={cn('min-h-9 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors', active === tab.id ? 'bg-navy-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}>{tab.label}</button>)}</div>;
}

export function Tooltip({ label, children }) {
  return <span className="group relative inline-flex">{children}<span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-xs text-white group-hover:block group-focus-within:block">{label}</span></span>;
}
