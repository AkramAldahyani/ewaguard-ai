# Phase 14A — incident-to-awareness backend

The administrator workflow begins with `GET /api/admin/incident-awareness` and can prepare a reviewed warning through `POST /api/admin/incident-awareness/warnings`. Both routes require a cookie-authenticated `IT_SECURITY_ADMIN` session with verified MFA and a trusted origin. Responses are private and no-store; requests are rate limited. No OpenAI call is involved.

## Pattern review

`GET` accepts the same `period`, `start`, and `end` parameters as Security Analytics: `7d`, `30d` (default), `90d`, or a custom inclusive UTC range of at most 90 days. The response contains `range`, `minimumPatternCount`, `patterns`, and `trainingOptionsTruncated`. Each pattern includes only a broad incident category, a count of incidents created in that period, a general suggested warning title/body, and up to five related **published** training programs. False-positive incidents, `OTHER` incidents, and categories with fewer than three qualifying incidents are excluded. Counts use current incident status; they are not historical status snapshots. The service never reads incident evidence, descriptions, employee identities, private notes, or AI summaries for this projection.

Suggested training topics are allow-listed: phishing → phishing; malware → malware; credential compromise → password security/MFA; data exposure → information handling; suspicious activity → safe browsing/incident reporting. A suggested warning is general educational copy, not a factual claim about individual cases. An administrator must review it before submitting anything.

## Prepare a warning

`POST /api/admin/incident-awareness/warnings` accepts JSON with `incidentCategory`, `period` and optional custom `start`/`end`, `title`, `body`, optional `trainingId`, a current `COMMUNITY_POST` disclaimer `acknowledgementId`, and `reviewed: true`. The backend rechecks the category count in the selected period and validates an optional training link against the published program's topic. Titles and bodies are bounded plain text; HTML, URLs, email addresses, IP addresses, UUIDs, hashes, and obvious local paths are rejected. The acknowledgement must belong to the acting administrator, use the current disclaimer version, and be less than ten minutes old.

The resulting community post is always `PENDING_REVIEW` and is hidden from the employee feed. It can be approved only through the existing moderation endpoint, by a **different** administrator, with the normal reason, version, audit, and concurrency checks. Matching pending submissions by the same administrator within five minutes are idempotent, including concurrent retries. The action creates a minimal `INCIDENT_AWARENESS_WARNING_PREPARED` audit record containing the broad category, UTC pattern range, and optional training ID, never case contents. The existing administrator moderation detail includes the linked training's ID, title, and publication status.

Warning text still requires human review: pattern matching cannot recognize every confidential detail or a person's name. Administrators must avoid copying case evidence and use the approved incident-reporting channel for restricted information. A pending warning is not automatically published, and an administrator cannot approve their own post.

## Training assignments

The existing `POST /api/admin/training/:id/assignments` remains the sole assignment path. It requires an explicit administrator request with an eligible employee ID, verifies that the program is published, prevents duplicate assignments, and writes the existing training audit entry. The incident-awareness endpoints never enumerate employees or enroll anyone. Phase 14B will link the new pattern review and warning preparation controls from the existing administrator incident and analytics interfaces.

No schema migration, new campaign table, automatic quiz creation, or notification channel is part of 14A.
