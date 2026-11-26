# Portals and administrator dashboard

## In short

After sign-in, people see one of two portals depending on their role. Both use
the same application shell (sidebar, header, notification bell) and real data
from the backend.

## Employee portal

| Page | Address | What it is for |
| --- | --- | --- |
| Home | `/` | Quick links to every tool, plus rotating security tips |
| Ask EWAGuard AI | `/assistant` | The AI chat assistant ([guide](ai-assistant.md)) |
| Analyze Email | `/analyze/email` | Check a suspicious email ([guide](email-analyzer.md)) |
| Analyze URL | `/analyze/url` | Check a suspicious link ([guide](url-analyzer.md)) |
| Analyze File | `/analyze/file` | Check a file or a SHA-256 hash ([guide](file-analyzer.md)) |
| Password Security | `/password-security` | Check or generate passwords locally ([guide](password-security.md)) |
| My Incidents | `/incidents` | Follow incidents created from my own analyses ([guide](incidents.md)) |
| My Training | `/training` | Assigned courses and course quizzes ([guide](training-and-quizzes.md)) |
| Monthly Quiz | `/monthly-quiz` | This month's quiz and my monthly history |
| Certificates | `/certificates` | Certificates I have earned |
| Security Community | `/community` | Approved posts, my submissions, saved posts ([guide](community.md)) |
| Profile | `/profile` | My name, email, employee ID, department and role |

The profile shows only safe fields. It never shows internal secrets, password or MFA data.

## Administrator portal

| Group | Pages |
| --- | --- |
| Overview | Administrator dashboard (`/admin`) |
| Security operations | Incident Queue, Security analytics, Incident Statistics, Audit Logs |
| Awareness | Training programs, Monthly quizzes, Certificates, Awareness analytics |
| Community | Community moderation |
| Administration | Users, Profile |

Administrators cannot open employee-only pages, and employees cannot open
`/admin` pages. These frontend guards only improve the experience: the backend
blocks the same actions with 401/403 responses regardless of what the browser shows.

## Administrator dashboard

`GET /api/admin/dashboard` returns a quick, current overview. It needs an active
administrator session with MFA, accepts no parameters and is never cached.

| Metric | Meaning |
| --- | --- |
| Active employees | Employee accounts that are active |
| Incidents: total / open | All incidents / those in NEW, UNDER_INVESTIGATION or CONTAINED |
| High open / critical open | Open incidents at each severity |
| Awaiting assignment | Open incidents with no administrator assigned |
| Published programs | Courses currently published |
| Assigned employees / active assignments | People and assignments for published courses |
| Completed / in progress | Those assignments by their saved progress |
| Published monthly quizzes | Monthly quizzes that are published |
| Monthly participations / submitted | Employees expected to take each opened monthly quiz, and how many submitted (people who never started still count as expected) |
| Certificates issued | Certificates that are not revoked |
| Pending posts | Community posts waiting for review |

It also shows up to six recent incidents, five posts awaiting review and five of
the administrator's own notifications. These previews contain only what is
needed to navigate (reference, severity, status, title, author name). They never
include incident descriptions, evidence, post bodies, emails or chat content.
Counts are calculated in the database at request time; there are no trend claims.

## Accessibility and layout

- Labeled form fields, visible keyboard focus, a skip link and native dialogs that trap focus and close with Escape.
- On every route change the page title updates, the page scrolls to the top and focus moves to the main region.
- Tables become cards on smaller screens; long values wrap.
- Severity is always shown with **text and an icon**, never by color alone.
- Reduced-motion preferences are respected.

## Code and tests

- Shell and navigation: `frontend/src/layouts/AppShell.jsx`
- Routes: `frontend/src/App.jsx`
- Dashboard: `backend/src/dashboard/`, `frontend/src/features/dashboard/`
- Tests: `npm run test:portal` (renders every route with test sessions), `frontend/tests/admin-dashboard-ui.test.mjs`, `backend/tests/dashboard.integration.test.js`
