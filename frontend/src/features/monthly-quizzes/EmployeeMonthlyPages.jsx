import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader.jsx';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui/index.jsx';
import { MonthPicker } from '../../components/ui/MonthPicker.jsx';
import { ConfirmDialog } from '../../components/ui/Dialog.jsx';
import { BackLink, TrainingPager } from '../training/TrainingCommon.jsx';
import { MonthlyFeedback } from './MonthlyFeedback.jsx';
import { label } from '../training/training-model.js';
import { countLabel } from '../../lib/labels.js';
import { createMonthlyApi } from './monthly-api.js';
import { dateTime, monthName, monthlyError } from './monthly-model.js';

const api = createMonthlyApi();
const availabilityText = {
  UPCOMING: 'This assessment has not opened yet.',
  CLOSED: 'The submission window has closed. Past results remain available.',
  ARCHIVED: 'This assessment has been archived. Past results remain available.',
  UNPUBLISHED: 'This assessment is not available.',
};

function History({ revision }) {
  const [page, setPage] = useState(1),
    [state, setState] = useState({ loading: true, error: '', result: null });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({ loading: true, error: '', result: null });
    });
    api
      .history({ page, pageSize: 20 }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ loading: false, error: '', result });
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setState({ loading: false, error: monthlyError(failure), result: null });
      });
    return () => controller.abort();
  }, [page, retry, revision]);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-bold">Month-by-month history</h2>
      <p className="mt-1 text-sm text-slate-600">
        Each month shows your highest submitted percentage. Ties use the earliest attempt; changes compare percentage
        points with the previous recorded month.
      </p>
      <MonthlyFeedback
        loading={state.loading}
        error={state.error}
        retry={() => setRetry((value) => value + 1)}
        empty={state.result?.items.length === 0}
        emptyTitle="No submitted monthly results yet"
      />
      {state.result?.items.length > 0 && (
        <>
          <ol className="mt-5 space-y-3">
            {state.result.items.map((item) => (
              <li
                key={item.period}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-sm"
              >
                <div>
                  <strong>{monthName(item.period)}</strong>
                  <p className="text-xs text-slate-600">
                    {item.title} · {item.attemptCount} {item.attemptCount === 1 ? 'attempt' : 'attempts'}
                  </p>
                </div>
                <div className="text-right">
                  <strong>
                    {item.bestAttempt.earnedPoints}/{item.bestAttempt.possiblePoints} · {item.bestAttempt.scorePercent}%
                  </strong>
                  <p className="text-xs text-slate-600">
                    {item.bestAttempt.passed ? 'Passed' : 'Not passed'} ·{' '}
                    {item.deltaPointsFromPreviousRecordedMonth == null
                      ? 'First recorded month'
                      : `${item.deltaPointsFromPreviousRecordedMonth > 0 ? '+' : ''}${item.deltaPointsFromPreviousRecordedMonth} percentage points vs previous recorded month`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <TrainingPager result={state.result} onChange={setPage} ariaLabel="Monthly score history pages" />
        </>
      )}
    </Card>
  );
}

export function EmployeeMonthlyListPage() {
  const [page, setPage] = useState(1),
    [period, setPeriod] = useState(''),
    [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, error: '', result: null });
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({ loading: true, error: '', result: null });
    });
    api
      .list({ page, pageSize: 20, ...(period ? { period } : {}) }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ loading: false, error: '', result });
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setState({ loading: false, error: monthlyError(failure), result: null });
      });
    return () => controller.abort();
  }, [page, period, revision]);
  const filter = (value) => {
    setPeriod(value);
    setPage(1);
  };
  return (
    <>
      <PageHeader
        eyebrow="Security awareness"
        title="Monthly quizzes"
        description="Independent assessments that reinforce cybersecurity knowledge each month. The current month is listed first."
        actions={
          <>
            <MonthPicker value={period} onChange={filter} label="Quiz month" className="w-full sm:w-60" />
            <Button variant="secondary" disabled={state.loading} onClick={() => setRevision((value) => value + 1)}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />
      {period && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600" role="status">
          Showing quizzes for <strong className="text-slate-900">{monthName(period)}</strong>
          <Button size="sm" variant="ghost" className="min-h-9" onClick={() => filter('')}>
            Show all months
          </Button>
        </p>
      )}
      <MonthlyFeedback
        loading={state.loading}
        error={state.error}
        retry={() => setRevision((value) => value + 1)}
        empty={state.result?.items.length === 0}
        emptyTitle={period ? `No monthly quiz for ${monthName(period)}` : 'No monthly quizzes available'}
        emptyDescription={
          period
            ? 'Choose another month or show all months to see every assessment available to you.'
            : 'Published assessments will appear here when available to your account.'
        }
        emptyAction={
          period && (
            <Button variant="secondary" onClick={() => filter('')}>
              Show all months
            </Button>
          )
        }
      />
      {state.result?.items.length > 0 && (
        <div className="mb-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {state.result.items.map((item) => (
              <MonthlyQuizCard key={item.id} item={item} />
            ))}
          </div>
          <TrainingPager result={state.result} onChange={setPage} ariaLabel="Monthly quiz pages" />
        </div>
      )}
      <History revision={revision} />
    </>
  );
}

const availabilityTone = {
  OPEN: 'success',
  UPCOMING: 'brand',
  CLOSED: 'neutral',
  ARCHIVED: 'neutral',
  UNPUBLISHED: 'neutral',
};
function MonthlyQuizCard({ item }) {
  const current = item.period === new Date().toISOString().slice(0, 7);
  return (
    <Card className={`flex h-full flex-col p-5 ${current ? 'border-brand-200 ring-1 ring-brand-100' : ''}`}>
      <article className="flex h-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-700">
            <CalendarDays className="size-4" aria-hidden="true" />
            {monthName(item.period)}
            {current && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[0.65rem] tracking-normal text-brand-800 ring-1 ring-inset ring-brand-200">
                This month
              </span>
            )}
          </p>
          <Badge tone={availabilityTone[item.availability] ?? 'neutral'}>{label(item.availability)}</Badge>
        </div>
        <h2 className="mt-3 text-lg font-bold text-slate-950">{item.title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.topics.map(label).join(' · ')}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
          <div>
            <dt className="text-slate-500">Opens</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">{dateTime(item.opensAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Closes</dt>
            <dd className="mt-0.5 font-semibold text-slate-800">{dateTime(item.closesAt)}</dd>
          </div>
        </dl>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
          <p className="text-sm text-slate-700">
            {item.passed ? (
              <strong className="font-semibold text-success-800">Passed</strong>
            ) : (
              `${item.attemptsRemaining} ${item.attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining`
            )}
            {item.bestScorePercent != null ? ` · Best ${item.bestScorePercent}%` : ''}
          </p>
          <Button as={Link} to={`/monthly-quiz/${item.id}`} variant="secondary" size="sm">
            View assessment
          </Button>
        </div>
      </article>
    </Card>
  );
}

export function EmployeeMonthlyDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null),
    [attempt, setAttempt] = useState(null),
    [answers, setAnswers] = useState({});
  const [mode, setMode] = useState('intro'),
    [position, setPosition] = useState(0),
    [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [confirm, setConfirm] = useState(false),
    [historyRevision, setHistoryRevision] = useState(0);
  const busyRef = useRef(false);
  const refresh = useCallback(
    async (signal) => {
      setLoading(true);
      try {
        const response = await api.detail(id, signal);
        if (signal?.aborted) return;
        setData(response);
        setError('');
        if (response.availability !== 'OPEN') {
          setAttempt(null);
          setAnswers({});
          setMode((current) => (current === 'result' ? current : 'intro'));
        }
      } catch (failure) {
        if (failure.name !== 'AbortError') {
          setError(monthlyError(failure));
          if ([401, 403, 404].includes(failure.status)) {
            setData(null);
            setAttempt(null);
            setResult(null);
            setAnswers({});
          }
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id],
  );
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void refresh(controller.signal);
    });
    return () => controller.abort();
  }, [refresh]);
  const quiz = data?.quiz,
    questions = quiz?.questions ?? [],
    current = questions[position];
  const activeAttempt = data?.attempts?.find((item) => item.status === 'IN_PROGRESS');
  const passed = data?.passed ?? data?.attempts?.some((item) => item.status === 'SUBMITTED' && item.passed);
  async function start() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await api.start(id);
      setAttempt(response.attempt);
      setData((old) => ({ ...old, quiz: response.quiz }));
      setAnswers({});
      setPosition(0);
      setMode('taking');
      setNotice(
        activeAttempt
          ? 'Resumed your open attempt. Unsent selections from a previous visit are not saved by the server.'
          : 'Attempt started. Select an answer for every question.',
      );
    } catch (failure) {
      setError(monthlyError(failure));
      if ([401, 403].includes(failure.status)) {
        setData(null);
        setAttempt(null);
      } else await refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function showResult(attemptId) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await api.result(id, attemptId);
      setResult(response);
      setMode('result');
    } catch (failure) {
      setError(monthlyError(failure));
      if ([401, 403].includes(failure.status)) {
        setData(null);
        setResult(null);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (!attempt || busyRef.current || questions.some((question) => !answers[question.id])) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await api.submit(
        id,
        attempt.id,
        questions.map((question) => ({ questionId: question.id, selectedOptionId: answers[question.id] })),
      );
      setResult(response);
      setMode('result');
      setAttempt(null);
      await refresh();
      setHistoryRevision((value) => value + 1);
      setNotice('Your server-scored result has been recorded.');
    } catch (failure) {
      setError(monthlyError(failure));
      if ([401, 403].includes(failure.status)) {
        setData(null);
        setAttempt(null);
        setResult(null);
      } else if (failure.status === 409) await refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <BackLink to="/monthly-quiz">Monthly quizzes</BackLink>
      <PageHeader
        eyebrow={monthName(data?.period)}
        title={data?.title ?? 'Monthly assessment'}
        description="Your score is calculated by the server. This assessment does not change course training completion."
      />
      <MonthlyFeedback loading={loading && !data} error={error && !data ? error : ''} retry={() => refresh()} />
      {data && (
        <div className="mx-auto max-w-4xl space-y-5">
          {error && (
            <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
              {notice}
            </p>
          )}
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  {label(data.availability)}
                </p>
                <p className="mt-2 text-sm text-slate-600">Topics: {data.topics.map(label).join(', ')}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Opens {dateTime(data.opensAt)} · Closes {dateTime(data.closesAt)}
                </p>
              </div>
              <strong className={`text-sm ${passed ? 'text-success-800' : ''}`}>
                {passed
                  ? 'Passed'
                  : `${data.attemptsRemaining} ${data.attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining`}
              </strong>
            </div>
          </Card>
          {data.availability !== 'OPEN' && (
            <Card className="p-5 sm:p-6">
              <h2 className="font-bold">Assessment unavailable</h2>
              <p className="mt-2 text-sm text-slate-600">
                {availabilityText[data.availability] ?? 'This assessment is currently unavailable.'}
              </p>
              <Button className="mt-4" variant="secondary" onClick={() => refresh()}>
                Check availability
              </Button>
            </Card>
          )}
          {data.availability === 'OPEN' && mode === 'intro' && passed && (
            <Card className="border-success-200 bg-success-50 p-5 sm:p-6">
              <h2 className="text-lg font-bold text-success-900">Quiz passed</h2>
              <p className="mt-2 text-sm text-success-800">
                You have passed this month's quiz. No further attempts are needed. You can review your result in the
                attempt history below.
              </p>
            </Card>
          )}
          {data.availability === 'OPEN' && mode === 'intro' && !passed && (
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-bold">Before you begin</h2>
              <p className="mt-2 text-sm text-slate-600">
                {countLabel(questions.length, 'question')}. Answer every question before final submission. Your
                selections remain here while navigating this attempt, but unsent answers are not saved across page
                refreshes.
              </p>
              {activeAttempt || data.attemptsRemaining > 0 ? (
                <Button className="mt-5" disabled={busy} onClick={start}>
                  {activeAttempt ? 'Resume attempt' : 'Start attempt'}
                </Button>
              ) : (
                <p className="mt-4 font-semibold text-warning-900">
                  No attempts remain. Contact your security administrator if you need help.
                </p>
              )}
            </Card>
          )}
          {mode === 'taking' && current && (
            <Card className="p-5 sm:p-7">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-700">
                Question {position + 1} of {questions.length}
              </p>
              <div
                role="progressbar"
                aria-label="Questions reviewed"
                aria-valuemin={0}
                aria-valuemax={questions.length}
                aria-valuenow={position + 1}
                className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
              >
                <div
                  className="h-full bg-brand-500"
                  style={{ width: `${((position + 1) * 100) / questions.length}%` }}
                />
              </div>
              <fieldset className="mt-6">
                <legend className="text-lg font-bold leading-7">{current.text}</legend>
                <p className="mt-1 text-xs text-slate-500">Choose one answer · {countLabel(current.points, 'point')}</p>
                <div className="mt-5 space-y-3">
                  {current.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm focus-within:ring-2 focus-within:ring-brand-500 ${answers[current.id] === option.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200'}`}
                    >
                      <input
                        type="radio"
                        name={`answer-${current.id}`}
                        checked={answers[current.id] === option.id}
                        onChange={() => setAnswers((old) => ({ ...old, [current.id]: option.id }))}
                      />
                      {option.text}
                    </label>
                  ))}
                </div>
              </fieldset>
              <nav
                aria-label="Monthly quiz questions"
                className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"
              >
                <Button variant="secondary" disabled={position === 0} onClick={() => setPosition((value) => value - 1)}>
                  Previous question
                </Button>
                <span aria-live="polite" className="text-xs text-slate-600">
                  {Object.keys(answers).length} of {questions.length} answered
                </span>
                {position < questions.length - 1 ? (
                  <Button variant="secondary" onClick={() => setPosition((value) => value + 1)}>
                    Next question
                  </Button>
                ) : (
                  <Button onClick={() => setMode('review')}>Review answers</Button>
                )}
              </nav>
            </Card>
          )}
          {mode === 'review' && (
            <Card className="p-5 sm:p-7">
              <h2 className="text-lg font-bold">Review your answers</h2>
              <p className="mt-2 text-sm text-slate-600">
                The answer key is shown only after your submitted result is authorized.
              </p>
              <ol className="mt-5 space-y-3">
                {questions.map((question, index) => (
                  <li key={question.id} className="rounded-xl border border-slate-200 p-4">
                    <p className="font-semibold">
                      {index + 1}. {question.text}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {question.options.find((option) => option.id === answers[question.id])?.text ?? 'Not answered'}
                    </p>
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPosition(index);
                        setMode('taking');
                      }}
                    >
                      Change answer {index + 1}
                    </Button>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setMode('taking')}>
                  Back to questions
                </Button>
                <Button
                  disabled={busy || questions.some((question) => !answers[question.id])}
                  onClick={() => setConfirm(true)}
                >
                  Submit monthly quiz
                </Button>
              </div>
              {questions.some((question) => !answers[question.id]) && (
                <p role="status" className="mt-3 text-sm text-warning-900">
                  Answer every question before submission.
                </p>
              )}
            </Card>
          )}
          {mode === 'result' && result && (
            <Card className={`p-5 sm:p-7 ${result.attempt.passed ? 'border-success-300' : 'border-warning-300'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Attempt {result.attempt.attemptNumber} · {dateTime(result.attempt.submittedAt)}
              </p>
              <h2 className="mt-2 text-xl font-bold">
                {result.attempt.passed ? 'Monthly quiz passed' : 'Monthly quiz not passed'}
              </h2>
              <p className="mt-2 text-lg font-semibold">
                {result.attempt.earnedPoints}/{countLabel(result.attempt.possiblePoints, 'point')} ·{' '}
                {result.attempt.scorePercent}%
              </p>
              <div className="mt-5 space-y-3">
                {result.answers.map((answer, index) => {
                  const question = quiz?.questions.find((item) => item.id === answer.questionId);
                  return (
                    <div key={answer.questionId} className="rounded-xl border border-slate-200 p-4">
                      <h3 className="font-semibold">{question?.text ?? `Question ${index + 1}`}</h3>
                      <p className="mt-1 text-sm">
                        {answer.awardedPoints > 0 ? 'Correct' : 'Incorrect'} ·{' '}
                        {countLabel(answer.awardedPoints, 'point')}
                      </p>
                      {question && (
                        <p className="mt-1 text-sm text-slate-600">
                          Your answer:{' '}
                          {question.options.find((option) => option.id === answer.selectedOptionId)?.text ??
                            'Unavailable'}
                          . Correct answer:{' '}
                          {question.options.find((option) => option.id === answer.correctOptionId)?.text ??
                            'Unavailable'}
                          .
                        </p>
                      )}
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{answer.explanation}</p>
                    </div>
                  );
                })}
              </div>
              <Button
                className="mt-5"
                variant="secondary"
                onClick={() => {
                  setMode('intro');
                  setResult(null);
                }}
              >
                Back to assessment
              </Button>
            </Card>
          )}
          {data.attempts?.length > 0 && (
            <Card className="p-5 sm:p-6">
              <h2 className="font-bold">Your attempt history</h2>
              <ul className="mt-4 space-y-3">
                {data.attempts.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm"
                  >
                    <span>
                      Attempt {item.attemptNumber} · {dateTime(item.submittedAt ?? item.startedAt)} ·{' '}
                      {item.status === 'SUBMITTED'
                        ? `${item.scorePercent}% ${item.passed ? 'Passed' : 'Not passed'}`
                        : 'In progress'}
                    </span>
                    {item.status === 'SUBMITTED' && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => showResult(item.id)}>
                        Review result
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <History revision={historyRevision} />
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void submit();
        }}
        title="Submit your monthly quiz?"
        description="Your selected answers will be graded by the server and this attempt cannot be changed afterward."
        confirmLabel="Submit quiz"
      />
    </>
  );
}
