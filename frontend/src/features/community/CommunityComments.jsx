import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { apiRequest } from '../../services/api.js';
import { Button, IconButton } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { dateTime, label, commentError } from './community-model.js';
import { CommunityReport } from './CommunityReport.jsx';

function CommentItem({ item, postId, onDelete, busy, onCount, onUnavailable }) {
  const [replies, setReplies] = useState(false),
    [confirm, setConfirm] = useState(false);
  return (
    <li className="community-comment-item relative">
      <div className="flex items-start gap-2 pr-10">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800"
          aria-hidden="true"
        >
          {item.authorName.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy-900">
            {item.authorName}
            {item.own ? ' · You' : ''}
          </p>
          <time className="text-xs text-slate-500" dateTime={item.createdAt}>
            {dateTime(item.createdAt)}
          </time>
        </div>
      </div>
      {item.own && (
        <IconButton
          className="absolute right-0 top-1 text-slate-400 hover:text-danger-700"
          label="Delete comment"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </IconButton>
      )}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.body}</p>
      {item.status !== 'APPROVED' && (
        <p className="mt-2 text-xs font-semibold text-brand-800">
          {label(item.status)} · Only you and reviewers can see this comment.
        </p>
      )}
      {item.moderationReason && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">Review feedback: {item.moderationReason}</p>
      )}
      <div className="mt-1 flex flex-wrap gap-3">
        {item.status === 'APPROVED' && <CommunityReport targetId={item.id} targetType="COMMENT" />}
        {!item.parentId && item.status === 'APPROVED' && (
          <button
            type="button"
            className="community-text-action"
            aria-expanded={replies}
            onClick={() => setReplies(!replies)}
          >
            {replies ? 'Hide replies' : 'Replies / Reply'}
          </button>
        )}
      </div>
      {replies && (
        <div className="mt-3 border-l-2 border-brand-100 pl-3">
          <CommunityComments postId={postId} parentId={item.id} onCount={onCount} onUnavailable={onUnavailable} />
        </div>
      )}
      <Modal
        open={confirm}
        onClose={() => {
          if (!busy) setConfirm(false);
        }}
        title="Delete your comment?"
        description="Your comment and its replies will no longer appear in the discussion."
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => onDelete(item.id)}>
              {busy ? 'Deleting…' : 'Confirm delete'}
            </Button>
          </>
        }
      />
    </li>
  );
}

export function CommunityComments({ postId, parentId, onCount, onUnavailable }) {
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, items: [], hasMore: false, error: '' });
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [writeError, setWriteError] = useState('');
  const writing = useRef(null),
    callbacks = useRef({ onCount, onUnavailable });
  useEffect(() => {
    callbacks.current = { onCount, onUnavailable };
  }, [onCount, onUnavailable]);
  useEffect(() => () => writing.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page, pageSize: 20, ...(parentId ? { parentId } : {}) });
    apiRequest(`/api/community/${postId}/comments?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then((result) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          loading: false,
          error: '',
          hasMore: result.hasMore,
          items:
            page === 1
              ? result.items
              : [...new Map([...current.items, ...result.items].map((item) => [item.id, item])).values()],
        }));
        callbacks.current.onCount?.(result.commentCount);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: commentError(error),
          ...([401, 403, 404].includes(error.status) ? { items: [], hasMore: false } : {}),
        }));
        if ([401, 403, 404].includes(error.status)) callbacks.current.onUnavailable?.();
      });
    return () => controller.abort();
  }, [postId, parentId, page, revision]);
  function refresh() {
    setPage(1);
    setState({ loading: true, items: [], hasMore: false, error: '' });
    setRevision((value) => value + 1);
  }
  async function mutate(id) {
    if (writing.current) return;
    if (!id && (!body.trim() || body.length > 2000)) {
      setWriteError('Enter a comment before posting.');
      return;
    }
    const controller = new AbortController();
    writing.current = controller;
    setBusy(true);
    setWriteError('');
    setNotice('');
    try {
      await apiRequest(id ? `/api/community/comments/${id}` : `/api/community/${postId}/comments`, {
        method: id ? 'DELETE' : 'POST',
        signal: controller.signal,
        ...(!id ? { body: JSON.stringify({ body, ...(parentId ? { parentId } : {}) }) } : {}),
      });
      if (controller.signal.aborted) return;
      if (!id) setBody('');
      setNotice(
        id
          ? 'Comment deleted. Replies to a deleted comment are hidden.'
          : parentId
            ? 'Reply published.'
            : 'Comment published.',
      );
      refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      setWriteError(commentError(error));
      if ([401, 403, 404].includes(error.status)) {
        setState({ loading: false, items: [], hasMore: false, error: commentError(error) });
        callbacks.current.onUnavailable?.();
      }
    } finally {
      if (!controller.signal.aborted) {
        writing.current = null;
        setBusy(false);
      }
    }
  }
  const inputId = `community-comment-${postId}-${parentId ?? 'root'}`;
  return (
    <section className="mt-4 space-y-3" aria-label={parentId ? 'Comment replies' : 'Post comments'}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy-900">{parentId ? 'Replies' : 'Comments'}</h3>
        <button className="community-text-action" type="button" disabled={busy} onClick={refresh}>
          Refresh
        </button>
      </div>
      <form
        className="community-comment-composer"
        onSubmit={(event) => {
          event.preventDefault();
          mutate();
        }}
      >
        <span className="community-comment-avatar" aria-hidden="true">
          You
        </span>
        <label className="sr-only" htmlFor={inputId}>
          {parentId ? 'Write a reply' : 'Write a comment'}
        </label>
        <textarea
          id={inputId}
          className="community-comment-input"
          rows="1"
          value={body}
          maxLength={2000}
          disabled={busy}
          onChange={(event) => setBody(event.target.value)}
          placeholder={parentId ? 'Reply…' : 'Add a comment…'}
        />
        <button className="community-comment-submit" type="submit" disabled={busy || !body.trim()}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      </form>
      {notice && (
        <p role="status" className="text-sm text-brand-800">
          {notice}
        </p>
      )}
      {writeError && (
        <p role="alert" className="text-sm text-danger-700">
          {writeError}
        </p>
      )}
      <ul className="space-y-1">
        {state.items.map((item) => (
          <CommentItem
            key={item.id}
            item={item}
            postId={postId}
            busy={busy}
            onDelete={mutate}
            onCount={onCount}
            onUnavailable={onUnavailable}
          />
        ))}
      </ul>
      {state.loading && (
        <p role="status" className="text-sm text-slate-500">
          Loading comments…
        </p>
      )}
      {state.error && (
        <div role="alert">
          <p className="text-sm text-danger-700">{state.error}</p>
          <Button size="sm" variant="ghost" onClick={refresh}>
            Retry comments
          </Button>
        </div>
      )}
      {!state.loading && !state.error && !state.items.length && (
        <p className="text-sm text-slate-500">No comments yet.</p>
      )}
      {state.hasMore && !state.error && (
        <Button
          size="sm"
          variant="ghost"
          disabled={state.loading}
          onClick={() => {
            setState((current) => ({ ...current, loading: true }));
            setPage((value) => value + 1);
          }}
        >
          Load more comments
        </Button>
      )}
    </section>
  );
}
