# Phase 10B1 — Incident management backend

Phase 10B is split into the backend (10B1) and responsive interfaces with frontend
interaction tests (10B2). This phase adds no notification delivery, Socket.IO,
new AI tools, severity overrides, or later-phase work. Phase 10A automatic incident
creation, original risk values, source snapshots and receipts remain unchanged.
Existing incident, comment, event and audit models suffice; no migration is needed.

## API contract

All endpoints require the existing session cookie. `/api/admin/incidents` requires
an active IT_SECURITY_ADMIN with a current server-verified MFA enrollment proof.
`/api/incidents` requires EMPLOYEE and always scopes queries to the session owner.
Missing and foreign employee resources both return 404.

| Method | Path under either prefix | Result |
| --- | --- | --- |
| GET | `/` | Incident summaries, filters and bounded pagination |
| GET | `/:id` | Incident detail; admin also receives allowed transitions and note notice |
| GET | `/:id/history` | Persisted event history, newest first |
| GET | `/:id/notes` | Non-redacted investigation notes or reporter-visible updates |
| GET | `/assignees` (admin only) | Active MFA-enabled security administrators |
| POST | `/:id/assignment` (admin only) | Assign or unassign |
| POST | `/:id/status` (admin only) | Apply an allowed status transition |
| POST | `/:id/notes` (admin only) | Add an explicitly scoped note/update |

IDs are UUIDs. Lists return `{items, page, pageSize, hasMore}` with page default 1,
pageSize default 20, maximum 100, and page maximum 10000. Ordering uses creation
time and ID to break ties. Offset pages can shift as new records arrive; refresh
the list after a mutation. Lists do not calculate unbounded total counts.

Incident filters: `status`, `severity`, `type`, exact `reference` (for example
`INC-2026-000123`), and inclusive `createdFrom`/`createdTo` timestamps in canonical
UTC format `YYYY-MM-DDTHH:mm:ss.sssZ`. Administrators can additionally filter by
`reporterId`, `departmentId`, and `assigneeId` (UUID or `unassigned`). Department
filtering uses the incident's stored department; older automatic incidents may
have no department. Filters do not infer or rewrite historical department data.
Unknown keys, repeated values and invalid ranges are rejected.

Every mutation requires the exact `expectedUpdatedAt` from the latest detail or
mutation response. Bodies use application/json with these additional fields:

* Assignment: `assigneeId` (eligible administrator UUID or null).
* Status: `status` (an allowed next status).
* Note: `body` (1–4000 characters after nonempty validation), explicit `visibility`
  (`SECURITY_TEAM` or `REPORTER`), `noticeVersion` from detail's `noteNotice`, and
  `acknowledged: true`. The future UI must display that notice before submission
  and require an unchecked acknowledgement. The API does not infer acknowledgement.

Notes are plain text. The future UI must render them as escaped text, never HTML.
The acknowledgement is recorded in the transactional audit metadata with actor,
notice version, context and timestamp. Note bodies are stored only in comments,
never copied to operational logs, audits, event JSON, AI or analytics.

## Lifecycle and consistency

* NEW → UNDER_INVESTIGATION or FALSE_POSITIVE.
* UNDER_INVESTIGATION → CONTAINED, RESOLVED or FALSE_POSITIVE.
* CONTAINED → UNDER_INVESTIGATION or RESOLVED.
* RESOLVED / FALSE_POSITIVE → UNDER_INVESTIGATION or CLOSED.
* CLOSED → UNDER_INVESTIGATION (explicit reopening).

Resolution/false-positive status records resolvedAt; closure records closedAt.
Reopening clears both. History preserves earlier transitions. Reassigning to the
same assignee is a no-op; status no-ops are rejected. Stale edits return 409 and
must refresh before resubmission. A row lock serializes mutations across server
processes, with monotonically increasing updatedAt. Changes, status/assignment
events, notes and their audit metadata commit atomically; audit failure rolls
everything back. Notes have their own timestamped history through `/notes` and
an `INCIDENT_NOTE_ADDED` audit entry, without misusing an unrelated event type.

## Security and minimization

Authentication reads current role/account state and validates administrator MFA
proof against the current enrollment. Existing trusted-origin/Fetch Metadata
protection applies to reads and writes. Each router limits authenticated users to
180 requests/minute and administrator mutations to 60/minute. These are existing
in-process limiter stores; multi-instance deployment needs a shared rate-limit
store. Bodies are limited to 20 KiB after authentication; compressed mutation
bodies are rejected. All responses have Cache-Control: no-store.

Employee detail exposes only operational summary fields. It excludes reporter and
assignee identity, internal descriptions, evidence, source payloads, AI summaries,
internal resolution text and audit records. Employee history contains creation and
status events only; `/notes` includes only explicit REPORTER comments, with no
author identity. SECURITY_TEAM notes and redacted comments are excluded in the
database query, not hidden in the browser.

Administrator summaries select only necessary names, department and operational
fields. Detail adds description and risk rule version. No endpoint joins chat,
raw analysis content, files, passwords, MFA secrets, or arbitrary JSON snapshots.
History projects allowed status/assignment metadata instead of returning raw JSON.
Administrator detail and note reads are audited; mutations record actor, resource
and bounded metadata. Audits use the existing 90-day development review deadline,
not an approved organizational deletion policy. No purge is introduced.

No API allows employee mutations, arbitrary severity changes, ownership changes,
incident deletion, or AI-driven management. Automatic evidence snapshots remain
stored for future narrowly scoped evidence views; these APIs do not expose them.

## Verification and remaining work

`node --test backend/tests/incident-management.integration.test.js` uses real local
PostgreSQL and loopback HTTP with synthetic users and incidents. It covers MFA,
RBAC, ownership/IDOR, origin checks, filtering/pagination, mass assignment, status
policy, concurrent stale writes, note visibility, acknowledgement, rate limiting,
and rollback. Cleanup removes only records belonging to the test fixtures.

## Phase 10B2 — Incident interfaces

The employee `/incidents` and `/incidents/:id` routes now retrieve owned incidents,
status timelines and employee-visible updates. The administrator
`/admin/incidents` and `/admin/incidents/:id` routes provide a queue, assignment,
supported status transitions, internal notes and explicit shared updates.
Administrator navigation and the verified workspace link to the queue. The home
page links to operational incident tracking.

The interfaces reuse the existing session transport, route guards, design-system
controls and dialog. Lists have full-reference search, severity/status/category
and UTC date filters; administrators also have assignment filtering. All lists,
history and notes are paginated. Assignee selection supports further result pages.
Desktop tables switch to cards on smaller screens. Loading, empty, error, retry
and manual refresh states are explicit. No live notifications are introduced.

Server pagination remains newest-first. Optional severity/update sorting is
explicitly limited to the current page. Source is displayed but cannot be filtered
by the current API. No unsupported filter or sort parameter is sent.

Mutations use the displayed `updatedAt`, confirm the proposed action, then refresh
the incident and its history/notes. A 409 refreshes without replaying the mutation.
Ambiguous write failures require refresh before another submission. Note audience
defaults to SECURITY_TEAM; sharing requires selecting REPORTER, acknowledging the
backend notice and confirming the complete update text. Changing text or audience
clears acknowledgement. Drafts are cleared when the detail is refreshed, including
conflict recovery; they are never persisted in browser storage.

Requests are aborted on unmount; generation checks ignore late responses. Views
are keyed to user, role and incident so account/navigation changes cannot retain
another view's record. Authorization failures clear loaded content. Note content
is rendered as React text, with explicit defensive filtering for private/redacted
employee notes. The server remains the ownership, visibility and MFA authority.

### Contract limitations

Confidence, evidence snapshots, risk reasons and recommended actions are **not
exposed by Phase 10B1**. These views show recorded risk score/severity and explicitly
state that additional assessment details are unavailable. They do not infer,
fabricate, fetch raw source content, or expand existing access controls. Completing
those originally requested detail fields requires a separately scoped, authorized
backend projection enhancement. No backend files or migrations changed in 10B2.

### Phase 10B2 validation

On 2026-10-10, `node --test --test-concurrency=1 frontend/tests/*.mjs` passed
139 checks, including 29 incident workflow/rendering checks. `npm test` passed 390
backend checks, including automatic escalation and incident management regressions.
Lint, production build, backend syntax checks and Prisma validation passed;
`npm audit --audit-level=low` reported zero vulnerabilities. Tests use synthetic
fixtures; no OpenAI or VirusTotal credits were used. Browser interaction, visual
and console verification could not run because the computer-use session exposed
no browser and opening the in-app browser returned unavailable. The existing
production bundle-size warning remains. Phase 10C has not started.
