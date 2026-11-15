import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
const shortMonths = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month, 1))),
);
const longLabel = (year, month) =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month, 1)),
  );
const toPeriod = (year, month) => `${year}-${String(month + 1).padStart(2, '0')}`;
const currentPeriod = () => new Date().toISOString().slice(0, 7);

const clampYear = (year, min, max) =>
  Math.min(Number(max?.slice(0, 4) ?? Infinity), Math.max(Number(min?.slice(0, 4) ?? -Infinity), year));

// Compact month selector: a field-styled trigger with a year/month grid popover. Values use YYYY-MM.
// Optional `min`/`max` (YYYY-MM) grey out months outside an allowed range.
export function MonthPicker({
  value = '',
  onChange,
  label = 'Month',
  emptyLabel = 'All months',
  clearable = true,
  disabled = false,
  inlineLabel = true,
  min,
  max,
  className,
}) {
  const match = PERIOD.exec(value);
  const today = currentPeriod();
  const openingYear = () => clampYear(Number(match?.[1] ?? today.slice(0, 4)), min, max);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(openingYear);
  const root = useRef(null),
    trigger = useRef(null),
    grid = useRef(null);
  const popoverId = useId(),
    labelId = useId();
  const allowed = (period) => (!min || period >= min) && (!max || period <= max);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    grid.current?.querySelector('[data-active="true"]')?.focus();
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  const toggle = () => {
    if (!open) setYear(openingYear());
    setOpen(!open);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (period) => {
    onChange(period);
    close();
  };
  const activeMonth =
    match && Number(match[1]) === year
      ? Number(match[2]) - 1
      : Number(today.slice(0, 4)) === year
        ? Number(today.slice(5)) - 1
        : 0;
  function onGridKey(event) {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const buttons = [...grid.current.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    buttons[Math.min(11, Math.max(0, (index < 0 ? activeMonth : index) + offsets[event.key]))]?.focus();
  }

  return (
    <div
      ref={root}
      className={cn('relative inline-flex min-w-0', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <div className="flex w-full min-w-0 items-center rounded-[0.7rem] border border-slate-300 bg-white shadow-xs focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-500/15">
        <button
          ref={trigger}
          type="button"
          disabled={disabled}
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          aria-labelledby={`${labelId} ${labelId}-value`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[0.7rem] py-2 pl-3 pr-2 text-left text-sm outline-none disabled:opacity-60"
        >
          <CalendarDays className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {inlineLabel && (
              <span
                className="block text-[0.65rem] font-bold uppercase leading-3 tracking-[0.08em] text-slate-500"
                aria-hidden="true"
              >
                {label}
              </span>
            )}
            <span id={`${labelId}-value`} className="block truncate font-semibold text-slate-900">
              {match ? longLabel(Number(match[1]), Number(match[2]) - 1) : emptyLabel}
            </span>
          </span>
          <ChevronDown
            className={cn('size-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
        {clearable && match && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange('');
              trigger.current?.focus();
            }}
            aria-label={`Clear ${label.toLowerCase()} filter`}
            title="Clear"
            className="mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={`Choose ${label.toLowerCase()}`}
          className="absolute left-0 top-full z-40 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-float sm:left-auto sm:right-0"
        >
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <button
              type="button"
              disabled={clampYear(year - 1, min, max) !== year - 1}
              onClick={() => setYear(year - 1)}
              aria-label={`Previous year, ${year - 1}`}
              className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <p className="text-sm font-bold tabular-nums text-slate-900" aria-live="polite">
              {year}
            </p>
            <button
              type="button"
              disabled={clampYear(year + 1, min, max) !== year + 1}
              onClick={() => setYear(year + 1)}
              aria-label={`Next year, ${year + 1}`}
              className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div
            ref={grid}
            role="group"
            aria-label={`Months in ${year}`}
            className="grid grid-cols-3 gap-1.5"
            onKeyDown={onGridKey}
          >
            {shortMonths.map((name, month) => {
              const period = toPeriod(year, month),
                selected = period === value,
                isCurrent = period === today,
                available = allowed(period);
              return (
                <button
                  key={period}
                  type="button"
                  disabled={!available}
                  onClick={() => choose(period)}
                  aria-pressed={selected}
                  aria-label={`${longLabel(year, month)}${isCurrent ? ', current month' : ''}${available ? '' : ', outside the selected range'}`}
                  data-active={month === activeMonth}
                  tabIndex={month === activeMonth ? 0 : -1}
                  className={cn(
                    'relative min-h-10 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
                    selected
                      ? 'bg-brand-600 text-white shadow-button'
                      : available
                        ? 'text-slate-700 hover:bg-brand-50 hover:text-brand-800'
                        : 'text-slate-300 line-through decoration-slate-300',
                    isCurrent && !selected && 'ring-1 ring-inset ring-brand-300',
                  )}
                >
                  {name}
                  {isCurrent && (
                    <span
                      className={cn(
                        'absolute bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full',
                        selected ? 'bg-white' : 'bg-brand-600',
                      )}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            {clearable ? (
              <button
                type="button"
                onClick={() => choose('')}
                className="min-h-9 rounded-lg px-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                {emptyLabel}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={!allowed(today)}
              onClick={() => choose(today)}
              className="min-h-9 rounded-lg px-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              This month
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
