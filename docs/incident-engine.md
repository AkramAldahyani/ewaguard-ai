# Phase 10A — automatic incident creation

Security tools detect; the final Risk Engine evaluates; Incident Assistance guides;
the Incident Engine records and escalates; AI explains and coordinates.

`incidents/incident-engine.js` reads the completed EMAIL, URL or FILE analysis from
PostgreSQL. It checks the authenticated source owner, finalized risk tuple and
stored risk projection. Caller/frontend/model risk fields are never used. No
scanner, URL visit, reputation lookup or OpenAI request occurs during escalation.
The existing allow-listed tool evidence projection is reused for risk validation
and safe codes/statuses, without executing any AI tool.

## Policy and snapshots

`escalation-policy.js`, version **1.0**, centralizes eligible levels, urgent level,
initial status and the development retention-review deadline. LOW/MEDIUM do not
automatically escalate. HIGH creates HIGH; CRITICAL creates CRITICAL and records
`urgent: true`. Current risk model 1.0 boundaries are HIGH 50–74 and CRITICAL 75–100;
the risk engine also requires corroboration for CRITICAL. The incident engine uses
the stored final level, never the analyzer's provisional finding or new scoring.

Every incident requires human review. LIMITED_CONFIDENCE remains eligible and is
explicitly recorded. Reason codes, risk model version, policy version, coverage
gaps and conflicting evidence are preserved. Severity does not establish maliciousness.
Unknown historical model versions or inconsistent/missing risk metadata fail
explicitly; recover using a supported versioned projection, never silently rescore
history. Existing recorded incidents return their original snapshot unchanged.

## Persistence, references and ownership

The existing Incident, IncidentEvidence and IncidentEvent models are reused. The
additive migration adds nullable unique `sourceKey` and `escalationMetadata` only.
Existing rows, enums and the pgvector HNSW index are unchanged.

`sourceKey = analyzerType + ':' + analysisId` identifies one automatic incident.
A parameterized per-source PostgreSQL advisory transaction lock serializes retries;
the unique index enforces idempotency in the database. Equal hashes/domains from
different analyses are not deduplicated. A second new submission is a new analysis;
retry incident recording by source ID instead of submitting content again.

References are `INC-<UTC creation year>-<database sequence number padded to 6>`.
The existing globally unique PostgreSQL sequence supplies numbers across processes;
gaps on rollback are normal. There is no in-memory/year-reset counter.

Incident, evidence and initial history commit in one Prisma transaction. Failure at
any point rolls them all back. Analysis persistence completes first, so recovery
does not scan again. AI approval analysis and its consumption receipt still commit
together, followed by the same engine. Reopening a completed approval also retries
recording, even if its earlier response was lost.

Reporter identity comes from the owned source analysis. The initial event uses
existing type `CREATED`, null actor, and `source: AUTOMATED_RISK_ENGINE`. Its details
contain `event: INCIDENT_CREATED`, reference, severity, status, UTC creation time,
urgency and policy version. This is a persisted audit/history record for future
Phase 10C delivery; no notification is dispatched or delivery claimed.

Initial status is **NEW**. The intended future lifecycle is NEW →
UNDER_INVESTIGATION → CONTAINED → RESOLVED → CLOSED, with FALSE_POSITIVE where
appropriate. Status changes, assignments, severity review and dashboards are Phase
10B work and are not exposed here.

## Evidence minimization

Snapshots contain source ID/type/time, final risk/version/confidence/reason codes,
allow-listed indicator codes, coverage, scanner statuses, normalized reputation
counts and email authentication claims (explicitly unverified). File snapshots also
include SHA-256, size and an allow-listed normalized type. Missing evidence stays
unavailable. Free-form detection/rule strings and hostnames are deliberately omitted
to avoid copying secret-bearing provider data or hostnames. No raw body/headers,
file bytes, original filenames, URL strings/queries, provider responses, passwords,
keys or MFA values are copied. No confidential evidence is sent externally.

## Response and recovery

Successful analyzer responses retain their existing fields and add `incident`:

* Recorded: `{created, state: 'RECORDED', reference, severity, status, urgent, createdAt}`.
  `created: false` with RECORDED means the existing incident was returned.
* LOW/MEDIUM: `{created: false, state: 'NOT_REQUIRED', reason: 'AUTOMATIC_ESCALATION_NOT_REQUIRED'}`.
* Failed escalation: HTTP 202 with the completed analysis and
  `{created: false, state: 'PENDING', reason: 'ESCALATION_PENDING', retryable: true, retryPath}`.
  No fabricated reference is returned. Approval responses expose the same state.

`POST /api/analysis-escalations/:analyzerType/:analysisId/retry` accepts an empty
body only. It requires the existing authenticated EMPLOYEE role, trusted Origin,
ownership and rate limiting. It reads existing results only. Missing/foreign sources
return 404, invalid identities/types/input 400, missing/unsupported finalized risk
409, and transient persistence failure 503 with generic errors. No admin mutation
or incident-creation AI tool exists. Small result notices show the receipt/pending
state and a retry action; no incident portal is implemented.

If a process stops between analysis commit and escalation, the completed source is
the durable recovery input. A backend operator can call the same service with that
source's stored owner; approval receipt retrieval and the authenticated retry route
also recover it. Do not rerun scanning. There is no background historical backfill
or scheduler in this phase. Before future analysis purging, reconcile outstanding
HIGH/CRITICAL sources so a pending escalation is not discarded.

## Retention and future integration

`reviewAfterDays: 90` is a conservative development review deadline stored in the
existing `retentionUntil`, not an official EWA retention/deletion period. Production
policy, review/deletion authority, holds and retention periods require organizational
approval. No automatic incident deletion job is enabled. Future deletion must
honor legal holds, review evidence necessity, audit the authorized action and
explicitly handle dependent history/evidence. Do not cascade from source cleanup.

Existing source FKs use SET NULL: source deletion preserves minimized evidence and
the source key/ID snapshot. Expired but still-stored completed sources can be
recovered without scanning. If a source is already removed and no incident exists,
404 is explicit; absent evidence is never reconstructed or invented.

No OpenAI authority, Socket.IO, real email, external administrator contact, RAG,
Phase 10B dashboard, Phase 10C delivery or later-phase functionality is added.

## Validation

Run `node --test backend/tests/incident-engine.integration.test.js` for synthetic
PostgreSQL and loopback HTTP tests: severity rules, all analyzers, concurrent
deduplication/reference generation, attribution, cross-owner rejection, malformed
and historical risk, expiry/deletion, transaction rollback, privacy, HTTP retry,
approved analysis, no model usage/notifications and logout. Disposable fixture
cleanup deletes only incidents and sources belonging to users created by that run.

Validation on 2026-10-09: `npm test` passed 381 backend checks. The combined
frontend/database/pgvector command passed 142 checks; the subsequently added
incident receipt test also passed. The final incident/receipt targeted run passed
11 checks. Lint, frontend build, backend checks, Prisma format/validate/generate,
additive migration deployment/status and `git diff --check` passed. `npm audit`
reported zero vulnerabilities. The existing frontend bundle-size warning remains.
Live tests used loopback HTTP, real PostgreSQL and synthetic analyzer/provider
fixtures; no live malware, paid OpenAI calls or administrator notifications were used.
Browser interaction/visual verification was not performed.
