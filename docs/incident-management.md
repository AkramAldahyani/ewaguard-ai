# Phase 10B1 — Incident management backend

Phase 10C1 now adds transactional notifications and authenticated Socket.IO
invalidation signals. See [the notification backend contract](realtime-notifications.md).
The phase-specific descriptions below retain their historical scope.

Phase 10B is split into the backend (10B1) and responsive interfaces with frontend
interaction tests (10B2). This phase adds no notification delivery, Socket.IO,
new AI tools, severity overrides, or later-phase work. Phase 10A automatic incident
creation, original risk values, source snapshots and receipts remain unchanged.
Existing incident, comment, event and audit models suffice. Phase 10B3 adds only
query indexes; it adds no columns and does not change existing migrations.

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

Incident filters: `status`, `severity`, `type`, `source`, exact `reference` (for example
`INC-2026-000123`), and inclusive `createdFrom`/`createdTo` timestamps in canonical
UTC format `YYYY-MM-DDTHH:mm:ss.sssZ`. Administrators can additionally filter by
`reporterId`, `departmentId`, and `assigneeId` (UUID or `unassigned`). Department
filtering uses the incident's stored department; older automatic incidents may
have no department. Filters do not infer or rewrite historical department data.
Unknown keys, repeated values and invalid ranges are rejected. `source` accepts
EMAIL_ANALYSIS, URL_ANALYSIS, FILE_ANALYSIS, INCIDENT_ASSISTANCE or MANUAL_REPORT.
`sort` accepts created_desc (default), created_asc, updated_desc or severity_desc.
Ordering applies in PostgreSQL before pagination, always with an ID tie-breaker.
Severity order is CRITICAL, HIGH, MEDIUM, LOW, using the existing PostgreSQL enum
order. Equal severities use newest creation time then ID. Offset pages can still
shift under concurrent insertions or updates; refreshing remains necessary.

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

Employee detail exposes operational summaries and the bounded Phase 10B3 assessment
projection described below. It excludes reporter and assignee identity, internal
descriptions, raw evidence, source payloads, AI summaries, file hashes, reputation
counts, internal resolution text and audit records. Employee history contains creation and
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
stored; these APIs project only specifically allowed fields, never the full JSON.

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

Phase 10B3 replaces the original page-only sorting with server-side sorting across
all matching incidents, and adds source filtering. Applying filters or sort starts
at page 1; pagination carries the selected query unchanged.

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

### Original 10B2 contract limitations (resolved in 10B3)

Phase 10B1 did not expose confidence, evidence summaries, risk reasons or guidance.
Phase 10B3 adds the authorized projection below. No backend files or migrations
changed during 10B2 itself.

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

## Phase 10B3 — Authorized historical assessment

Both detail endpoints add `incident.assessment`; existing summary fields and
management operations remain compatible. No new permission, route or AI tool is
introduced. Read operations never invoke the risk engine, Incident Assistance
builder, security scanners, external providers or source analysis endpoints.

### Authoritative records and availability

| Information | Authoritative stored record | Availability |
| --- | --- | --- |
| Severity and score | Incident scalar columns | Existing summary remains unchanged |
| Confidence and risk reasons | Original IncidentEvidence.snapshot.risk | Available for supported, consistent automatic snapshots |
| Risk policy version | Incident.riskRuleVersion, matched to snapshot version | Explicit version; unsupported snapshots fail closed |
| Escalation policy version | Incident.escalationMetadata.policyVersion | Available when saved |
| Normalized indicators, scanner/provider states, coverage, authentication claims | Original IncidentEvidence.snapshot | Allow-listed projection; claims remain unverified |
| File hash, size/type and normalized reputation counts | Original snapshot | Administrator only |
| Analysis ID/type/time | Snapshot bound to Incident.sourceKey and detectionSource | Survives removal of the source analysis |
| Incident Assistance | Snapshot.assistance for incidents created after 10B3 | Exact existing creation-time output is now retained |
| Historical Incident Assistance | Not persisted by earlier analyzers or Phase 10A snapshots | Explicit GUIDANCE_NOT_SAVED; never regenerated or backfilled |

URL/file source evidence contains full risk output and email evidence contains the
minimized risk snapshot. Earlier analyzer flows built Incident Assistance for the
response only, after constructing the stored evidence. Phase 10A's tool-result
projection also produced assistance but omitted it from the incident snapshot.
The generic Incident.recommendedActions field is not populated by automatic
creation. It is not treated as authoritative versioned assistance. No raw source
records need to be joined to complete the incident detail view.

The engine now retains its already-produced `safe.assistance` in the same atomic
snapshot used for new automatic incidents. This changes neither the escalation
decision nor its risk policy. Existing incidents return their original snapshots
unchanged, including recovery/retry. No historical scan or guidance backfill runs.

### Projection contract

`assessment` includes `riskPolicyVersion`, `escalationPolicyVersion`, and four
sections with explicit status: `risk`, `source`, `evidence`, `guidance`.
Unavailable sections have a fixed reason code. The original automatic snapshot
must match the source key/type and stored risk tuple. Missing snapshots and
unsupported/inconsistent risk versions are not reinterpreted under a newer policy.

Risk reasons use stored codes with the version-supported risk dictionary's fixed
explanations; weights and scores are not recomputed. Unknown reason codes are
omitted and reasonsStatus becomes PARTIAL. Unknown confidence is UNAVAILABLE.
Only normalized, bounded evidence values can leave the service; free-form evidence
summaries, provider strings, file names, email bodies, credentials and URLs are not
copied. Later investigation evidence is not automatically made employee-visible.

Saved assistance must match the supported assistance/risk version and analyzer
and risk level. Its text is validated against the existing versioned guidance
vocabulary; arbitrary stored strings fail closed. Only recognized output fields
are returned. The read path never constructs replacement guidance for missing
history. Both roles see the employee-directed saved guidance; only administrators
receive file hash metadata and reputation counts. Internal notes still use their
separate visibility-controlled endpoints.

The frontend renders confidence, explanations, source reference/time, versions,
evidence coverage and normalized findings. Saved guidance reuses IncidentAssistance.
Unavailable historical sections explain why data is absent. Guidance is labeled
as saved assessment guidance; current security-team updates remain authoritative
for subsequent investigation instructions. Strings are rendered as escaped text.

### Query indexes and scope

Migration `20261010000100_incident_queue_indexes` creates four non-destructive
indexes: creation/ID, update/ID, severity/creation/ID, source/creation/ID. Existing
reporter, assignment, department and status indexes are preserved. Employee queries
always include reporter ownership; administrators use the existing single-
organization application scope. There is no tenant identifier in this schema and
this change does not introduce a multi-tenant authorization model. Page and input
limits remain unchanged. No arbitrary ordering expressions are accepted.

### Verification and manual browser QA

Automated full-suite validation: 403 backend checks and 141 frontend checks passed.
Coverage includes saved/missing/malformed guidance, role-specific projection,
sensitive sentinels, source removal, MFA/ownership, source filters and full-result
sorting across pages with stable ties. Phase 10A and existing management regressions
remain covered. Lint, build, syntax checks, Prisma format/validate, migration deploy
and migration status passed. Dependency audit reported zero vulnerabilities.

Browser inventory returned no apps or browsers, so no visual, console or browser
action verification is claimed. Manual QA before final UI sign-off:

1. At desktop and 390px mobile width, sign in as an employee; check navigation,
   owned list/detail, wrapping of source references, history and shared updates.
2. Compare a historical incident (guidance unavailable) with a new incident from
   an approved local synthetic fixture (saved guidance); do not run paid providers.
3. As an MFA-verified administrator, inspect evidence, assign an eligible admin,
   change status, and submit one private note and one explicitly shared update.
4. Confirm the employee sees only the shared update. In two admin tabs, submit
   competing edits and verify the stale tab refreshes without overwriting.
5. Test source/severity/date filters and each sort across pages; check mobile
   dialogs, keyboard focus, error/retry states and browser console/network errors.

Phase 10B is functionally implemented, including honest unavailable history states.
Browser visual sign-off remains pending. The existing bundle-size warning and
in-process rate-limit deployment limitation remain. Phase 10C has not started.
