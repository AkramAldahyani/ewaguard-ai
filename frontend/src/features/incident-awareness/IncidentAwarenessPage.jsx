import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, BookOpenCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { DISCLAIMER_DEFINITION } from '../../../../shared/disclaimer.js';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Badge, Button, Card, Input, Select, Skeleton, StatePanel, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { createIncidentAwarenessApi, incidentAwarenessError, validateSecurityRange } from './incident-awareness-api.js';

const api = createIncidentAwarenessApi();
const initialRange = { period: '30d', start: '', end: '' };
const emptyWarning = { incidentCategory: '', title: '', body: '', trainingId: '' };
const categoryLabel = (value) =>
  String(value ?? '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function PatternLoading() {
  return (
    <div role="status" aria-label="Loading incident patterns" className="grid gap-4 lg:grid-cols-2">
      {[0, 1, 2].map((item) => (
        <Card key={item} className="p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-5 h-9 w-20" />
          <Skeleton className="mt-5 h-4 w-full" />
        </Card>
      ))}
    </div>
  );
}

export function IncidentAwarenessPage() {
  const [draftRange, setDraftRange] = useState(initialRange);
  const [range, setRange] = useState(initialRange);
  const [rangeError, setRangeError] = useState('');
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [warning, setWarning] = useState(emptyWarning);
  const [reviewed, setReviewed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [formError, setFormError] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState(null);
  const submitLock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({ loading: true, data: null, error: '' });
    });
    api
      .patterns(range, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ loading: false, data, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          if ([401, 403].includes(error.status)) {
            setWarning(emptyWarning);
            setReviewOpen(false);
            setSubmission(null);
          }
          setState({ loading: false, data: null, error: incidentAwarenessError(error) });
        }
      });
    return () => controller.abort();
  }, [range, revision]);

  const patterns = state.data?.patterns ?? [];
  const selected = patterns.find((pattern) => pattern.incidentCategory === warning.incidentCategory);
  const selectedTraining = selected?.relatedTraining.find((program) => program.id === warning.trainingId);

  function choosePattern(pattern) {
    setWarning({
      incidentCategory: pattern.incidentCategory,
      title: pattern.suggestedTitle,
      body: pattern.suggestedBody,
      trainingId: '',
    });
    setReviewed(false);
    setAcknowledged(false);
    setFormError('');
    setSubmission(null);
    setReviewOpen(false);
  }

  function applyRange(event) {
    event.preventDefault();
    const error = validateSecurityRange(draftRange.period, draftRange.start, draftRange.end);
    if (error) {
      setRangeError(error);
      return;
    }
    setRangeError('');
    setWarning(emptyWarning);
    setReviewed(false);
    setAcknowledged(false);
    setReviewOpen(false);
    setSubmission(null);
    setRange({ ...draftRange });
    setRevision((value) => value + 1);
  }

  function reviewWarning(event) {
    event.preventDefault();
    if (!selected || !warning.title.trim() || !warning.body.trim()) {
      setFormError('Choose an eligible incident pattern and enter a title and guidance.');
      return;
    }
    if (!reviewed || !acknowledged) {
      setFormError('Complete the human review and sensitive-information acknowledgement before continuing.');
      return;
    }
    setFormError('');
    setReviewOpen(true);
  }

  async function submitWarning() {
    if (submitLock.current || !selected || !reviewed || !acknowledged) return;
    submitLock.current = true;
    setSubmitting(true);
    setFormError('');
    try {
      const receipt = await api.acknowledge();
      const acknowledgementId = receipt?.acknowledgement?.id;
      if (!acknowledgementId) throw new Error('Missing disclaimer acknowledgement');
      const result = await api.prepareWarning(range, warning, acknowledgementId);
      setSubmission(result);
      setReviewOpen(false);
      setReviewed(false);
      setAcknowledged(false);
    } catch (error) {
      setReviewOpen(false);
      setFormError(incidentAwarenessError(error));
      if ([401, 403].includes(error.status)) {
        setWarning(emptyWarning);
        setSubmission(null);
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Security operations"
        title="Incident awareness"
        description="Review broad incident patterns, direct administrators to published training, and prepare general warnings for independent moderation."
        actions={
          <Button variant="secondary" onClick={() => setRevision((value) => value + 1)} disabled={state.loading}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh patterns
          </Button>
        }
      />
      <Card className="mb-6 p-5 sm:p-6">
        <form onSubmit={applyRange} className="flex flex-wrap items-end gap-4">
          <div className="min-w-48 flex-1">
            <label htmlFor="awareness-period" className="mb-1.5 block text-sm font-semibold">
              Incident creation period
            </label>
            <Select
              id="awareness-period"
              value={draftRange.period}
              onChange={(event) => setDraftRange((current) => ({ ...current, period: event.target.value }))}
            >
              <option value="7d">Last 7 UTC days</option>
              <option value="30d">Last 30 UTC days</option>
              <option value="90d">Last 90 UTC days</option>
              <option value="custom">Custom UTC dates</option>
            </Select>
          </div>
          {draftRange.period === 'custom' && (
            <>
              <div>
                <label htmlFor="awareness-start" className="mb-1.5 block text-sm font-semibold">
                  Start date
                </label>
                <Input
                  id="awareness-start"
                  type="date"
                  value={draftRange.start}
                  onChange={(event) => setDraftRange((current) => ({ ...current, start: event.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="awareness-end" className="mb-1.5 block text-sm font-semibold">
                  End date
                </label>
                <Input
                  id="awareness-end"
                  type="date"
                  value={draftRange.end}
                  onChange={(event) => setDraftRange((current) => ({ ...current, end: event.target.value }))}
                />
              </div>
            </>
          )}
          <Button type="submit">Apply period</Button>
        </form>
        {rangeError && (
          <p role="alert" className="mt-3 text-sm text-danger-700">
            {rangeError}
          </p>
        )}
        {state.data?.range && (
          <p className="mt-3 text-sm text-slate-600">
            Showing incidents created {state.data.range.start} through {state.data.range.end} (UTC, inclusive). Counts
            reflect current status, not a historical snapshot.
          </p>
        )}
      </Card>
      {state.loading && <PatternLoading />}
      {state.error && (
        <Card className="p-5">
          <StatePanel
            icon={AlertCircle}
            tone="error"
            title="Incident patterns unavailable"
            description={state.error}
            action={
              <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
                Try again
              </Button>
            }
          />
        </Card>
      )}
      {state.data && (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Eligible incident patterns</h2>
              <p className="mt-1 text-sm text-slate-600">
                Only broad categories with at least {state.data.minimumPatternCount} qualifying incidents appear.
                Suggestions are general guidance for administrator review.
              </p>
            </div>
            <Button as={Link} to="/admin/training" variant="secondary">
              Training Management
            </Button>
          </div>
          {patterns.length === 0 ? (
            <Card className="p-5">
              <StatePanel
                icon={ShieldAlert}
                title="No qualifying patterns in this period"
                description="No broad category met the publication threshold. This does not mean no incidents occurred. Choose another period or return later."
              />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {patterns.map((pattern) => (
                <Card key={pattern.incidentCategory} className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone="brand">{categoryLabel(pattern.incidentCategory)}</Badge>
                    <span className="text-sm font-semibold text-slate-700">
                      {pattern.incidentCount} qualifying incidents
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-950">{pattern.suggestedTitle}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{pattern.suggestedBody}</p>
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <h4 className="text-sm font-bold">Related published training</h4>
                    {pattern.relatedTraining.length ? (
                      <ul className="mt-3 space-y-3">
                        {pattern.relatedTraining.map((program) => (
                          <li
                            key={program.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"
                          >
                            <span className="text-sm font-semibold">{program.title}</span>
                            <span className="flex flex-wrap gap-2">
                              <Button as={Link} to={`/admin/training/${program.id}`} variant="ghost" size="sm">
                                View Related Training
                              </Button>
                              <Button
                                as={Link}
                                to={`/admin/training/${program.id}?view=assignments`}
                                variant="secondary"
                                size="sm"
                              >
                                Assign Relevant Training
                              </Button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        No related published program is available for this category.
                      </p>
                    )}
                    {state.data.trainingOptionsTruncated && (
                      <p className="mt-3 text-xs text-slate-500">
                        Showing a limited set of related programs. Browse Training Management for the full list.
                      </p>
                    )}
                  </div>
                  <Button className="mt-5" onClick={() => choosePattern(pattern)}>
                    Prepare Awareness Warning
                  </Button>
                </Card>
              ))}
            </div>
          )}
          {selected && (
            <Card className="mt-6 p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Administrator preparation</p>
                  <h2 className="mt-1 text-xl font-bold">Prepare awareness warning</h2>
                </div>
                <Badge tone="warning">Security warning · pending review</Badge>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Choose an eligible incident category and edit the general guidance. The community category is fixed as
                Security Warning. Submission does not publish the post.
              </p>
              <form className="mt-6 space-y-5" onSubmit={reviewWarning}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="warning-category" className="mb-1.5 block text-sm font-semibold">
                      Incident pattern category
                    </label>
                    <Select
                      id="warning-category"
                      value={warning.incidentCategory}
                      onChange={(event) => {
                        const pattern = patterns.find((item) => item.incidentCategory === event.target.value);
                        if (pattern) choosePattern(pattern);
                      }}
                    >
                      {patterns.map((pattern) => (
                        <option key={pattern.incidentCategory} value={pattern.incidentCategory}>
                          {categoryLabel(pattern.incidentCategory)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="warning-training" className="mb-1.5 block text-sm font-semibold">
                      Related published training (optional)
                    </label>
                    <Select
                      id="warning-training"
                      value={warning.trainingId}
                      onChange={(event) => {
                        setWarning((current) => ({ ...current, trainingId: event.target.value }));
                        setReviewed(false);
                      }}
                    >
                      <option value="">No linked program</option>
                      {selected.relatedTraining.map((program) => (
                        <option key={program.id} value={program.id}>
                          {program.title}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div>
                  <label htmlFor="warning-title" className="mb-1.5 block text-sm font-semibold">
                    Warning title
                  </label>
                  <Input
                    id="warning-title"
                    required
                    maxLength={200}
                    value={warning.title}
                    onChange={(event) => {
                      setWarning((current) => ({ ...current, title: event.target.value }));
                      setReviewed(false);
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="warning-body" className="mb-1.5 block text-sm font-semibold">
                    General cybersecurity guidance
                  </label>
                  <Textarea
                    id="warning-body"
                    required
                    maxLength={5000}
                    rows={7}
                    value={warning.body}
                    onChange={(event) => {
                      setWarning((current) => ({ ...current, body: event.target.value }));
                      setReviewed(false);
                    }}
                  />
                </div>
                <section
                  aria-label="Human review requirements"
                  className="rounded-xl border border-warning-200 bg-warning-50 p-5"
                >
                  <h3 className="font-bold text-warning-950">Review for privacy and accuracy</h3>
                  <p className="mt-2 text-sm leading-6 text-warning-900">
                    Remove employee names, email addresses, account identifiers, internal notes, and confidential
                    technical details. Do not paste raw incident evidence. Use only verified, general cybersecurity
                    guidance. Send restricted material through the authorized security-reporting channel.
                  </p>
                  <label className="mt-4 flex items-start gap-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-brand-600"
                      checked={reviewed}
                      onChange={(event) => setReviewed(event.target.checked)}
                    />
                    <span>
                      I personally reviewed and edited this warning for privacy, accuracy, and appropriate guidance.
                    </span>
                  </label>
                </section>
                <section
                  aria-label="Sensitive-information disclaimer"
                  className="rounded-xl border border-slate-200 p-5"
                >
                  <h3 className="font-bold">{DISCLAIMER_DEFINITION.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{DISCLAIMER_DEFINITION.summary}</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {DISCLAIMER_DEFINITION.prohibitedItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    {DISCLAIMER_DEFINITION.restrictedGuidance}
                  </p>
                  <label className="mt-4 flex items-start gap-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-brand-600"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                    />
                    <span>{DISCLAIMER_DEFINITION.confirmation}</span>
                  </label>
                </section>
                {formError && (
                  <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-800">
                    {formError}
                  </p>
                )}
                {formError.includes('pattern changed') && (
                  <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
                    Refresh pattern before trying again
                  </Button>
                )}
                <Button type="submit" disabled={submitting}>
                  Review final warning
                </Button>
              </form>
            </Card>
          )}
          {submission && (
            <Card className="mt-6 border border-success-200 bg-success-50 p-5" role="status">
              <h2 className="text-lg font-bold text-success-950">Warning submitted for review</h2>
              <p className="mt-2 text-sm text-success-900">
                Status: {submission.post.status}. The warning is not publicly visible until a different administrator
                approves it. As the author, you cannot approve your own warning.
              </p>
              {submission.alreadyPrepared && (
                <p className="mt-2 text-sm text-success-900">
                  An identical pending warning was already prepared; no duplicate was created.
                </p>
              )}
              <Button as={Link} className="mt-4" variant="secondary" to="/admin/community">
                Open community moderation
              </Button>
            </Card>
          )}
        </>
      )}
      <Modal
        open={reviewOpen}
        onClose={() => {
          if (!submitting) setReviewOpen(false);
        }}
        title="Confirm warning for moderation"
        description="Review the exact text and selected training before creating a pending community post."
        footer={
          <>
            <Button variant="secondary" disabled={submitting} onClick={() => setReviewOpen(false)}>
              Edit warning
            </Button>
            <Button disabled={submitting} onClick={submitWarning}>
              {submitting ? 'Submitting…' : 'Submit for moderation'}
            </Button>
          </>
        }
      >
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-bold">Incident category</dt>
            <dd>{categoryLabel(warning.incidentCategory)}</dd>
          </div>
          <div>
            <dt className="font-bold">Warning title</dt>
            <dd className="break-words">{warning.title}</dd>
          </div>
          <div>
            <dt className="font-bold">Guidance</dt>
            <dd className="whitespace-pre-wrap break-words">{warning.body}</dd>
          </div>
          <div>
            <dt className="font-bold">Linked training</dt>
            <dd>{selectedTraining?.title ?? 'None'}</dd>
          </div>
        </dl>
        <p className="mt-5 rounded-lg bg-warning-50 p-3 text-sm text-warning-900">
          This creates a PENDING_REVIEW warning. Only a different administrator can approve it through community
          moderation.
        </p>
      </Modal>
    </>
  );
}
