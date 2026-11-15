import { CalendarRange, Check, Info } from 'lucide-react';
import { Button, Card, Input } from '../../components/ui/index.jsx';

const presets = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'custom', label: 'Custom' },
];

const appliedLabel = (value) =>
  value.period === 'custom'
    ? value.start && value.end
      ? `${value.start} – ${value.end}`
      : 'Custom dates'
    : `Last ${Number.parseInt(value.period, 10)} days`;

export function AnalyticsPeriodFilter({ draft, applied, setDraft, validation, errorId, onSubmit, subject }) {
  const changed =
    draft.period !== applied.period ||
    (draft.period === 'custom' && (draft.start !== applied.start || draft.end !== applied.end));
  const selectPeriod = (period) => setDraft((current) => ({ ...current, period }));
  return (
    <Card className="mb-6 overflow-hidden">
      <form onSubmit={onSubmit}>
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <CalendarRange className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold text-slate-950">Reporting window</h2>
              <p className="mt-1 text-sm text-slate-500">Choose the UTC dates used across {subject}.</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-800 ring-1 ring-inset ring-success-200">
            <Check className="size-3.5" aria-hidden="true" />
            Applied: {appliedLabel(applied)}
          </span>
        </div>
        <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-4 sm:px-6">
          <div
            className={`grid gap-4 ${draft.period === 'custom' ? 'xl:grid-cols-[auto_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] xl:items-end' : 'lg:grid-cols-[1fr_auto] lg:items-end'}`}
          >
            <fieldset className="min-w-0">
              <legend className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                Reporting period
              </legend>
              <div
                className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:inline-grid sm:grid-cols-4"
                aria-label="Reporting period"
              >
                {presets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    aria-pressed={draft.period === preset.value}
                    onClick={() => selectPeriod(preset.value)}
                    className={`min-h-9 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 ${draft.period === preset.value ? 'bg-brand-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </fieldset>
            {draft.period === 'custom' && (
              <>
                <label className="text-sm font-semibold text-slate-700">
                  Start date <span className="font-normal text-slate-500">(UTC)</span>
                  <Input
                    className="mt-2 bg-white"
                    type="date"
                    value={draft.start}
                    onChange={(event) => setDraft((value) => ({ ...value, start: event.target.value }))}
                    aria-invalid={Boolean(validation)}
                    aria-describedby={validation ? errorId : undefined}
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  End date <span className="font-normal text-slate-500">(UTC)</span>
                  <Input
                    className="mt-2 bg-white"
                    type="date"
                    value={draft.end}
                    min={draft.start || undefined}
                    onChange={(event) => setDraft((value) => ({ ...value, end: event.target.value }))}
                    aria-invalid={Boolean(validation)}
                    aria-describedby={validation ? errorId : undefined}
                  />
                </label>
              </>
            )}
            <Button type="submit" disabled={!changed} className="min-w-32 justify-center">
              {changed ? 'Apply period' : 'Period applied'}
            </Button>
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p>
              {draft.period === 'custom'
                ? 'Both dates are included. Custom windows can span up to 90 days.'
                : 'All dates, totals, and charts use the same UTC reporting window.'}
            </p>
          </div>
          {validation && (
            <p
              id={errorId}
              role="alert"
              className="mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700"
            >
              {validation}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}
