# Incidents

## In short

An **incident** is a security case for the security team. EWAGuard AI creates one
**automatically** when an email, URL or file analysis ends at **HIGH** or
**CRITICAL**. Administrators then investigate it, assign it, add notes and move
it through a fixed set of statuses. Employees can follow their own incidents
under **My Incidents**.

```text
Analysis saved → final risk HIGH or CRITICAL → incident created (status NEW)
   → administrators notified → assigned → UNDER_INVESTIGATION
   → CONTAINED → RESOLVED → CLOSED   (or FALSE_POSITIVE)
```

## Automatic creation

The incident engine (`backend/src/incidents/incident-engine.js`) runs right after
an analysis is saved. It:

1. Reads the **saved** analysis from the database (never values from the browser or the AI) and checks it belongs to the employee.
2. Applies the escalation policy (`escalation-policy.js`, version 1.0):
   - LOW / MEDIUM → no incident (`state: NOT_REQUIRED`).
   - HIGH → HIGH incident.
   - CRITICAL → CRITICAL incident marked **urgent**.
3. Creates, in **one database transaction**: the incident, a frozen evidence snapshot, a `CREATED` timeline event, an `INCIDENT_CREATED` audit record and the administrator notifications. If any part fails, nothing is saved.

It does **not** rescan, visit URLs, call VirusTotal or call OpenAI. Hash-only file
checks never create incidents.

### One incident per analysis

Each incident has a `sourceKey` such as `EMAIL:<analysisId>`. A unique database
index plus a lock make sure retries can never create two incidents for the same
analysis. (Two separate submissions of the same email are two analyses and can
produce two incidents.)

### Reference numbers

Format: `INC-<year>-<number>`, for example `INC-2026-000123`. The number comes
from a database sequence shared by all server processes, so gaps are normal.

### Incident type

Chosen from the saved risk reasons, never from the email text or the AI:

| Type | When |
| --- | --- |
| `CREDENTIAL_COMPROMISE` | The employee confirmed they entered credentials |
| `MALWARE` | ClamAV detection, YARA match, or malicious/suspicious VirusTotal file votes |
| `PHISHING` | Credential/MFA/login requests, deceptive or credential-bearing links, sender impersonation or look-alikes, payment or approval-bypass pressure, attachment invitations; URL account terms, paths or brand impersonation |
| `SUSPICIOUS_ACTIVITY` | Anything else, for example reputation-only URL detections |

`DATA_EXPOSURE` and `OTHER` are never assigned automatically. The reporter's
department at creation time is stored for filtering and statistics. (Older
incidents created before this rule keep `SUSPICIOUS_ACTIVITY` and no department.)

### What the evidence snapshot contains

Source type, ID and time; final risk, model version, confidence and reason
codes; known indicator codes; coverage; scanner and provider statuses;
reputation counts; email authentication claims (marked unverified); for files
also SHA-256, size and type; and the "What should I do now?" guidance as it was
shown.

It **never** contains raw email bodies or headers, file bytes, filenames, full
URLs, raw provider responses, passwords or keys. The snapshot survives even after
the original analysis is deleted by retention.

### If creation fails

The analysis is still saved and the response says `state: PENDING` with a retry
path. Retrying never rescans:

```text
POST /api/analysis-escalations/:analyzerType/:analysisId/retry   (empty body, owner only)
```

## Reporting entered credentials

If an employee entered their work password on a phishing page, they can say so
on their own **email or URL** result ("I entered my credentials"):

```text
POST /api/analysis-escalations/:analyzerType/:analysisId/exposure
{ "exposure": "CREDENTIALS_SUBMITTED", "confirmed": true }
```

- The risk engine applies `CONFIRMED_CREDENTIAL_SUBMISSION`: the score becomes at least 75 and the level **CRITICAL**.
- No incident yet → a CRITICAL `CREDENTIAL_COMPROMISE` incident is created and administrators are alerted.
- Incident already exists → its severity is raised, a `SEVERITY_CHANGED` (or `EVIDENCE_ADDED`) event and an `INCIDENT_EXPOSURE_REPORTED` audit record are added, administrators get an `EXPOSURE_REPORTED` alert, and a resolved or closed incident goes back to `UNDER_INVESTIGATION`.
- Reporting again changes nothing.
- This must be the employee's own explicit action. The AI assistant can tell the employee to use this button but **cannot press it**.

## Investigation by administrators

### Statuses and allowed moves

| From | Allowed next statuses |
| --- | --- |
| NEW | UNDER_INVESTIGATION, FALSE_POSITIVE |
| UNDER_INVESTIGATION | CONTAINED, RESOLVED, FALSE_POSITIVE |
| CONTAINED | UNDER_INVESTIGATION, RESOLVED |
| RESOLVED | UNDER_INVESTIGATION, CLOSED |
| FALSE_POSITIVE | UNDER_INVESTIGATION, CLOSED |
| CLOSED | UNDER_INVESTIGATION (reopen) |

- RESOLVED and FALSE_POSITIVE record `resolvedAt`; CLOSED records `closedAt`. Reopening clears both. History keeps every step.
- Starting the investigation on an **unassigned** incident automatically assigns the administrator who started it.
- Every change must include `expectedUpdatedAt`. If someone else changed the incident first, the API returns **409** and the page reloads instead of overwriting.
- Status, assignment, notes, timeline events, notifications and audit records are saved together; if the audit write fails, everything is rolled back.

### Notes

- **SECURITY_TEAM** notes are private to administrators.
- **REPORTER** notes are shared with the employee. Before sharing, the administrator must read a notice and actively tick an acknowledgement.
- Notes are plain text (1–4,000 characters), shown as escaped text, and never copied into logs, audit records, AI prompts or analytics.

### The triage queue

- Views: open, closed, all, plus (for administrators) unassigned and "assigned to me".
- `sort=priority` orders by severity, then lifecycle stage, then longest waiting. Other sorts: newest, oldest, recently updated, severity.
- Filters: status, severity, type, source, exact reference, date range; administrators also reporter, department and assignee. Administrators can search by reference, title or employee name.
- Each list includes a total; a separate summary endpoint returns counts per status and severity.
- Severity colors (critical red, high orange, medium blue, low green) always come with a text label and icon.

## What each role sees

| Information | Employee (own incidents only) | Administrator |
| --- | --- | --- |
| Reference, severity, status, type, dates | Yes | Yes |
| Risk confidence, reasons, coverage, saved guidance | Yes | Yes |
| File hash and reputation counts | No | Yes |
| Description, assignee and reporter identity | No | Yes |
| Timeline | Creation and status changes | Everything |
| Notes | Only REPORTER notes, without author | All notes |

Employees asking for someone else's incident get the same 404 as for a missing one.
Older incidents that did not save their guidance show "guidance not saved"; it is
never regenerated after the fact.

## API

| Method | Path (under `/api/incidents` for employees, `/api/admin/incidents` for administrators) | Purpose |
| --- | --- | --- |
| GET | `/` | List with filters and pages |
| GET | `/summary` | Counts |
| GET | `/:id` | Details (administrators also get allowed next statuses) |
| GET | `/:id/history` | Timeline |
| GET | `/:id/notes` | Notes the caller may see |
| GET | `/assignees` | Eligible administrators (admin only) |
| POST | `/:id/assignment` | Assign or unassign (admin only) |
| POST | `/:id/status` | Change status (admin only) |
| POST | `/:id/notes` | Add a note (admin only) |

Limits: 180 requests per minute per user and 60 administrator changes per minute.
Request bodies up to 20 KiB. All responses are `no-store`. Administrator views of
details and notes are audited (`INCIDENT_VIEWED`, `INCIDENT_NOTES_VIEWED`).

## Retention

Each incident gets a `retentionUntil` **review date** 90 days ahead. This is a
reminder to review, not an automatic deletion. Incidents are never deleted
automatically. See [privacy and retention](privacy-and-retention.md).

## Code and tests

- Backend: `backend/src/incidents/`, `backend/src/routes/incidents.js`, `backend/src/routes/analysis-escalations.js`
- Frontend: `frontend/src/features/incidents/`
- Tests: `backend/tests/incident-engine.integration.test.js`, `incident-management.integration.test.js`, `incident-detail.test.js`, `exposure-report.integration.test.js`, `frontend/tests/incidents.test.mjs`, `incident-receipt.test.mjs`, `exposure-report-ui.test.mjs`
