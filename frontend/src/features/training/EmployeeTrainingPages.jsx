import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BookOpenCheck, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card, Select } from '../../components/ui/index.jsx';
import { createTrainingApi } from './training-api.js';
import { formatDate, label, listQuery, nextSection, trainingError } from './training-model.js';
import {
  BackLink,
  CourseContent,
  ProgressBar,
  TrainingBadge,
  TrainingFeedback,
  TrainingPager,
} from './TrainingCommon.jsx';
import { EmployeeQuizPanel } from './EmployeeQuizPanel.jsx';
import { CourseCertificateLink } from '../certificates/CourseCertificateLink.jsx';

const api = createTrainingApi(false);
export function EmployeeTrainingListPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, error: '', result: null });
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({ loading: true, error: '', result: null });
    });
    api
      .mine(listQuery({ status }, page), controller.signal)
      .then((result) => setState({ loading: false, error: '', result }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ loading: false, error: trainingError(error), result: null });
      });
    return () => controller.abort();
  }, [status, page, revision]);
  const refresh = () => setRevision((value) => value + 1);
  return (
    <>
      <PageHeader
        eyebrow="Security awareness"
        title="My Training"
        description="Practical courses assigned to you, with progress saved as you work through each section."
        actions={
          <Button variant="secondary" onClick={refresh}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        }
      />
      <Card className="mb-6 p-5">
        <label className="block max-w-xs text-sm font-semibold" htmlFor="my-training-status">
          Progress status
          <Select
            id="my-training-status"
            className="mt-2"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All assignments</option>
            {['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </Select>
        </label>
      </Card>
      <TrainingFeedback
        loading={state.loading}
        error={state.error}
        retry={refresh}
        empty={state.result?.items.length === 0}
        emptyTitle="No assigned courses"
        emptyDescription="Your assigned training will appear here when an administrator publishes and assigns a program."
      />
      {state.result?.items.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {state.result.items.map((assignment) => (
              <Card key={assignment.id} className="flex flex-col overflow-hidden">
                <div className="h-1 bg-brand-500" />
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <TrainingBadge status={assignment.progress?.status ?? 'NOT_STARTED'} />
                    {assignment.training.status === 'ARCHIVED' && <TrainingBadge status="ARCHIVED" />}
                  </div>
                  <p className="mt-5 text-xs font-bold uppercase tracking-wide text-brand-700">
                    {label(assignment.training.topic)} · {assignment.training.estimatedMinutes} min
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-slate-950">{assignment.training.title}</h2>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">
                    {assignment.training.description}
                  </p>
                  <div className="mt-5">
                    <ProgressBar progress={assignment.progress} />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Assigned {formatDate(assignment.createdAt)}</p>
                  <Button as={Link} to={`/training/${assignment.id}`} className="mt-5">
                    {assignment.training.status === 'ARCHIVED'
                      ? 'View saved progress'
                      : assignment.progress?.status === 'NOT_STARTED'
                        ? 'Open course'
                        : assignment.progress?.status === 'COMPLETED'
                          ? 'Review course'
                          : 'Resume course'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <Card className="mt-5 p-4">
            <TrainingPager result={state.result} onChange={setPage} />
          </Card>
        </>
      )}
    </>
  );
}

export function EmployeeTrainingDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const busyRef = useRef(false);
  const load = useCallback(
    async (selectNext = false, signal) => {
      setLoading(true);
      setError('');
      try {
        const response = await api.detail(id, signal);
        if (signal?.aborted) return false;
        setData(response);
        if (selectNext) {
          const next = nextSection(response.assignment);
          setActive(next >= 0 ? next : Math.max(0, (response.assignment.training.content?.sections?.length ?? 1) - 1));
        }
        return true;
      } catch (failure) {
        if (failure.name !== 'AbortError') {
          setError(trainingError(failure));
          setData(null);
        }
        return false;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) void load(true, controller.signal);
    });
    return () => controller.abort();
  }, [load]);
  async function act(operation) {
    if (busyRef.current || !data) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (operation === 'start') await api.start(id);
      else await api.acknowledge(id, data.assignment.training.content.sections[active].key);
      if (await load(true))
        setNotice(
          operation === 'start'
            ? 'Course started. Your progress is saved on the server.'
            : 'Section acknowledged. Your progress is saved.',
        );
    } catch (failure) {
      setError(trainingError(failure));
      setData(null);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const assignment = data?.assignment;
  const course = assignment?.training;
  const progress = assignment?.progress;
  const sections = course?.content?.sections ?? [];
  const next = assignment && data.contentAvailable ? nextSection(assignment) : -1;
  const materialComplete = Boolean(progress?.materialCompletedAt);
  return (
    <>
      <BackLink to="/training">My Training</BackLink>
      <PageHeader
        eyebrow="Course reader"
        title={course?.title ?? 'Training course'}
        description={
          course ? `${label(course.topic)} · About ${course.estimatedMinutes} minutes` : 'Loading your assigned course.'
        }
        actions={course && <TrainingBadge status={progress?.status ?? 'NOT_STARTED'} />}
      />
      <TrainingFeedback loading={loading && !data} error={error && !data ? error : ''} retry={() => load(true)} />
      {data && (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(16rem,0.65fr)]">
          <div className="min-w-0 space-y-5">
            {notice && (
              <p role="status" className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
                {error}{' '}
                <Button variant="ghost" onClick={() => load(true)}>
                  Refresh course
                </Button>
              </p>
            )}
            {data.contentAvailable ? (
              <>
                <CourseContent course={course} activeIndex={active} />
                <Card className="p-5 sm:p-6">
                  <nav aria-label="Course sections" className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                      variant="secondary"
                      disabled={active === 0 || busy}
                      onClick={() => setActive((value) => value - 1)}
                    >
                      ← Previous section
                    </Button>
                    <span className="text-sm font-semibold text-slate-600">
                      Section {active + 1} of {sections.length}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={active >= sections.length - 1 || busy}
                      onClick={() => setActive((value) => value + 1)}
                    >
                      Next section →
                    </Button>
                  </nav>
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    {progress?.status === 'NOT_STARTED' ? (
                      <Button disabled={busy} onClick={() => act('start')}>
                        {busy ? 'Starting…' : 'Start this course'}
                      </Button>
                    ) : next === active && !materialComplete ? (
                      <Button disabled={busy} onClick={() => act('acknowledge')}>
                        {busy ? 'Saving…' : 'I have read this section'}
                      </Button>
                    ) : (
                      <p className="text-sm text-slate-600">
                        {progress?.completedSectionKeys?.includes(sections[active]?.key)
                          ? 'This section is recorded as read.'
                          : 'Read and acknowledge earlier sections before recording this one.'}
                      </p>
                    )}
                  </div>
                </Card>
              </>
            ) : (
              <Card className="p-5 sm:p-6">
                <h2 className="font-bold">Archived course</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This course is archived. Your saved progress remains visible, but learning material and progress
                  updates are no longer available.
                </p>
              </Card>
            )}
            {materialComplete && course.requiresQuiz && progress?.status !== 'COMPLETED' && (
              <Card className="border-warning-200 bg-warning-50 p-5 sm:p-6">
                <BookOpenCheck className="size-6 text-warning-800" aria-hidden="true" />
                <h2 className="mt-3 font-bold text-warning-900">Material completed; training still in progress</h2>
                <p className="mt-2 text-sm leading-6 text-warning-900">
                  A passing quiz result is required for final completion. No final completion or certificate has been
                  awarded yet.
                </p>
              </Card>
            )}
            {progress?.status === 'COMPLETED' && (
              <Card className="border-success-200 bg-success-50 p-5 sm:p-6">
                <h2 className="font-bold text-success-800">Training completed</h2>
                <p className="mt-2 text-sm text-success-800">
                  {course.requiresQuiz
                    ? 'Reading and the required assessment were completed.'
                    : 'This course was configured without a quiz requirement.'}{' '}
                  Completion was recorded {formatDate(progress.completedAt)}.
                </p>
                <CourseCertificateLink trainingId={course.id} />
              </Card>
            )}
            {course.requiresQuiz && (
              <EmployeeQuizPanel
                assignmentId={id}
                onCompleted={() => {
                  void load(true);
                }}
              />
            )}
          </div>
          <aside className="space-y-5 xl:sticky xl:top-28">
            <Card className="p-5 sm:p-6">
              <h2 className="font-bold">Your progress</h2>
              <p className="mt-2 text-sm text-slate-500">Assigned {formatDate(assignment.createdAt)}</p>
              <div className="mt-5">
                <ProgressBar progress={progress} />
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {progress?.completedSectionKeys?.length ?? 0} of {sections.length || 'unavailable'} sections
                acknowledged
              </p>
              {progress?.lastActivityAt && (
                <p className="mt-1 text-xs text-slate-500">Last activity {formatDate(progress.lastActivityAt)}</p>
              )}
              <Button variant="secondary" className="mt-5" disabled={loading || busy} onClick={() => load(true)}>
                <RefreshCw className="size-4" />
                Refresh progress
              </Button>
            </Card>
            {data.contentAvailable && (
              <Card className="p-5 sm:p-6">
                <h2 className="font-bold">Sections</h2>
                <ol className="mt-4 space-y-2">
                  {sections.map((section, index) => (
                    <li key={section.key}>
                      <button
                        type="button"
                        onClick={() => setActive(index)}
                        aria-current={active === index ? 'step' : undefined}
                        className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${active === index ? 'border-brand-300 bg-brand-50 text-brand-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                      >
                        <span className="font-semibold">
                          {index + 1}. {section.title}
                        </span>
                        <span className="mt-1 block text-xs">
                          {progress?.completedSectionKeys?.includes(section.key)
                            ? 'Recorded as read'
                            : 'Not yet acknowledged'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
