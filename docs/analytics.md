# Analytics

## In short

Administrators (with MFA) have three statistics pages. All of them show
**totals and averages only**: no rankings of individual employees, no chat
content and no raw submissions.

| Page | Address | Shows |
| --- | --- | --- |
| Security analytics | `/admin/analytics/security` | Email, URL, file and SHA-256 checks: counts by level, by type, per day, and recent analyses |
| Incident statistics | `/admin/analytics/incidents` | Incidents by severity, status, category and source; resolution time |
| Awareness analytics | `/admin/analytics/awareness` | Training completion, quiz results, monthly quiz participation and trends, certificates |

The overview on the main dashboard is described in [portals and dashboard](portals-and-dashboard.md).

## Choosing a time period

| Option | Meaning |
| --- | --- |
| `7d`, `30d`, `90d` (security) / `30d`, `90d`, `365d` (awareness) | Complete UTC days up to and including today |
| `custom` with `start` and `end` (`YYYY-MM-DD`) | Inclusive UTC dates; up to 90 days for security, 366 for awareness |

Unknown or mixed parameters are rejected with 400. The response repeats the
chosen dates and time zone (UTC).

## Security analytics and incident statistics

Endpoint: `GET /api/admin/analytics/security` (and `/analyses` for the recent list).

**Analyses** (from `email_analyses`, `url_analyses`, `file_analyses`):

- Counts by final level (LOW–CRITICAL) for completed analyses, plus stored errors and unclassified records counted separately.
- Breakdown by type: Email, URL, File and **SHA-256 check**.
- Daily activity and the 20 most recent analyses (with links to their incidents).
- LOW/MEDIUM analyses are kept 30 days by default, so a 90-day chart can be incomplete.

**Incidents** created in the chosen period:

| Metric | Meaning |
| --- | --- |
| Created | Incidents created in the period |
| High / critical | Those whose **current** severity is HIGH or CRITICAL |
| Open now | Current status NEW, UNDER_INVESTIGATION or CONTAINED |
| Resolved / closed / false positive | Current final statuses, counted separately (false positives are not "resolved") |
| Assigned / unassigned | Whether someone is assigned now |
| Average resolution time | From creation to resolution, for incidents that are RESOLVED, or CLOSED after being RESOLVED |

Plus distributions by severity, status, category and detection source, a daily
chart with zero days included, and the eight newest incidents (reference,
severity, status, category, source, date, assigned yes/no). Values describe the
incidents' **current** state, not a historical snapshot.

## Awareness analytics

Endpoint: `GET /api/admin/analytics/awareness` (30 requests per minute).

Optional filters: training program, department, completion status (training
only) and a specific monthly quiz period.

| Metric | Meaning |
| --- | --- |
| Assignments / assigned employees | Assignments created in the period / distinct people (one person with two courses = two assignments, one employee) |
| Completed, in progress, not started | **Current** progress of those assignments |
| Completion rate | Completed ÷ assignments × 100 (empty → "no data", not 0) |
| Completed during period | Completions dated in the period, whenever assigned |
| Course quiz attempts / participants | Submitted attempts / distinct people (retries are extra attempts, not extra people) |
| Pass and fail rate | Passed or failed attempts ÷ all submitted attempts |
| Average quiz score | Mean of submitted attempt percentages |
| Monthly expected / submitted | Employees expected to take each monthly quiz (account existed before it closed and was active when it opened, including people who never started) / those who submitted |
| Monthly average best score | Average of each person's best score per month |
| Monthly change | Difference from the previous recorded month's average: describes the group, not individual improvement |
| Certificates | Total issued (not revoked) / issued in the period |

Rates and averages are rounded to two decimals. Program lists show at most 20
rows; monthly trends at most 13 months.

### Department privacy

- Departments use each employee's **current** department.
- A department filter is allowed only for departments with **at least five active employees**.
- Department comparison rows are hidden if any group (including "no department") has fewer than five people, and individual numbers need at least five assignments or scores.
- These thresholds protect privacy; they are not statistical significance. They also do not fully prevent working things out from repeated, narrowly filtered queries.
- There is no drill-down to individual people. The goal is awareness, not employee surveillance or performance scoring.

## Code and tests

- Backend: `backend/src/analytics/`, `backend/src/routes/security-analytics.js`, `awareness-analytics.js`
- Frontend: `frontend/src/features/analytics/`
- Tests: `backend/tests/security-analytics.integration.test.js`, `awareness-analytics.integration.test.js`, `analysis-recording.integration.test.js`, `frontend/tests/security-analytics-ui.test.mjs`, `awareness-analytics-ui.test.mjs`
