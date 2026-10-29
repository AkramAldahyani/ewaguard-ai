import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { apiRequest } from '../../services/api.js';

export function DeleteOwnPost({ postId, onDeleted }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  async function remove() {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try {
      await apiRequest(`/api/community/${encodeURIComponent(postId)}`, { method: 'DELETE', signal: controller.signal });
      if (!controller.signal.aborted) { setOpen(false); onDeleted(); }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.status === 401 ? 'Your session expired. Sign in again.' : [403, 404].includes(failure.status) ? 'This post is unavailable or does not belong to you.' : 'The post could not be deleted. Please try again.');
    } finally { if (!controller.signal.aborted) { request.current = null; setBusy(false); } }
  }
  return <>
    <button type="button" className="community-text-action" onClick={() => setOpen(true)}><Trash2 className="size-4" aria-hidden="true" />Delete post</button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title="Delete your post?" description="This removes your post and its discussion from employee views. Moderation and audit records are retained. You cannot undo this action." footer={<><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Confirm delete post'}</Button></>}>
      {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
    </Modal>
  </>;
}
