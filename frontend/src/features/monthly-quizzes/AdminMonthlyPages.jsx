import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card, Input, Select } from '../../components/ui/index.jsx';
import { ConfirmDialog } from '../../components/ui/Dialog.jsx';
import { MonthPicker } from '../../components/ui/MonthPicker.jsx';
import { QuizPreview, QuizQuestionEditor } from '../training/AdminQuizPanel.jsx';
import { PublicationControls, TrainingBadge, TrainingPager, BackLink } from '../training/TrainingCommon.jsx';
import { MonthlyFeedback } from './MonthlyFeedback.jsx';
import { blankQuestion } from '../training/quiz-model.js';
import { label, topics } from '../training/training-model.js';
import { createMonthlyApi } from './monthly-api.js';
import {
  blankMonthly,
  dateTime,
  monthName,
  monthlyBody,
  monthlyError,
  monthlyFromServer,
  validateMonthly,
  withPeriod,
} from './monthly-model.js';

const api = createMonthlyApi(true);
const field = 'block text-sm font-semibold text-slate-700';

export function AdminMonthlyListPage() {
  const [filters, setFilters] = useState({ search: '', status: '', period: '', sort: 'nearest' });
  const [applied, setApplied] = useState({ sort: 'nearest' });
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, error: '', result: null });
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({ loading: true, error: '', result: null });
    });
    api
      .list(
        { page, pageSize: 20, ...Object.fromEntries(Object.entries(applied).filter(([, value]) => value)) },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) setState({ loading: false, error: '', result });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ loading: false, error: monthlyError(error), result: null });
      });
    return () => controller.abort();
  }, [applied, page, revision]);
  const change = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <>
      <PageHeader
        eyebrow="Security awareness"
        title="Monthly quizzes"
        description="Review, schedule and track independent monthly awareness assessments."
        actions={
          <Button as={Link} to="/admin/monthly-quizzes/new">
            Create monthly quiz
          </Button>
        }
      />
      <Card className="mb-6 p-5 sm:p-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setApplied({ ...filters });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className={field}>
              Search title
              <Input
                className="mt-2"
                type="search"
                maxLength={100}
                value={filters.search}
                onChange={(event) => change('search', event.target.value)}
              />
            </label>
            <div className={field}>
              <span aria-hidden="true">Month</span>
              <MonthPicker
                className="mt-2 w-full"
                label="Month"
                inlineLabel={false}
                value={filters.period}
                onChange={(value) => change('period', value)}
              />
            </div>
            <label className={field}>
              Status
              <Select
                className="mt-2"
                value={filters.status}
                onChange={(event) => change('status', event.target.value)}
              >
                <option value="">All statuses</option>
                {['DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED'].map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </Select>
            </label>
            <label className={field}>
              Sort all results
              <Select className="mt-2" value={filters.sort} onChange={(event) => change('sort', event.target.value)}>
                <option value="nearest">Nearest to current month</option>
                <option value="period_desc">Newest month first</option>
                <option value="period_asc">Oldest month first</option>
              </Select>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="submit">Apply filters</Button>
            <Button
              variant="ghost"
              onClick={() => {
                const clear = { search: '', status: '', period: '', sort: 'nearest' };
                setFilters(clear);
                setApplied(clear);
                setPage(1);
              }}
            >
              Clear
            </Button>
            <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
              Refresh
            </Button>
          </div>
        </form>
      </Card>
      <MonthlyFeedback
        loading={state.loading}
        error={state.error}
        retry={() => setRevision((value) => value + 1)}
        empty={state.result?.items.length === 0}
        emptyTitle="No monthly quizzes found"
        emptyDescription="Create a draft or adjust the filters."
      />
      {state.result?.items.length > 0 && (
        <Card className="p-4 sm:p-5">
          <div className="space-y-3">
            {state.result.items.map((item) => (
              <article
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{monthName(item.period)}</p>
                  <h2 className="mt-1 font-bold">{item.title}</h2>
                  <p className="mt-2 text-xs text-slate-600">
                    {item.topics.map(label).join(' · ') || 'No topics'} · Opens {dateTime(item.opensAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <TrainingBadge status={item.status} />
                  <span className="text-xs text-slate-600">{label(item.availability)}</span>
                  <Button as={Link} to={`/admin/monthly-quizzes/${item.id}`} variant="secondary">
                    Manage
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <TrainingPager result={state.result} onChange={setPage} ariaLabel="Monthly quiz pages" />
        </Card>
      )}
    </>
  );
}

export function AdminMonthlyDetailPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    creating = !id;
  const [record, setRecord] = useState(null),
    [draft, setDraft] = useState(blankMonthly),
    [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(!creating),
    [busy, setBusy] = useState(false),
    [stale, setStale] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [tab, setTab] = useState('editor'),
    [confirm, setConfirm] = useState(null);
  const [report, setReport] = useState(null),
    [reportPage, setReportPage] = useState(1),
    [reportRevision, setReportRevision] = useState(0),
    [reportError, setReportError] = useState(''),
    [reportLoading, setReportLoading] = useState(false);
  const busyRef = useRef(false);
  const load = useCallback(
    async (discard = true, signal) => {
      if (!id) return;
      setLoading(true);
      try {
        const response = await api.detail(id, signal);
        if (signal?.aborted) return;
        setRecord(response.monthlyQuiz);
        if (discard) {
          setDraft(monthlyFromServer(response.monthlyQuiz));
          setStale(false);
          setLatest(null);
        } else setLatest(response.monthlyQuiz);
        setError('');
      } catch (failure) {
        if (failure.name !== 'AbortError') {
          setError(monthlyError(failure));
          if ([401, 403, 404].includes(failure.status)) setRecord(null);
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id],
  );
  useEffect(() => {
    if (!id) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(true, controller.signal);
    });
    return () => controller.abort();
  }, [id, load]);
  useEffect(() => {
    if (!id || tab !== 'report') return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setReportLoading(true);
    });
    api
      .report(id, { page: reportPage, pageSize: 20 }, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setReport(value);
          setReportError('');
        }
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') {
          setReportError(monthlyError(failure));
          if ([401, 403].includes(failure.status)) {
            setRecord(null);
            setReport(null);
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setReportLoading(false);
      });
    return () => controller.abort();
  }, [id, tab, reportPage, reportRevision]);
  const dirty = Boolean(record && JSON.stringify(draft) !== JSON.stringify(monthlyFromServer(record)));
  const editable = creating || record?.status === 'DRAFT';
  const locked = busy || stale;
  const updateQuestion = (index, value) =>
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, position) => (position === index ? value : question)),
    }));
  const moveQuestion = (index, offset) =>
    setDraft((current) => {
      const questions = [...current.questions];
      [questions[index], questions[index + offset]] = [questions[index + offset], questions[index]];
      return { ...current, questions };
    });
  async function save(event) {
    event.preventDefault();
    if (busyRef.current || stale) return;
    const problem = validateMonthly(draft);
    if (problem) {
      setError(problem);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (creating) {
        const response = await api.create(monthlyBody(draft));
        navigate(`/admin/monthly-quizzes/${response.monthlyQuiz.id}`);
      } else {
        const response = await api.edit(id, monthlyBody(draft, true, record.quiz.updatedAt));
        setRecord(response.monthlyQuiz);
        setDraft(monthlyFromServer(response.monthlyQuiz));
        setNotice('Draft saved. Review the answer key before approval.');
      }
    } catch (failure) {
      if (failure.code === 'TRAINING_STALE') {
        setStale(true);
        setNotice('Your unsaved draft is preserved.');
        await load(false);
      } else {
        setError(monthlyError(failure));
        if ([401, 403].includes(failure.status)) setRecord(null);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function action(operation) {
    if (!record || busyRef.current || stale || dirty) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await api.action(id, operation, record.quiz.updatedAt);
      setRecord(response.monthlyQuiz);
      setDraft(monthlyFromServer(response.monthlyQuiz));
      setNotice(`${label(operation)} completed.`);
      if (operation === 'archive') setTab('preview');
    } catch (failure) {
      if (failure.code === 'TRAINING_STALE') {
        setStale(true);
        setNotice('The latest server version is available. Your draft remains intact.');
        await load(false);
      } else {
        setError(monthlyError(failure));
        if ([401, 403].includes(failure.status)) setRecord(null);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <BackLink to="/admin/monthly-quizzes">Monthly quizzes</BackLink>
      <PageHeader
        eyebrow="Monthly awareness"
        title={creating ? 'Create monthly quiz' : (record?.title ?? 'Monthly quiz')}
        description="One record is permitted per calendar month. Times are entered in UTC; closing ends attempts automatically."
        actions={record && <TrainingBadge status={record.status} />}
      />
      <MonthlyFeedback
        loading={loading && !record}
        error={error && !record && !creating ? error : ''}
        retry={() => load(true)}
      />
      {(creating || record) && (
        <div className="space-y-5">
          {record && record.status !== 'ARCHIVED' && (
            <PublicationControls
              className="mb-0"
              status={record.status}
              description="Save and preview the current version before approval. Published content is immutable. Archiving is terminal; the scheduled close time ends attempts automatically."
            >
              {record.status === 'DRAFT' && (
                <Button variant="secondary" disabled={busy || stale || dirty} onClick={() => setConfirm('approve')}>
                  Review and approve
                </Button>
              )}
              {record.status === 'APPROVED' && (
                <Button disabled={busy || stale} onClick={() => setConfirm('publish')}>
                  Publish quiz
                </Button>
              )}
              <Button variant="danger" disabled={busy || stale || dirty} onClick={() => setConfirm('archive')}>
                Archive quiz
              </Button>
            </PublicationControls>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Monthly quiz workspace">
            <Button variant={tab === 'editor' ? 'primary' : 'secondary'} onClick={() => setTab('editor')}>
              {editable ? 'Edit draft' : 'Details'}
            </Button>
            <Button variant={tab === 'preview' ? 'primary' : 'secondary'} onClick={() => setTab('preview')}>
              Preview answer key
            </Button>
            {record && (
              <Button variant={tab === 'report' ? 'primary' : 'secondary'} onClick={() => setTab('report')}>
                Participation report
              </Button>
            )}
          </div>
          {notice && (
            <p role="status" className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
              {error}
            </p>
          )}
          {stale && (
            <Card className="border-warning-300 bg-warning-50 p-5">
              <p role="alert" className="font-semibold">
                Another administrator changed this quiz. Your local draft is preserved and cannot overwrite that
                version.
              </p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => {
                  if (latest) {
                    setRecord(latest);
                    setDraft(monthlyFromServer(latest));
                    setLatest(null);
                    setStale(false);
                    setNotice('Latest saved version loaded.');
                  }
                }}
              >
                Discard local draft and load latest
              </Button>
            </Card>
          )}
          {tab === 'editor' &&
            (editable ? (
              <form onSubmit={save} noValidate className="space-y-5">
                <Card className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
                  <label className={field}>
                    Quiz title
                    <Input
                      className="mt-2"
                      maxLength={200}
                      value={draft.title}
                      disabled={locked}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    />
                  </label>
                  <label className={field}>
                    Calendar month (UTC)
                    <Input
                      className="mt-2"
                      type="month"
                      value={draft.period}
                      disabled={locked || !creating}
                      onChange={(event) => setDraft(withPeriod(draft, event.target.value))}
                    />
                  </label>
                  <label className={field}>
                    Opens (UTC)
                    <Input
                      className="mt-2"
                      type="datetime-local"
                      value={draft.opensAt}
                      disabled={locked}
                      onChange={(event) => setDraft({ ...draft, opensAt: event.target.value })}
                    />
                  </label>
                  <label className={field}>
                    Closes (UTC)
                    <Input
                      className="mt-2"
                      type="datetime-local"
                      value={draft.closesAt}
                      disabled={locked}
                      onChange={(event) => setDraft({ ...draft, closesAt: event.target.value })}
                    />
                  </label>
                  <label className={field}>
                    Passing threshold (%)
                    <Input
                      className="mt-2"
                      type="number"
                      min="1"
                      max="100"
                      value={draft.passingPercent}
                      disabled={locked}
                      onChange={(event) => setDraft({ ...draft, passingPercent: event.target.value })}
                    />
                  </label>
                  <label className={field}>
                    Maximum attempts
                    <Input
                      className="mt-2"
                      type="number"
                      min="1"
                      max="10"
                      value={draft.maxAttempts}
                      disabled={locked}
                      onChange={(event) => setDraft({ ...draft, maxAttempts: event.target.value })}
                    />
                  </label>
                </Card>
                {draft.questions.map((question, index) => (
                  <div key={index}>
                    <label className={field}>
                      Question {index + 1} topic
                      <Select
                        className="mt-2"
                        value={question.topic}
                        disabled={locked}
                        onChange={(event) => updateQuestion(index, { ...question, topic: event.target.value })}
                      >
                        {topics.map((topic) => (
                          <option key={topic} value={topic}>
                            {label(topic)}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <div className="mt-3">
                      <QuizQuestionEditor
                        question={question}
                        index={index}
                        count={draft.questions.length}
                        disabled={locked}
                        update={(value) => updateQuestion(index, value)}
                        move={(offset) => moveQuestion(index, offset)}
                        remove={() =>
                          setDraft((current) => ({
                            ...current,
                            questions: current.questions.filter((_, position) => position !== index),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    disabled={locked || draft.questions.length >= 30}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        questions: [...current.questions, { ...blankQuestion(), topic: 'PHISHING' }],
                      }))
                    }
                  >
                    Add question
                  </Button>
                  <Button type="submit" disabled={locked}>
                    {busy ? 'Saving…' : creating ? 'Create draft' : 'Save draft'}
                  </Button>
                  {dirty && <span className="text-xs text-slate-600">Unsaved changes</span>}
                </div>
              </form>
            ) : (
              <QuizPreview draft={monthlyFromServer(record)} showKeys />
            ))}
          {tab === 'preview' && (
            <div className="mx-auto max-w-4xl space-y-4">
              <p className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
                Administrator preview only. Review every topic, answer and explanation before approval.
              </p>
              <Card className="p-5 text-sm">
                <p>
                  <strong>Month:</strong> {monthName(draft.period)}
                </p>
                <p>
                  <strong>Opens:</strong> {dateTime(`${draft.opensAt}:00Z`)}
                </p>
                <p>
                  <strong>Closes:</strong> {dateTime(`${draft.closesAt}:00Z`)}
                </p>
                <p>
                  <strong>Topics:</strong>{' '}
                  {[...new Set(draft.questions.map((question) => label(question.topic)))].join(', ')}
                </p>
              </Card>
              <QuizPreview draft={draft} showKeys />
            </div>
          )}
          {tab === 'report' && (
            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Participation and scores</h2>
                <Button variant="secondary" onClick={() => setReportRevision((value) => value + 1)}>
                  Refresh report
                </Button>
              </div>
              {report && (
                <p className="mt-2 text-sm text-slate-600">
                  {report.participation.expectedEmployees ?? '—'} expected employees ·{' '}
                  {report.participation.startedEmployees} started · {report.participation.submittedEmployees} submitted
                  · {report.participation.inProgressEmployees ?? 0} in progress
                </p>
              )}
              <MonthlyFeedback
                loading={reportLoading}
                error={reportError}
                retry={() => setReportRevision((value) => value + 1)}
                empty={report?.items.length === 0}
                emptyTitle="No attempts recorded"
              />
              {report?.items.length > 0 && (
                <>
                  <ul className="mt-4 space-y-3">
                    {report.items.map((attempt) => (
                      <li
                        key={attempt.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-sm"
                      >
                        <div>
                          <strong>
                            {attempt.employee.firstName} {attempt.employee.lastName}
                          </strong>
                          <p className="text-xs text-slate-500">
                            Attempt {attempt.attemptNumber} · {dateTime(attempt.submittedAt ?? attempt.startedAt)}
                          </p>
                        </div>
                        <span>
                          {attempt.status === 'SUBMITTED'
                            ? `${attempt.earnedPoints}/${attempt.possiblePoints} · ${attempt.scorePercent}% · ${attempt.passed ? 'Passed' : 'Not passed'}`
                            : 'In progress'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <TrainingPager result={report} onChange={setReportPage} ariaLabel="Monthly quiz report pages" />
                </>
              )}
            </Card>
          )}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const operation = confirm;
          setConfirm(null);
          void action(operation);
        }}
        title={`${label(confirm)} this monthly quiz?`}
        description={
          confirm === 'approve'
            ? 'This records explicit review and locks the current answer key.'
            : confirm === 'publish'
              ? 'Eligible employees will see the quiz during its scheduled window.'
              : 'Archiving is terminal. Past attempts and scores remain recorded.'
        }
        confirmLabel={`${label(confirm)} quiz`}
        danger={confirm === 'archive'}
      />
    </>
  );
}
