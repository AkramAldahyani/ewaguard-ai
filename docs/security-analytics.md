# Security analytics — Phase 13B1 API

`GET /api/admin/analytics/security` provides database-backed incident aggregates for the Phase 13B2 interface. It requires an authenticated `IT_SECURITY_ADMIN` cookie session with verified MFA and a trusted browser origin. Responses are `private, no-store` and rate limited per administrator. No employee identifier or client-provided metric is accepted.

## Period selection

- `period=7d`, `30d` (default), or `90d`: complete UTC calendar days including the current UTC day.
- `period=custom&start=YYYY-MM-DD&end=YYYY-MM-DD`: inclusive UTC calendar dates.
- Date strings must be real canonical dates. Custom ranges are limited to 1–90 days. Unknown parameters, mixed preset/custom inputs, and incomplete ranges return HTTP 400.
- The database uses a half-open interval: `createdAt >= start 00:00 UTC` and `createdAt < day after end 00:00 UTC`. `range` echoes the selected UTC dates and day count.

## Metric definitions

All metrics include **incidents created in the selected period**. Severity, status, category, detection source, and assignment describe each matching incident's **current stored values**, not a snapshot of its state during that period.

| Field | Definition |
| --- | --- |
| `metrics.created` | Matching incident count |
| `metrics.high`, `critical` | Matching incidents whose current severity is HIGH or CRITICAL |
| `metrics.openCurrent` | Current status NEW, UNDER_INVESTIGATION, or CONTAINED |
| `metrics.resolvedCurrent`, `closedCurrent`, `falsePositiveCurrent` | Separate current terminal statuses; false positives are not called resolved |
| `metrics.assignedCurrent`, `unassignedCurrent` | Whether `assigneeId` is currently present |
| `metrics.resolution.eligibleCount` | Matching incidents with `resolvedAt >= createdAt` that are RESOLVED, or CLOSED after being RESOLVED |
| `metrics.resolution.averageSeconds` | Mean `resolvedAt - createdAt` for eligible incidents; null if none |

`distributions` contains zero-filled `severity`, `currentStatus`, `category`, and `detectionSource` arrays using the schema's enum values. `dailyCreated` has one entry per selected UTC day, including zero days. `recentCreated` contains at most eight matching incidents, newest first, with reference, severity, current status/category/source, creation timestamp, and assigned boolean. No incident titles, descriptions, evidence, notes, reporter identities, AI conversations, or individual employee rankings are returned.

The resolution duration counts incidents that are currently `RESOLVED` and incidents that were `RESOLVED` and then `CLOSED`; closing keeps the recorded `resolvedAt`. `CLOSED` can also follow a false-positive decision, so the latest `STATUS_CHANGED` event into `CLOSED` decides: only a closure whose `fromStatus` is `RESOLVED` counts. A `CLOSED` record without that history is excluded rather than guessed. False positives never count. Reopening clears `resolvedAt`, so reopened cases count again only after a new resolution. No historical status trend or comparison period is inferred. Existing indexes on incident creation date and severity/source with creation date support the bounded period queries; no migration is needed.

Phase 13B2 will render the charts and controls. The existing administrator incident queue remains the investigation destination. Phase 13C awareness analytics is outside this API.
