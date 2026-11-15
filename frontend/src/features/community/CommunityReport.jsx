import { useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import { Button, Select, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { apiRequest } from '../../services/api.js';
import { reportError, label } from './community-model.js';

export function CommunityReport({ targetId, targetType }) {
  const [open, setOpen] = useState(false),
    [category, setCategory] = useState('INAPPROPRIATE');
  const [details, setDetails] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event) {
    event.preventDefault();
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/community/reports', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ targetType, targetId, category, details }),
      });
      if (!controller.signal.aborted) {
        setSent(true);
        setOpen(false);
        setDetails('');
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(reportError(failure));
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <>
      <button
        type="button"
        className="community-text-action"
        aria-label={`Report ${targetType.toLowerCase()}`}
        disabled={sent}
        onClick={() => setOpen(true)}
      >
        <Flag className="size-3.5" aria-hidden="true" />
        {sent ? 'Reported' : 'Report'}
      </button>
      {sent && (
        <span role="status" className="sr-only">
          Report sent to the security team.
        </span>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={`Report ${targetType.toLowerCase()}`}
        description="Tell the security team what needs review."
      >
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold">
            Report category
            <Select
              className="mt-2"
              value={category}
              disabled={busy}
              onChange={(event) => setCategory(event.target.value)}
            >
              {['INAPPROPRIATE', 'MISLEADING', 'SENSITIVE_INFORMATION', 'SPAM', 'OTHER'].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-semibold">
            Details (optional)
            <Textarea
              className="mt-2"
              maxLength={1000}
              value={details}
              disabled={busy}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Describe the concern without copying sensitive information."
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send report'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
