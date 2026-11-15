import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpenCheck,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  GraduationCap,
  RefreshCw,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Badge, Button, Card, Input, Select, Skeleton, StatePanel } from '../../components/ui/index.jsx';
import { MonthPicker } from '../../components/ui/MonthPicker.jsx';
import {
  awarenessAnalyticsApi,
  awarenessAnalyticsError,
  awarenessMonthBounds,
  validateAwarenessFilters,
} from './awareness-analytics-api.js';
import { ChartCard, EmptyChart, MetricBars, MonthlyTrends, StatusBreakdown } from './AwarenessAnalyticsCharts.jsx';
import { STATUS_COLORS, count, percent } from './awareness-format.js';
import { countLabel, displayLabel } from '../../lib/labels.js';

const initial = { period: '90d', start: '', end: '', programId: '', completionStatus: '', monthlyPeriod: '' };
const label = (value) => displayLabel(String(value ?? ''));
const monthLabel = (period) =>
  /^\d{4}-\d{2}$/.test(period ?? '')
    ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${period}-01T00:00:00Z`),
      )
    : period;
const fieldLabel = 'block text-xs font-semibold text-slate-600';

function Kpi({ title, value, detail, icon: Icon, meter }) {
  return (
    <Card className="flex h-full min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
        <p className="min-w-0 text-sm font-semibold text-slate-600">{title}</p>
      </div>
      <p className="mt-4 text-[1.75rem] font-bold leading-none tabular-nums tracking-tight text-slate-950">{value}</p>
      {meter !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div
            className="h-full rounded-full bg-brand-600"
            style={{ width: `${Number.isFinite(meter) ? Math.min(100, Math.max(0, meter)) : 0}%` }}
          />
        </div>
      )}
      <p className="mt-auto pt-3 text-xs leading-5 text-slate-500">{detail}</p>
    </Card>
  );
}

function Section({ id, title, description, children }) {
  return (
    <section className="space-y-5" aria-labelledby={id}>
      <div className="border-l-[3px] border-brand-600 pl-3.5">
        <h2 id={id} className="text-lg font-bold leading-tight tracking-tight text-slate-950">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading awareness analytics" className="space-y-8">
      {[0, 1].map((section) => (
        <div key={section} className="space-y-5">
          <Skeleton className="h-6 w-48" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Card key={index} className="p-5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-4 h-8 w-16" />
                <Skeleton className="mt-4 h-3 w-36" />
              </Card>
            ))}
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            {[0, 1].map((index) => (
              <Card key={index} className="p-6">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-6 h-36 w-full" />
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RateCell({ value, part, whole }) {
  if (whole == null) return <span className="text-slate-500">Unavailable or suppressed</span>;
  return (
    <div className="min-w-36">
      <div className="flex items-baseline justify-between gap-2">
        <strong className="font-semibold tabular-nums text-slate-900">{percent(value)}</strong>
        <span className="text-xs tabular-nums text-slate-500">
          {count(part)} / {count(whole)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div
          className="h-full rounded-full bg-brand-600"
          style={{ width: `${Number.isFinite(value) ? Math.min(100, value) : 0}%` }}
        />
      </div>
    </div>
  );
}

function DepartmentPanel({ departments }) {
  return (
    <ChartCard
      title="Department comparison"
      description="Current department membership. Small groups and sparse measures are hidden to protect employee privacy."
    >
      {departments.suppressed ? (
        <p role="status" className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900">
          Department comparisons are hidden because a group has fewer than {departments.minimumGroupSize} active
          employees or the comparison exceeds the supported size.
        </p>
      ) : departments.rows.length === 0 ? (
        <EmptyChart>No eligible department comparisons are available.</EmptyChart>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Eligible department training and monthly quiz comparisons</caption>
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-5 py-3 sm:px-6">
                  Department
                </th>
                <th scope="col" className="px-4 py-3">
                  Training completion
                </th>
                <th scope="col" className="px-4 py-3">
                  Monthly participation
                </th>
                <th scope="col" className="px-5 py-3 sm:px-6">
                  Monthly mean best score
                </th>
              </tr>
            </thead>
            <tbody>
              {departments.rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                  <th scope="row" className="px-5 py-3.5 font-semibold text-slate-900 sm:px-6">
                    {row.name}
                  </th>
                  <td className="px-4 py-3.5">
                    <RateCell
                      value={row.completionRatePercent}
                      part={row.completedAssignments}
                      whole={row.trainingAssignments}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <RateCell
                      value={row.monthlyParticipationRatePercent}
                      part={row.monthlySubmitted}
                      whole={row.monthlyAssigned}
                    />
                  </td>
                  <td className="px-5 py-3.5 tabular-nums sm:px-6">
                    {row.monthlyAverageScorePercent == null ? (
                      <span className="text-slate-500">
                        {row.monthlySubmitted === 0 ? 'No data' : 'Unavailable or suppressed'}
                      </span>
                    ) : (
                      <strong className="font-semibold text-slate-900">
                        {percent(row.monthlyAverageScorePercent)}
                      </strong>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

function CoursePerformance({ course }) {
  const max = Math.max(1, ...course.byProgram.map((row) => row.submittedAttempts));
  return (
    <ChartCard
      title="Course quiz performance"
      description="Submitted attempts, including retries; participants count distinct employees."
      footer={course.programsTruncated ? 'Showing the first 20 programs.' : null}
    >
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Passed attempts', count(course.passedAttempts)],
          ['Failed attempts', count(course.failedAttempts)],
          ['Pass rate', percent(course.passRatePercent)],
        ].map(([title, value]) => (
          <div key={title} className="rounded-xl border border-slate-200 p-3.5">
            <p className="text-xs text-slate-500">{title}</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-950">{value}</p>
          </div>
        ))}
      </div>
      {course.byProgram.length ? (
        <ul className="mt-5 space-y-4">
          {course.byProgram.map((row) => (
            <li key={row.id} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-800">{row.title}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  {countLabel(row.submittedAttempts, 'attempt')} ·{' '}
                  {countLabel(row.uniqueParticipants, 'person', 'people')} ·{' '}
                  <strong className="font-semibold text-slate-800">{percent(row.averageScorePercent)} mean</strong>
                </span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                aria-hidden="true"
                title={`${row.title}: ${count(row.submittedAttempts)} attempts`}
              >
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${(row.submittedAttempts / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5">
          <EmptyChart>No submitted course quiz attempts in this period.</EmptyChart>
        </div>
      )}
    </ChartCard>
  );
}

export function AwarenessAnalyticsContent({ data }) {
  const { training, courseQuizzes: course, monthlyQuizzes: monthly, certificates } = data;
  return (
    <div className="space-y-10">
      <Section
        id="awareness-training-heading"
        title="Training"
        description="Assignment cohort created during the reporting window; statuses reflect current progress and certificates use their issue dates."
      >
        <div aria-label="Training metrics" role="group" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            title="Training assignments"
            value={count(training.assignments)}
            detail={`${count(training.assignedEmployees)} distinct employees · ${count(training.assignedPrograms)} programs`}
            icon={GraduationCap}
          />
          <Kpi
            title="Completion rate"
            value={percent(training.completionRatePercent)}
            meter={training.completionRatePercent}
            detail={`${count(training.completed)} of ${count(training.assignments)} cohort assignments currently complete`}
            icon={BookOpenCheck}
          />
          <Kpi
            title="Completed during period"
            value={count(training.completedDuring)}
            detail="Uses completion date, independent of assignment date"
            icon={ClipboardCheck}
          />
          <Kpi
            title="Certificates issued"
            value={count(certificates.issuedDuring)}
            detail={`${count(certificates.totalIssued)} nonrevoked certificates in total`}
            icon={Award}
          />
        </div>
        <div className="grid items-stretch gap-5 xl:grid-cols-2">
          <StatusBreakdown
            title="Training assignment status"
            description="Current status of assignments created during the selected period."
            total={training.assignments}
            rows={[
              { label: 'Completed', value: training.completed, color: STATUS_COLORS.completed },
              { label: 'In progress', value: training.inProgress, color: STATUS_COLORS.inProgress },
              { label: 'Not started', value: training.notStarted, color: STATUS_COLORS.notStarted },
            ]}
          />
          <MetricBars
            title="Completion by training program"
            description="Completed of assigned in the selected cohort."
            rows={training.byProgram.map((row) => ({
              key: row.id,
              label: row.title,
              value: row.completed,
              detail: `of ${count(row.assignments)} · ${percent(row.completionRatePercent)}`,
            }))}
            maximum={Math.max(0, ...training.byProgram.map((row) => row.assignments))}
            truncated={training.programsTruncated}
          />
        </div>
      </Section>
      <Section
        id="awareness-assessment-heading"
        title="Assessments"
        description="Course quizzes use submission dates and monthly results use their quiz month."
      >
        <div aria-label="Assessment metrics" role="group" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            title="Course quiz attempts"
            value={count(course.submittedAttempts)}
            detail={`${count(course.uniqueParticipants)} distinct participants · ${percent(course.passRatePercent)} of attempts passed`}
            icon={Users}
          />
          <Kpi
            title="Course mean score"
            value={percent(course.averageScorePercent)}
            meter={course.averageScorePercent}
            detail="Mean of submitted attempt scores"
            icon={BookOpenCheck}
          />
          <Kpi
            title="Monthly participation"
            value={`${count(monthly.submittedAssignments)} / ${count(monthly.assignedAssignments)}`}
            meter={
              monthly.assignedAssignments ? (monthly.submittedAssignments / monthly.assignedAssignments) * 100 : null
            }
            detail="Employees who submitted versus employees expected, per quiz month"
            icon={CalendarDays}
          />
          <Kpi
            title="Monthly mean best score"
            value={percent(monthly.averageBestScorePercent)}
            meter={monthly.averageBestScorePercent}
            detail="Weighted across submitted employee-months"
            icon={CalendarDays}
          />
        </div>
        <MonthlyTrends rows={monthly.trend} />
        <div className="grid items-stretch gap-5 xl:grid-cols-2">
          <CoursePerformance course={course} />
          <MetricBars
            title="Certificates issued by program"
            description="Certificates issued during the selected period, by current program title."
            rows={certificates.byProgram.map((row) => ({
              key: row.id,
              label: row.title,
              value: row.issuedDuring,
              detail: `${count(row.totalIssued)} total`,
            }))}
            unit="certificates"
            truncated={certificates.programsTruncated}
            empty="No certificates issued in this period."
          />
        </div>
      </Section>
      <Section
        id="awareness-department-heading"
        title="Departments"
        description="Aggregated comparisons only — no individual employee scores are shown."
      >
        <DepartmentPanel departments={data.departments} />
      </Section>
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-slate-950">Manage awareness content</h2>
          <p className="mt-1 text-sm text-slate-500">
            Open the administration workspaces to manage content or review records.
          </p>
        </div>
        <nav aria-label="Awareness management" className="flex flex-wrap gap-2">
          {[
            ['Training Management', '/admin/training'],
            ['Course Quizzes', '/admin/training'],
            ['Monthly Quizzes', '/admin/monthly-quizzes'],
            ['Certificates', '/admin/certificates'],
          ].map(([title, to]) => (
            <Button key={title} as={Link} to={to} variant="secondary" size="sm">
              {title}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          ))}
        </nav>
      </Card>
    </div>
  );
}

export function AwarenessAnalyticsPage() {
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState({ period: '90d' });
  const [revision, setRevision] = useState(0);
  const [validation, setValidation] = useState('');
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [programs, setPrograms] = useState({ items: [], truncated: false });
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({ loading: true, data: null, error: '' });
    });
    awarenessAnalyticsApi
      .overview(applied, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ loading: false, data, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ loading: false, data: null, error: awarenessAnalyticsError(error) });
          if ([401, 403].includes(error?.status)) setPrograms({ items: [], truncated: false });
        }
      });
    return () => controller.abort();
  }, [applied, revision]);
  // The program filter lists every program alphabetically (first 50); failures fall back to programs present in the data.
  useEffect(() => {
    const controller = new AbortController();
    awarenessAnalyticsApi
      .programs(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && Array.isArray(result?.items))
          setPrograms({
            items: result.items.map(({ id, title }) => ({ id, title })),
            truncated: Boolean(result.hasMore),
          });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [revision]);
  function apply(event) {
    event.preventDefault();
    const error = validateAwarenessFilters(draft);
    setValidation(error);
    if (error) return;
    const next = { period: draft.period };
    if (draft.period === 'custom') {
      next.start = draft.start;
      next.end = draft.end;
    }
    for (const key of ['programId', 'completionStatus', 'monthlyPeriod']) if (draft[key]) next[key] = draft[key];
    setApplied(next);
    setRevision((value) => value + 1);
  }
  function reset() {
    setDraft(initial);
    setValidation('');
    setApplied({ period: '90d' });
    setRevision((value) => value + 1);
  }
  const change = (key) => (value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidation('');
  };
  const data = state.data;
  const options = [
    ...programs.items,
    ...(data?.training.byProgram ?? []),
    ...(data?.courseQuizzes.byProgram ?? []),
    ...(data?.certificates.byProgram ?? []),
  ].filter((row, index, rows) => rows.findIndex((item) => item.id === row.id) === index);
  const bounds = awarenessMonthBounds(draft);
  const chips = [
    applied.programId && (options.find((row) => row.id === applied.programId)?.title ?? 'Selected program'),
    applied.completionStatus && label(applied.completionStatus),
    applied.monthlyPeriod && monthLabel(applied.monthlyPeriod),
  ].filter(Boolean);
  const dateProps = {
    'aria-invalid': Boolean(validation),
    'aria-describedby': validation ? 'awareness-filter-error' : undefined,
  };
  return (
    <>
      <PageHeader
        eyebrow="Security awareness"
        title="Awareness analytics"
        description="Participation and learning progress from recorded training, quiz, and certificate activity."
        actions={
          <Button variant="secondary" disabled={state.loading} onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh analytics
          </Button>
        }
      />
      <Card className="mb-8 overflow-visible">
        <form onSubmit={apply}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <SlidersHorizontal className="size-4 text-brand-700" aria-hidden="true" />
              Filters
            </h2>
            {chips.length + (applied.period !== '90d' ? 1 : 0) > 0 && (
              <Badge tone="brand">{chips.length + (applied.period !== '90d' ? 1 : 0)} applied</Badge>
            )}
          </div>
          <div className="space-y-4 px-5 py-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className={fieldLabel}>
                Reporting period
                <Select
                  className="mt-1.5"
                  value={draft.period}
                  onChange={(event) => {
                    setDraft((value) => ({ ...value, period: event.target.value, monthlyPeriod: '' }));
                    setValidation('');
                  }}
                >
                  <option value="30d">Last 30 UTC days</option>
                  <option value="90d">Last 90 UTC days</option>
                  <option value="365d">Last 365 UTC days</option>
                  <option value="custom">Custom UTC dates</option>
                </Select>
              </label>
              <label className={fieldLabel}>
                Training program
                <Select
                  className="mt-1.5"
                  value={draft.programId}
                  onChange={(event) => change('programId')(event.target.value)}
                >
                  <option value="">All programs</option>
                  {options.map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.title}
                    </option>
                  ))}
                </Select>
              </label>
              <label className={fieldLabel}>
                Training completion status
                <Select
                  className="mt-1.5"
                  value={draft.completionStatus}
                  onChange={(event) => change('completionStatus')(event.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="NOT_STARTED">Not started</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="COMPLETED">Completed</option>
                </Select>
              </label>
              <div className={fieldLabel}>
                <span aria-hidden="true">Monthly quiz period</span>
                <MonthPicker
                  className="mt-1.5 w-full"
                  label="Monthly quiz period"
                  inlineLabel={false}
                  value={draft.monthlyPeriod}
                  onChange={change('monthlyPeriod')}
                  min={bounds?.min}
                  max={bounds?.max}
                />
              </div>
            </div>
            {draft.period === 'custom' && (
              <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-2 xl:grid-cols-4">
                <label className={fieldLabel}>
                  Start date (UTC)
                  <Input
                    className="mt-1.5 bg-white"
                    type="date"
                    value={draft.start}
                    onChange={(event) => {
                      setDraft((value) => ({ ...value, start: event.target.value, monthlyPeriod: '' }));
                      setValidation('');
                    }}
                    {...dateProps}
                  />
                </label>
                <label className={fieldLabel}>
                  End date (UTC)
                  <Input
                    className="mt-1.5 bg-white"
                    type="date"
                    value={draft.end}
                    min={draft.start || undefined}
                    onChange={(event) => {
                      setDraft((value) => ({ ...value, end: event.target.value, monthlyPeriod: '' }));
                      setValidation('');
                    }}
                    {...dateProps}
                  />
                </label>
                <p className="self-end text-xs leading-5 text-slate-500 md:col-span-2">
                  Both dates are included; a custom window can span up to 366 UTC days.
                </p>
              </div>
            )}
            {validation && (
              <p
                id="awareness-filter-error"
                role="alert"
                className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700"
              >
                {validation}
              </p>
            )}
            <p className="text-xs leading-5 text-slate-500">
              The program filter applies to training, course quizzes and certificates; completion status applies to
              training only; the quiz month applies to monthly quizzes only.
              {programs.truncated ? ' The program list shows the first 50 programs alphabetically.' : ''}
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-b-2xl border-t border-slate-200 bg-slate-50/60 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-700" role="status">
              <span className="flex items-center gap-2">
                <CalendarRange className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
                {data ? (
                  <span>
                    Reporting window <strong className="text-slate-950">{data.range.start}</strong> through{' '}
                    <strong className="text-slate-950">{data.range.end}</strong>{' '}
                    <span className="text-slate-500">· {data.range.days} UTC days</span>
                  </span>
                ) : (
                  <span className="text-slate-500">
                    {state.loading ? 'Loading reporting window…' : 'Reporting window unavailable'}
                  </span>
                )}
              </span>
              {chips.map((chip) => (
                <Badge key={chip} tone="brand">
                  {chip}
                </Badge>
              ))}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="ghost" onClick={reset}>
                Reset filters
              </Button>
              <Button type="submit">Apply filters</Button>
            </div>
          </div>
        </form>
      </Card>
      {state.loading && <Loading />}
      {state.error && (
        <Card className="p-5">
          <StatePanel
            icon={AlertCircle}
            tone="error"
            title="Awareness analytics unavailable"
            description={state.error}
            action={
              <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
                Try again
              </Button>
            }
          />
        </Card>
      )}
      {data && !state.loading && <AwarenessAnalyticsContent data={data} />}
    </>
  );
}
