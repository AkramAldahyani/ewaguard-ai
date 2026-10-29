import { useEffect, useRef, useState } from 'react';
import { Bookmark, ThumbsUp, MessageSquare } from 'lucide-react';
import { createEmployeeCommunityApi } from './employee-community-api.js';

const api = createEmployeeCommunityApi();
export function CommunityEngagement({ post, onChange, onUnavailable, commentsOpen, onComments }) {
  const [optimistic, setOptimistic] = useState(null), [error, setError] = useState('');
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const value = optimistic ?? { liked: post.liked ?? false, saved: post.saved ?? false, likeCount: post.likeCount ?? 0 };
  async function change(kind) {
    if (request.current) return;
    const key = kind === 'like' ? 'liked' : 'saved', active = !value[key];
    const controller = new AbortController(); request.current = controller;
    setError(''); setOptimistic({ ...value, [key]: active,
      likeCount: kind === 'like' ? Math.max(0, value.likeCount + (active ? 1 : -1)) : value.likeCount });
    try {
      const result = await api.engage(post.id, kind, active, controller.signal);
      if (!controller.signal.aborted) onChange(post.id, result.engagement);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if ([401, 403, 404].includes(failure.status)) { onUnavailable(); return; }
      setError(`Could not ${kind === 'like' ? 'update your like' : 'update your saved posts'}. Your previous state has been restored. Try again.`);
    } finally {
      if (!controller.signal.aborted) { setOptimistic(null); request.current = null; }
    }
  }
  return <div className="mt-5 border-t border-slate-100 pt-3">
    <div className="flex flex-wrap items-center gap-2" aria-label="Post actions" aria-busy={Boolean(optimistic)}>
      <button type="button" className="community-engagement" aria-label={value.liked ? 'Unlike post' : 'Like post'} aria-pressed={value.liked} disabled={Boolean(optimistic)} onClick={() => change('like')}>
        <ThumbsUp className="size-4" aria-hidden="true" /><span>{value.liked ? 'Liked' : 'Like'}</span><span className="tabular-nums" aria-label={`${value.likeCount} likes`}>{value.likeCount}</span>
      </button>
      <button type="button" className="community-engagement" aria-label="Comments" aria-expanded={commentsOpen} onClick={onComments}><MessageSquare className="size-4" aria-hidden="true" /><span>Comments</span><span className="tabular-nums">{post.commentCount ?? 0}</span></button>
      <button type="button" className="community-engagement ml-auto" aria-label={value.saved ? 'Unsave post' : 'Save post'} aria-pressed={value.saved} disabled={Boolean(optimistic)} onClick={() => change('save')}>
        <Bookmark className="size-4" fill={value.saved ? 'currentColor' : 'none'} aria-hidden="true" /><span>{value.saved ? 'Saved' : 'Save'}</span>
      </button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-danger-700">{error}</p>}
  </div>;
}
