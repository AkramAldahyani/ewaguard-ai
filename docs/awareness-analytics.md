# Phase 13C1 — Awareness analytics API

`GET /api/admin/analytics/awareness` is available to authenticated `IT_SECURITY_ADMIN` sessions with verified MFA. It uses the existing cookie, trusted-origin, and authorization middleware, a per-administrator limit of 30 requests per minute, and `Cache-Control: private, no-store`. It returns aggregates only; it does not return employee identities, attempts, answers, or certificate files.

## Filters and time contract

| Parameter | Values | Scope |
| --- | --- | --- |
| `period` | `30d`, `90d` (default), `365d`, `custom` | All sections |
| `start`, `end` | Required `YYYY-MM-DD` only with `period=custom` | Inclusive UTC calendar days; maximum 366 days |
| `programId` | Training program UUID | Training, course quizzes, certificates |
| `departmentId` | Department UUID | All sections; requires at least five currently active employees |
| `completionStatus` | `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED` | Training assignment cohort only |
| `monthlyPeriod` | `YYYY-MM`, with first day inside selected date range | Monthly quiz section only |

Unknown parameters, malformed dates, unsupported combinations, and oversized ranges return `400`. The response includes `range.start`, inclusive `range.end`, `range.timezone: "UTC"`, and each filter's scope. Preset ranges include today and the preceding calendar days. Monthly quiz periods are selected by the quiz's stored month, while training assignments, course quiz attempts, completions, and certificate issues each use their own dates.

## Metric definitions

| Response | Definition |
| --- | --- |
| `training.assignedPrograms` | Distinct programs in the nonrevoked employee assignment cohort created in the range. |
| `training.assignments` / `assignedEmployees` | Assignment rows / distinct assigned employees in that cohort. A person assigned two programs contributes two assignments and one employee. |
| `training.completed`, `inProgress`, `notStarted` | **Current** progress status for cohort assignments. A missing progress row is `NOT_STARTED`. These are not historical status snapshots. |
| `training.completionRatePercent` | Current completed assignments ÷ cohort assignments × 100; `null` for an empty cohort. |
| `training.completedDuring` | Nonrevoked employee assignments with progress status `COMPLETED` and `completedAt` in the selected date range, regardless of assignment date. This count is separate from the assignment cohort. |
| `courseQuizzes.submittedAttempts` / `uniqueParticipants` | Scored submitted course attempts in the range / distinct employees making those attempts. Retries count as attempts, not extra participants. |
| `courseQuizzes.passRatePercent`, `failRatePercent` | Passed or failed submitted attempts ÷ submitted scored attempts × 100. |
| `courseQuizzes.averageScorePercent` | Arithmetic mean of submitted attempt percentages; not an average of pass rates. |
| `monthlyQuizzes.assignedAssignments` / `submittedAssignments` | Monthly quiz assignment rows for months in range / those with a scored submitted attempt. Assignment is not participation. |
| `monthlyQuizzes.trend[].averageScorePercent` | Arithmetic mean of each assigned employee's highest submitted score for that month. Score ties select the earliest submitted attempt. |
| `monthlyQuizzes.averageBestScorePercent` | Weighted average over all representative employee-month scores, rather than an unweighted mean of month averages. |
| `monthlyQuizzes.trend[].averageChangePoints` | Difference between organization/group monthly mean and the previous **recorded scored** month's mean. It describes aggregate change, not individual improvement. |
| `certificates.totalIssued` / `issuedDuring` | Nonrevoked issued certificates all-time / those issued in the selected date range. |

Rates and score means are rounded to two decimals. Empty denominators yield `null`, not zero. Program breakdowns contain at most 20 rows and have a `programsTruncated` flag. Monthly trends cover at most 13 stored months. The response includes `generatedAt` and a bounded `filterOptions.departments` list.

## Department privacy and limitations

Department membership uses the employee's **current** `User.departmentId`. The optional department fields on historical assignment rows are not populated by the existing workflows, so the API cannot reconstruct historical department membership. Users with no department are omitted from department comparisons. A requested department must have at least five currently active employees. Department filter choices expose only department ID and name for eligible groups. Comparative department rows are suppressed if any current employee group has fewer than five members, including the unassigned group, or if more than 100 department records would be needed. Within otherwise eligible comparison rows, training metrics require at least five assignments; monthly participation metrics require at least five assignments, and monthly score means require at least five submitted representative scores. These are privacy thresholds, not statistical significance claims.

Historical attempt scores are read without changing source records. Course attempt history can include attempts from assignments later revoked. Monthly quiz counts include existing assignment rows, including subsequently revoked assignments; submitted history remains recorded. The selected date range chooses monthly **quiz periods**, not the timestamp of each monthly submission. Month averages represent assigned participants with scored submissions and do not imply that all employees improved. Program titles are current labels, not historical title snapshots. This API intentionally excludes individual rankings and department drill-down to individual people.

Phase 13C2 will consume this API for the administrator charts and navigation. No frontend awareness analytics page is included in 13C1.
