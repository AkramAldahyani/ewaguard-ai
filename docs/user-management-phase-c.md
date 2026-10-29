# User Management Phase C: profiles and final validation

Implementation date: 2026-10-21.

Historical Phase C report: the onboarding limitation below is superseded for the
controlled prototype by [Phase D](user-management-phase-d.md). Real organizational
delivery remains a future integration.

## Individual administrator profile

Selecting a user from `/admin/users` opens a responsive profile side panel. The
panel uses `GET /api/admin/users/:id/profile` and displays only current database
records. It includes:

- account identity, department, role, lifecycle status, creation date, and last
  recorded login;
- credential, administrator MFA, and initial-setup state without secret material;
- total email, URL, and file analysis counts without analysis contents;
- incident totals and severity/status distributions, plus links to the five most
  recent incident records;
- active training assignments, completed assignments, completion percentage, and
  links to the five most recent training programs;
- assigned and participated monthly quizzes with an objective participation rate;
- issued, non-revoked certificate totals and links to recent certificate records;
- recent account/authentication audit events without audit metadata.

Unavailable relationships render zero values or explicit empty states. Existing
records are never replaced with sample or estimated data.

## Security and privacy boundary

The endpoint reuses the existing administrator authentication, role, MFA, trusted
origin, rate-limit, UUID validation, and `Cache-Control: no-store` middleware.
Employees, anonymous clients, and administrator sessions without verified MFA are
denied. Unknown and repeated query parameters are rejected.

The profile projection excludes password hashes, password values, session tokens,
setup-token digests and token values, MFA secrets/counters, audit metadata, chat
messages, analysis evidence, submitted URLs, file hashes/names/content, incident
descriptions/evidence, quiz answers, and training content. Audit events expose only
the action, outcome, time, resource type, safe actor identity, and actor kind.

## Account onboarding limitation

Creating an invited employee still generates an expiring, single-use setup token
on the backend. The User Management interface deliberately does not display or
persist that token. Automatic invitation delivery and an employee-facing password
setup page are not implemented.

Secure onboarding therefore still requires two reviewed additions:

1. An approved confidential invitation service that transfers the one-time token
   without placing it in logs, analytics, ordinary chat, or unprotected storage.
2. An employee-facing HTTPS setup page that accepts the token and an employee-
   chosen password, sends them directly to `POST /api/auth/setup`, handles expiry
   and single-use errors, and then directs the employee to normal sign-in.

The administrator UI labels invited accounts as setup pending and does not claim
that an invitation has been sent.

## Controlled validation

User Management suites are intentionally single-worker, time-bounded, and capped
at a 768 MB Node heap because an earlier diagnostic assertion caused a worker to
consume about 10.4 GB. Use:

```text
npm run test:users
npm run test:users:ui
```

The integration coverage exercises real PostgreSQL relationships for analyses,
incidents, training progress, monthly quiz participation, certificates, account
events, and retained user identities. It also verifies profile authorization and
that sensitive related content is absent from the response.

Validation completed on 2026-10-21:

| Check | Actual result |
| --- | --- |
| `npm run test:users` | 25 passed, 0 failed |
| `npm run test:users:ui` | 13 passed, 0 failed, including rendered real PostgreSQL/Express lifecycle |
| Authentication, MFA, and auth-audit regression group | 39 passed, 0 failed |
| Incident-management integration | 11 passed, 0 failed |
| Training, monthly-quiz, and certificate regression group | 22 passed, 0 failed |
| `npm run lint` | Passed with no errors |
| `npm run build` | Passed; the existing large-chunk warning remains |

No browser surface was connected to the automation environment. Desktop, tablet,
and mobile screenshots, native dialog behavior, visual overflow, and browser
console inspection therefore remain unverified. Automated DOM coverage confirms
the responsive table/card structures, dialogs, profile content, keyboard action
menu, focus restoration, loading/error/empty states, and account workflows.
