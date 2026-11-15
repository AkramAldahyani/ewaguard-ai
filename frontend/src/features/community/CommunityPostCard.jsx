import { useState } from 'react';
import { Badge } from '../../components/ui/index.jsx';
import { dateTime, label } from './community-model.js';
import { CommunityImages } from './CommunityImages.jsx';
import { CommunityEngagement } from './CommunityEngagement.jsx';
import { CommunityComments } from './CommunityComments.jsx';
import { CommunityReport } from './CommunityReport.jsx';
import { DeleteOwnPost } from './DeleteOwnPost.jsx';

const statusLabels = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Published',
  REJECTED: 'Rejected',
  REMOVED: 'Removed',
};
const tones = { PENDING_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger' };
const feedback = {
  DRAFT: 'This draft has not been submitted for review.',
  PENDING_REVIEW: 'Awaiting security-team review. Only you and authorized reviewers can see this submission.',
  APPROVED: 'Your post is published in the community.',
  REJECTED:
    'This post was not approved and is not visible in the community. A reason has not been shared with you. Contact the security team for feedback before submitting again.',
  REMOVED: 'This post has been removed from the community. Contact the security team if you need clarification.',
};

export function CommunityAvatar({ name = 'Employee' }) {
  const initials = name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span className="community-avatar" aria-hidden="true">
      {initials || 'E'}
    </span>
  );
}

function relativeTime(value) {
  if (!value) return 'Awaiting publication';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  for (const [unit, duration] of [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]) {
    if (seconds >= duration)
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-Math.floor(seconds / duration), unit);
  }
}

export function CommunityPostCard({ post, own, onEngagement, onUnavailable, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const long = post.body.length > 650;
  const timestamp = own ? (post.submittedAt ?? post.createdAt) : post.approvedAt;
  return (
    <article className="community-post">
      <header className="flex items-start gap-3">
        <CommunityAvatar name={post.authorName} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy-900">{post.authorName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <time dateTime={timestamp ?? undefined} title={dateTime(timestamp)}>
              {relativeTime(timestamp)}
            </time>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-brand-700">{label(post.category)}</span>
          </div>
        </div>
        {own && <Badge tone={tones[post.status] ?? 'neutral'}>{statusLabels[post.status] ?? label(post.status)}</Badge>}
        {post.status === 'APPROVED' && <CommunityReport targetId={post.id} targetType="POST" />}
      </header>
      {post.title && (
        <h2 className="mt-5 text-lg font-bold leading-snug tracking-tight text-navy-900 sm:text-xl">{post.title}</h2>
      )}
      <p className="community-post-body">{long && !expanded ? `${post.body.slice(0, 650).trimEnd()}…` : post.body}</p>
      {long && (
        <button
          type="button"
          className="community-text-action"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
      <CommunityImages images={post.images} />
      {post.status === 'APPROVED' && (
        <CommunityEngagement
          post={post}
          onChange={onEngagement}
          onUnavailable={onUnavailable}
          commentsOpen={commentsOpen}
          onComments={() => setCommentsOpen(!commentsOpen)}
        />
      )}
      {post.status === 'APPROVED' && commentsOpen && (
        <CommunityComments
          postId={post.id}
          onCount={(commentCount) => onEngagement(post.id, { commentCount })}
          onUnavailable={onUnavailable}
        />
      )}
      {own && (
        <footer className="mt-5 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-600">
          <p>{feedback[post.status]}</p>
          <DeleteOwnPost postId={post.id} onDeleted={onDeleted} />
        </footer>
      )}
    </article>
  );
}
