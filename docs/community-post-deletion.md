# Employee post deletion

Employees can delete their own submissions from My Posts after confirmation. The authenticated `DELETE /api/community/:id` endpoint checks ownership on the server, trusted origin and the existing write rate limit. Missing and other employees' posts return the same 404 response. Retrying deletion is idempotent.

Deletion sets `deletedAt` and `REMOVED` in a transaction under the same post lock used by moderation, commenting, reporting and engagement. Deleted posts disappear from My Posts, public feeds and saved listings. Comments become inaccessible. Concurrent/stale approval cannot republish a deleted post. The operation does not delete another author's comments or erase moderation/report history.

Attached community images expire immediately and become unavailable through protected media endpoints. The existing retention cleanup removes their bytes, preserving evidence linked to investigations. Post text and moderation records remain available to authorized administrators for review. A `COMMUNITY_POST_DELETED` audit event records the actor and previous status without copying content.

Migration: `20261019000300_employee_post_deletion` adds a nullable timestamp and preserves existing posts.
