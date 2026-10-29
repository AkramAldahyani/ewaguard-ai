# Community C2: immediately published comments and replies

C2 adds text comments, one level of replies, author deletion, and an administrator comment queue. It does not add reporting, Popular sorting, post editing or video uploads.

## Publication and privacy

Under the updated publication policy, new comments/replies on public posts are stored as APPROVED immediately after server validation; no administrator approval is required. Existing pending/rejected records are not bulk-published. Only their authors and administrators can see them, and legacy pending records remain reviewable. Public lists and counts include only APPROVED comments; replies also require an APPROVED parent. Removing/deleting a parent hides its replies and excludes them from counts. Employees cannot comment on unpublished posts or reply to pending roots, another post's roots, or existing replies. Post and image approval requirements remain unchanged.

The database migration `20261018000200_community_comments` adds comments and moderation actions without changing existing posts. Foreign keys, indexes and a parent-validation trigger prevent cross-post replies, grandchildren and changes to thread/ownership identity. All mutations lock the same post row used by post moderation. Version checks prevent stale moderator decisions. Self-moderation is denied, including when an employee author later becomes an administrator.

The moderator supplies a plain-text reason, explicitly described as shared with the comment author. Other employees cannot see this reason. Moderation history and metadata-only audit events are persisted transactionally. Employee deletion erases that comment's body, marks the row REMOVED and preserves thread/audit structure; replies are hidden, not deleted. Administrator removal retains text for restricted review. There is no comment editing or automatic reapproval.

## Input safeguards

Authenticated sessions, roles, trusted origins, bounded JSON, strict field validation and per-user rate limiting apply. Submission is limited to ten requests per minute per application instance; deployment across multiple instances needs shared rate-limit storage. Duplicate published submissions within five minutes are idempotent. Publication creates a COMMUNITY_COMMENT_PUBLISHED audit event with IMMEDIATE policy metadata, not a fabricated administrator approval.

Text is Unicode-normalized, limited to 2,000 characters, and rejects HTML/control characters. Conservative server-side screening rejects recognizable credentials/private keys/tokens, email addresses, certain labelled personal identifiers and explicit threat patterns. These patterns are **not comprehensive DLP or abuse detection**. Content that passes is immediately visible, so administrators must remove inappropriate content discovered afterward. No AI or third-party service receives comments.

Comments use a compact direct-post composer without a separate acknowledgement step. Server-side length, content, authorization, rate-limit, and approved-post checks still apply before immediate publication. Historical acknowledgement metadata is retained when present; new comments leave those optional fields empty.

## API and UI

- `GET /api/community/:postId/comments`: paginated roots; optional `parentId` retrieves a root's replies. Includes approved-only total count.
- `POST /api/community/:postId/comments`: body and optional parentId.
- `DELETE /api/community/comments/:id`: owner only; repeat deletion is idempotent.
- `GET /api/admin/community/comments`: status-filtered, paginated review queue with complete post/parent context and recent moderation history.
- `POST /api/admin/community/comments/:id/approve|reject|remove`: reason and expectedUpdatedAt required.

Employees expand discussion inline, load additional comments, open a single-level reply thread, publish with immediate confirmation, and confirm deletion. Authors can still see legacy pending/rejected status and review feedback. Errors preserve drafts. Requests are cancelled on unmount and access-loss responses clear stale content. The administrator comment queue defaults to published content and retains removal controls and legacy pending review. No additional migration or changes to historical records are needed for this policy update; the schema's conservative default remains, while the validated submission service explicitly sets APPROVED.

Deploy the migration and regenerate Prisma before starting the updated server. Tests cover backend authorization, consent, moderation, concurrency, privacy/counts, thread integrity, deletion and UI behavior. Live browser visual review is separate from DOM-based interaction tests.
