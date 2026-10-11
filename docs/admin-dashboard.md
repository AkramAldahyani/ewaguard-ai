# Administrator dashboard — Phase 13A1 API

`GET /api/admin/dashboard` provides a bounded operational overview for Phase 13A2. It accepts no query parameters. The endpoint requires an active administrator cookie session with verified MFA and a trusted origin, applies a per-user rate limit, and returns `Cache-Control: private, no-store`. Its response includes `generatedAt` (UTC ISO timestamp), `metrics`, at most six recent incidents, at most five pending community posts, and at most five recent notifications scoped to the authenticated administrator. The notification unread count and items use the existing notification service, so its audience, recipient, incident, and expiry rules continue to apply.

Metric definitions:

| Field | Definition |
| --- | --- |
| `employees.active` | Active, non-deactivated employees |
| `incidents.total` | All retained incidents |
| `incidents.open` | Incidents in `NEW`, `UNDER_INVESTIGATION`, or `CONTAINED` |
| `incidents.highOpen`, `criticalOpen` | Open incidents of each severity |
| `incidents.awaitingAssignment` | Open incidents with no assigned administrator |
| `awareness.publishedPrograms` | Programs currently `PUBLISHED` |
| `awareness.assignedEmployees` | Distinct active employees with a non-revoked assignment to a published program |
| `awareness.activeAssignments` | Non-revoked assignments to published programs held by active employees |
| `awareness.completedAssignments`, `inProgressAssignments` | Those active assignments with matching saved progress status |
| `awareness.publishedMonthlyQuizzes` | Monthly quizzes whose quiz lifecycle is `PUBLISHED` |
| `awareness.monthlyParticipations` | Non-revoked active-employee assignments to published or archived monthly quizzes; each employee-month counts once |
| `awareness.monthlySubmitted` | Those monthly assignments with at least one submitted attempt |
| `awareness.certificatesIssued` | Certificates without a revocation timestamp |
| `community.pendingPosts` | Posts currently `PENDING_REVIEW` |

Previews select only routing and overview fields. Incident previews include ID, reference, severity, status, creation date, assignee display name, and an urgent indicator. Pending community previews include ID, title, category, submission date, and author display name. The API excludes incident descriptions/evidence, post bodies, employee emails, notification stored message text, AI conversations, and internal moderation reasons. Counts are queried in the database; no full datasets are sent for browser-side aggregation. The overview is current at request time, without trend claims or historical snapshot semantics.

Phase 13A2 will replace the administrator workspace placeholder with the dashboard interface. Detailed security and awareness analytics remain outside Phase 13A.
