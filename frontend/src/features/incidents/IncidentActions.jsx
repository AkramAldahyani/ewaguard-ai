import { useState } from 'react';
import { Button, Card, Field, Select, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { label, personName } from './incident-flow.js';

// Wording for each lifecycle step the backend currently allows from the incident's status.
const transitionLabel = (from, to) =>
  ({
    UNDER_INVESTIGATION: from === 'NEW' ? 'Start investigation' : 'Reopen investigation',
    CONTAINED: 'Mark contained',
    RESOLVED: 'Mark resolved',
    FALSE_POSITIVE: 'Mark false positive',
    CLOSED: 'Close incident',
  })[to] ?? label(to);

export function AssigneeOptions({ state }) {
  return (
    <>
      {state.assignees.map((person) => (
        <option key={person.id} value={person.id}>
          {personName(person)}
        </option>
      ))}
    </>
  );
}
export function AssigneeFeedback({ state, flow }) {
  return (
    <>
      {state.assigneeLoading && (
        <p role="status" className="mt-2 text-xs text-slate-500">
          Loading eligible administrators…
        </p>
      )}
      {state.assigneeError && (
        <div role="alert" className="mt-2 text-sm text-danger-700">
          {state.assigneeError}
          <Button variant="ghost" size="sm" onClick={() => flow.assignees()}>
            Retry administrators
          </Button>
        </div>
      )}
      {state.moreAssignees && (
        <Button variant="ghost" size="sm" disabled={state.assigneeLoading} onClick={() => flow.assignees(true)}>
          Load more administrators
        </Button>
      )}
    </>
  );
}
export function IncidentActions({ state, flow, currentUserId }) {
  const { incident, allowedTransitions = [], noteNotice } = state.data;
  const [assignee, setAssignee] = useState(incident.assignee?.id ?? '');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState('SECURITY_TEAM');
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState('');
  const prepare = (operation, input, title, description) => {
    setError('');
    setConfirmation({ operation, input, title, description });
  };
  const submitNote = (event) => {
    event.preventDefault();
    if (!body.trim() || body.length > 4000 || !acknowledged || !noteNotice?.version) {
      setError('Enter a note of 1–4,000 characters and acknowledge the information notice.');
      return;
    }
    prepare(
      'notes',
      { body: body.trim(), visibility, acknowledged, noticeVersion: noteNotice.version },
      visibility === 'REPORTER' ? 'Publish employee-visible update?' : 'Save internal investigation note?',
      visibility === 'REPORTER'
        ? 'The reporting employee will be able to read this update. Check that every detail is appropriate to share.'
        : 'This note will be visible only to authorized security administrators.',
    );
  };
  return (
    <Card className="p-5 sm:p-6" onChange={() => flow.setEditing(true)}>
      <h2 className="text-lg font-bold">Manage incident</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">Changes are recorded in the investigation history.</p>
      <fieldset disabled={state.busy} className="mt-5 space-y-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            prepare(
              'assignment',
              { assigneeId: assignee || null },
              'Change assignment?',
              `Assign this incident to ${assignee ? personName(state.assignees.find((p) => p.id === assignee) ?? incident.assignee) : 'no administrator (unassigned)'}.`,
            );
          }}
        >
          <Field id="incident-assignee" label="Assigned administrator">
            {(props) => (
              <Select {...props} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                <option value="">Unassigned</option>
                {incident.assignee && !state.assignees.some((p) => p.id === incident.assignee.id) && (
                  <option value={incident.assignee.id} disabled>
                    {personName(incident.assignee)} (current)
                  </option>
                )}
                <AssigneeOptions state={state} />
              </Select>
            )}
          </Field>
          <AssigneeFeedback state={state} flow={flow} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              type="submit"
              disabled={state.busy || assignee === (incident.assignee?.id ?? '')}
            >
              Review assignment
            </Button>
            {currentUserId && incident.assignee?.id !== currentUserId && (
              <Button
                variant="subtle"
                disabled={state.busy}
                onClick={() =>
                  prepare(
                    'assignment',
                    { assigneeId: currentUserId },
                    'Assign this incident to you?',
                    'You become the assigned administrator for this incident.',
                  )
                }
              >
                Assign to me
              </Button>
            )}
          </div>
        </form>
        <div className="border-t border-slate-100 pt-5">
          <h3 className="font-bold">Next step</h3>
          <p className="mt-1 text-sm text-slate-500">Current status: {label(incident.status)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {allowedTransitions.map((value, index) => (
              <Button
                key={value}
                data-status={value}
                variant={index === 0 ? 'primary' : 'secondary'}
                className={index === 0 ? 'incident-primary-action' : undefined}
                disabled={state.busy}
                onClick={() =>
                  prepare(
                    'status',
                    { status: value },
                    `${transitionLabel(incident.status, value)}?`,
                    `${label(incident.status)} → ${label(value)}. This status change will be visible to the reporting employee.${
                      value === 'UNDER_INVESTIGATION' && !incident.assignee && !incident.assigneeId
                        ? ' The incident is unassigned, so it will be assigned to you.'
                        : ''
                    }`,
                  )
                }
              >
                {transitionLabel(incident.status, value)}
              </Button>
            ))}
            {!allowedTransitions.length && <p className="text-sm text-slate-500">No status changes are available.</p>}
          </div>
        </div>
        <form className="space-y-4 border-t border-slate-100 pt-5" onSubmit={submitNote}>
          <h3 className="font-bold">Add investigation note</h3>
          <Field id="incident-note-visibility" label="Who can read this note?">
            {(props) => (
              <Select
                {...props}
                value={visibility}
                onChange={(event) => {
                  setVisibility(event.target.value);
                  setAcknowledged(false);
                }}
              >
                <option value="SECURITY_TEAM">Internal — security team only</option>
                <option value="REPORTER">Shared — reporting employee and security team</option>
              </Select>
            )}
          </Field>
          <div
            className={`rounded-xl border p-3 text-sm leading-6 ${visibility === 'REPORTER' ? 'border-warning-300 bg-warning-50 text-warning-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
          >
            {visibility === 'REPORTER'
              ? 'Employee-visible update: the reporting employee will see the complete text.'
              : 'Internal investigation note: only authorized security administrators can read it.'}
          </div>
          <Field
            id="incident-note"
            label={visibility === 'REPORTER' ? 'Update for the employee' : 'Internal note'}
            hint={`${body.length} / 4,000 characters`}
            required
          >
            {(props) => (
              <Textarea
                {...props}
                maxLength={4000}
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  setAcknowledged(false);
                }}
              />
            )}
          </Field>
          <p className="text-xs leading-5 text-slate-600">
            {noteNotice?.message ?? 'The information notice is unavailable. Refresh the incident before adding a note.'}
          </p>
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              className="mt-1 size-4 shrink-0 accent-brand-600"
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>I have reviewed the notice and confirm this content is appropriate for the selected audience.</span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={state.busy || !body.trim() || !acknowledged || !noteNotice?.version}>
            {visibility === 'REPORTER' ? 'Review employee-visible update' : 'Review internal note'}
          </Button>
        </form>
      </fieldset>
      {state.busy && (
        <p role="status" className="mt-4 text-sm text-brand-700">
          Saving change…
        </p>
      )}
      <Modal
        open={Boolean(confirmation)}
        onClose={() => {
          if (!state.busy) setConfirmation(null);
        }}
        title={confirmation?.title ?? 'Review change'}
        description={confirmation?.description}
        footer={
          <>
            <Button variant="secondary" disabled={state.busy} onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              disabled={state.busy}
              onClick={async () => {
                const change = confirmation;
                if (!change || state.busy) return;
                setConfirmation(null);
                const saved = await flow.mutate(change.operation, change.input);
                if (saved) {
                  setBody('');
                  setAcknowledged(false);
                }
              }}
            >
              Confirm change
            </Button>
          </>
        }
      >
        <p className="text-xs font-semibold text-slate-500">{incident.reference}</p>
        {confirmation?.operation === 'notes' && (
          <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm">
            {confirmation.input.body}
          </p>
        )}
      </Modal>
    </Card>
  );
}
