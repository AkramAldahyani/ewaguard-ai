# Community C1: likes and saved posts

C1 adds persistent likes/unlikes and private saves/unsaves to published posts. Comments/replies remain deferred to C2; video uploads remain disabled.

## Database

Migration `20261018000100_community_engagement` adds `community_post_likes` and `community_post_saves`. Composite user/post primary keys prevent duplicates; foreign keys and indexes support lookup and safe cascade cleanup. No existing posts, attachments or moderation history are modified.

Deploy the migration and regenerate Prisma before starting the updated server. Likes and saves are not copied into audit logs or exposed as employee activity lists. The API exposes only aggregate like counts and the current user's flags; bookmarks remain private. Removed posts are excluded from saved results even if the underlying relationship remains for eventual cleanup when its post/user is deleted.

## Endpoints

- `PUT /api/community/:id/like` with `{ "active": true }` or false.
- `PUT /api/community/:id/save` with `{ "active": true }` or false.
- `GET /api/community/saved` with the existing page/pageSize/search/category parameters; newest saves first.
- Feed, own-post and detail results include `likeCount`, `liked` and `saved`.

All endpoints retain employee authentication, origin checks and rate limits. The server derives identity from the session and rejects forged fields. Writes lock the post using the same PostgreSQL row lock as moderation, check APPROVED, and then set the requested state idempotently. Counts are read from persisted records, not supplied by clients. Saved search/filtering and pagination run server-side and never return unpublished posts.

## Frontend

Outlined controls use accessible pressed states and 44px touch targets. Changes appear immediately, serialize requests per card, and restore the previous state on failure. Unmount aborts client requests; an already committed server action is reflected on the next fetch. Refreshing the Saved view reads persisted state. Unsave resets Saved pagination so removing an item cannot skip the next page boundary. Session/access/content-loss responses refresh protected results. No placeholder comment buttons or fake counts are added.

## Verification

Backend tests use local PostgreSQL and isolated synthetic users/posts, covering authorization, invalid fields, unpublished content, concurrent retries, primary-key uniqueness, counts, bookmark privacy, filters, paging and removal. UI tests cover optimistic changes, rollback, request serialization, persistence on refresh, Saved navigation and cancellation. They do not replace a live browser responsive/visual review.
