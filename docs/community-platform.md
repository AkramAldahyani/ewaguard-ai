# Security Community — Phase 12

Phase 12A1 provides employee-only community APIs. Phase 12B1 adds administrator moderation APIs; Phase 12B2 adds the administrator workspace. Phase 12A2 adds the employee community interface. The existing community, moderation history, and disclaimer Prisma models are reused without migration.

## Submission and publication

`POST /api/community` accepts only `title`, `body`, `category`, and `acknowledgementId`. The title is 1–200 characters; body is 1–5,000 characters. Both are trimmed plain text; HTML angle brackets and unsafe control characters are rejected. The allowed categories are `PHISHING`, `SUSPICIOUS_EMAIL`, `SUSPICIOUS_LINK`, `SUSPICIOUS_FILE`, `SECURITY_TIP`, `SECURITY_WARNING`, and `EDUCATIONAL_CONTENT`. Author, timestamps, and `PENDING_REVIEW` status come from the server. There is no employee moderation endpoint.

Before submission, the employee must acknowledge the existing sensitive-information notice with `POST /api/disclaimers/acknowledge` and `context: "COMMUNITY_POST"`. The returned ID is checked inside the submission transaction against the authenticated employee, exact context, current version, and a ten-minute validity window. The notice instructs employees to use their approved reporting channel for restricted material. The backend cannot guarantee that free text contains no secrets, so administrator review remains mandatory before shared publication.

The server locks the author row, then treats an identical pending title/body/category from the same author within five minutes as a retry and returns the existing post. Creation and a minimized audit record commit together. No post is made public by this endpoint.

## Authenticated employee endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/community` | Approved-only feed; `page`, `pageSize`, `category`, `search` |
| GET | `/api/community/:id` | Approved-only full post |
| GET | `/api/community/mine` | Own submissions; additionally `status` filter |
| GET | `/api/community/mine/:id` | Own full post and moderation status |
| POST | `/api/community` | Submit for review |

Lists are newest-first and bounded to 50 items per page. Search covers title and body, with at most 100 characters. Shared responses expose only first name and last initial, and omit email, employee ID, acknowledgement metadata, and internal moderation information. Own submission details retain the full author display name but still omit moderation notes. Missing, foreign, and non-approved shared IDs return the same not-found response.

All routes require active cookie authentication and the employee role, trusted origin, private no-store responses, and per-user rate limits. JSON submissions are capped at 16 KiB and unknown request fields are rejected.

## Administrator moderation API (12B1)

All `/api/admin/community` routes require an active administrator session with verified MFA and a trusted origin. Responses are private and non-cacheable. The administrator list accepts `page`, `pageSize`, `status`, `category`, `authorId`, `search`, `submittedFrom`, `submittedTo`, and `sort`. Dates are UTC `YYYY-MM-DD`, inclusive; sort is `submitted_desc` (default), `submitted_asc`, or `updated_desc`. Search covers title, body, and author first/last name. Each detail response includes the post's `updatedAt` version and moderation history with decision, prior status, reason, moderator, and timestamp.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/community` | Review list with filters, search, sorting, and pagination |
| GET | `/api/admin/community/:id` | Full post and internal moderation history |
| POST | `/api/admin/community/:id/approve` | Pending to approved |
| POST | `/api/admin/community/:id/reject` | Pending to rejected |
| POST | `/api/admin/community/:id/remove` | Approved to removed |

Decision bodies require `reason` (plain text, up to 1,000 characters) and `expectedUpdatedAt` from the administrator detail/list response. The post row is locked during the transaction. A stale version or invalid transition returns 409; no second history entry is created. The post change, moderation history, and minimized audit record commit together. Employees never receive the internal reason or moderator history. Approval is blocked if a legacy attachment exists, pending secure attachment review. Employee approved-only feed queries immediately exclude rejected and removed posts.

## Administrator workspace (12B2)

`/admin/community` uses the protected administrator route and the authenticated API utility. The queue starts at pending review and supports backend search, category/status/author/date filters, sorting, and pagination. Selecting a post loads the full authorized detail and history. A reason and explicit confirmation are required for approve, reject, or remove. A decision sends the version currently displayed; on a stale 409 response, the interface reloads the post, preserves the reason, and requires the administrator to acknowledge the updated state before deciding again. Successful decisions refresh the detail and queue. The workspace keeps moderation data in component memory only.

## Employee interface (12A2)

`/community` provides an approved-only feed, category/text search, pagination, full post detail, a private My Submissions list with moderation statuses, and a plain-text Create Post form. The form displays the shared sensitive-information notice and requires an unchecked acknowledgement for every submission. The client records `COMMUNITY_POST` acknowledgement through the existing disclaimer API immediately before sending the post; the community backend verifies its identity, context, version, and freshness. The submission response is treated as pending review, never as publication. Employee pages do not request or display moderation history or internal reasons. Attachments have no employee controls.

## Attachments

Attachments are deferred. The existing file-analysis endpoint scans an upload but does not provide an authorized attachment storage and download lifecycle for community posts. Phase 12A1 accepts no multipart body, attachment field, or raw file URL. Any later attachment work must reuse strict validation, scanning, isolation, access checks, and cleanup without sending organizational files to VirusTotal by default.

Phase 12A2 validation: 466 backend and 228 frontend regression tests passed sequentially. Lint, production build, backend syntax checks, Prisma validation, migration status, and dependency audit passed. All nine migrations remain current; the audit found zero vulnerabilities. Browser visual verification was not performed.
