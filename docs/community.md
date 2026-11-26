# Security community

## In short

The **Security Community** (`/community`) is an internal space where employees
share security warnings, tips and examples of suspicious messages. To keep it
safe:

- **Posts** must be **approved by an administrator** before other employees can see them.
- **Comments and replies** are published immediately, but are screened by the server and can be removed by administrators.
- **Images** are scanned and cleaned before anyone can see them.
- Employees can **like**, **save** and **report** content.

```text
Employee writes a post → PENDING_REVIEW → administrator approves or rejects
   → APPROVED posts appear in the feed → moderation action recorded
```

## Posts

- Fields: **title** (1–200 characters), **body** (1–5,000), **category**: PHISHING, SUSPICIOUS_EMAIL, SUSPICIOUS_LINK, SUSPICIOUS_FILE, SECURITY_TIP, SECURITY_WARNING, EDUCATIONAL_CONTENT.
- Plain text only; HTML and control characters are rejected.
- Before each submission the employee must accept the [sensitive-information notice](disclaimers.md) (`COMMUNITY_POST`, valid 10 minutes).
- The author, time and `PENDING_REVIEW` status are set by the server. Submitting the same post twice within five minutes returns the first one.
- The feed and other people's view show only the author's **first name and last initial**, never email or employee ID.
- Authors see their own submissions and status under **My Posts**, but never the internal moderation reason.
- Authors can **delete** their own posts (after confirmation). The post disappears from feeds and saved lists, its images expire at once, and an audit record `COMMUNITY_POST_DELETED` is kept. Moderation and report history remain for administrators.

### Post statuses

| Status | Meaning |
| --- | --- |
| `PENDING_REVIEW` | Waiting for an administrator |
| `APPROVED` | Visible to all employees |
| `REJECTED` | Not published |
| `REMOVED` | Taken down after approval, or deleted by the author |

## Moderation (administrators)

The **Community moderation** page (`/admin/community`, MFA required) has queues for
posts, comments and reports.

- Filters: status, category, author, date range, text search; sort by submitted or updated time.
- Each decision (**approve**, **reject**, **remove**) needs a written reason and an explicit confirmation.
- Decisions include `expectedUpdatedAt`; if the post changed meanwhile, the API returns 409 and the page reloads while keeping the typed reason.
- The post change, its moderation history and an audit record are saved together.
- Administrators cannot moderate their own content (even if they wrote it as an employee earlier).

## Comments and replies

- Up to 2,000 characters, one level of replies, only on approved posts.
- Published **immediately** after server checks. The server rejects recognizable passwords, private keys, tokens, email addresses, some labeled personal identifiers and explicit threats. This is a basic filter, not full data-loss prevention; administrators remove anything inappropriate found later.
- 10 comments per minute per employee; duplicates within five minutes are ignored.
- Authors can delete their own comments (the text is erased; replies are hidden). Administrators can remove comments with a reason shared with the author.
- Comments are never sent to the AI or any outside service.

## Likes and saved posts

- Like or save any approved post (`PUT /api/community/:id/like` or `/save` with `{ "active": true | false }`).
- Only total like counts and your own like/save state are shown. Saved posts are private. Removed posts disappear from saved lists.

## Images

Employees can attach JPG, PNG or WebP photos (videos are not supported).

1. The upload requires an employee session, trusted origin and the `COMMUNITY_POST` acknowledgement (also recorded as `COMMUNITY_ATTACHMENT` and `FILE_ANALYSIS`).
2. Extension, type and real file signature are checked.
3. **ClamAV and YARA must both run and find nothing.** If either is unavailable or fails, the upload is **refused**; administrators cannot override this.
4. **sharp** fully decodes the image, removes metadata (such as GPS location), fixes orientation and re-saves it as PNG. The new image is scanned again.
5. Only the cleaned image is stored, under a random name in a private folder (`COMMUNITY_MEDIA_ROOT`), outside the website and repository. The original is not kept.
6. Every view checks permission, expiry, scan results and the SHA-256 fingerprint. Pending images are visible only to the author and administrators.
7. Approving a post with images requires reviewing the images too.

No image is ever sent to an outside service.

| Setting | Default |
| --- | --- |
| Images per post | 4 |
| Upload size | 5 MiB each, 16 megapixels |
| Stored size | 8 MiB each |
| Quota | 100 MiB per author, 1 GiB total |
| Kept for | 90 days (7 days after rejection or removal) |

Clean-up: `node backend/scripts/community-media-cleanup.js --preview` and `--apply`
(follows the normal retention switches; see [privacy and retention](privacy-and-retention.md)).

## Reports

- Employees can report an approved post or a visible comment for inappropriate content, misleading advice, sensitive information, spam or other reasons, with optional details (screened like comments).
- One report per employee per item; 5 reports per minute.
- Reports never remove anything automatically.
- Administrators resolve reports by **removing** the content or **dismissing** the report, with a reason. They cannot handle reports about their own content or reports they filed.
- Reporter identities and decisions are not shown to employees.

## API summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/community` | Approved feed (search, category, pages of up to 50) |
| GET | `/api/community/:id` | One approved post |
| GET | `/api/community/mine`, `/mine/:id` | My posts and their status |
| GET | `/api/community/saved` | My saved posts |
| POST | `/api/community` | Submit a post for review |
| DELETE | `/api/community/:id` | Delete my post |
| PUT | `/api/community/:id/like`, `/save` | Like / save |
| GET, POST | `/api/community/:postId/comments` | Read / write comments |
| DELETE | `/api/community/comments/:id` | Delete my comment |
| POST | `/api/community/reports` | Report content |
| GET, POST | `/api/admin/community`, `/:id/approve`, `/reject`, `/remove` | Post moderation |
| GET, POST | `/api/admin/community/comments`, `/comments/:id/...` | Comment moderation |
| GET, POST | `/api/admin/community/reports`, `/reports/:id/resolve` | Report handling |

All routes need a signed-in user of the right role, a trusted origin and rate
limits; responses are private and `no-store`.

## Code and tests

- Backend: `backend/src/community/`, `backend/src/routes/community.js`, `admin-community.js`, `community-media.js`
- Frontend: `frontend/src/features/community/`
- Tests: `backend/tests/community*.test.js`, `frontend/tests/community-*.test.mjs` (scanners are simulated in tests; a real scanner check is a separate deployment step)
