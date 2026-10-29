# Phase D — Community reports

Employees can report a published post or publicly visible comment/reply for inappropriate content, misleading guidance, sensitive information, spam, or another concern. Optional details are bounded plain text and screened using the existing sensitive-pattern checks. Reports never automatically remove content or change post approval rules. Comments continue to publish immediately.

`POST /api/community/reports` accepts `targetType` (`POST` or `COMMENT`), `targetId`, `category`, and optional `details`. Authentication, employee role, trusted origin, an 8KB request limit and five reports per minute apply. One report per employee/target is enforced with database uniqueness; retries return `alreadyReported`. Pending/removed posts and hidden comments/replies cannot be reported. Report identities, details and decisions are not exposed through employee APIs.

Administrators use the Reported content moderation section. `GET /api/admin/community/reports` supports `status` (`PENDING`, `ACTIONED`, `DISMISSED`), `page` and `pageSize`. The queue includes current complete post/comment context, author, reporter, protected image previews and scan status. Resolved queues include reviewer, timestamp and reason.

`POST /api/admin/community/reports/:id/resolve` accepts `action` (`remove` or `dismiss`), `reason`, `expectedUpdatedAt` and `expectedContentUpdatedAt`. Existing administrator role/MFA, trusted-origin and moderation rate limits apply. Reviewers cannot decide reports concerning their own content or reports they submitted. Content and report row locks plus version checks prevent stale or conflicting decisions.

Removal reuses the existing post/comment moderation service inside the report transaction. Content removal, moderation history, report resolution and audit records succeed or roll back together. Existing post-image retention shortening and protected media visibility continue to apply. Dismissal records a reason without changing content. If content was already removed/deleted, the administrator can dismiss remaining reports with an explanation.

Migration `20261019000200_community_reports` adds reports, foreign keys, target XOR and resolution checks, category validation, duplicate constraints and queue indexes without changing existing posts. Audit records use the existing 90-day retention metadata and do not copy report text. Reports are retained with their target moderation history and cascade on target deletion. The interface previews current content, not a separate permanent copy of deleted employee text.

No video functionality or external analysis services are added. Automated text screening remains a conservative pattern check, not comprehensive DLP. Human review is still needed.
