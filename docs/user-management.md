# User Management A: secure account lifecycle

Phase A adds real PostgreSQL-backed administrator APIs. Phase B provides the
directory and account-controls UI; see [Phase B recovery and validation](user-management-phase-b.md).
Phase C adds the database-backed administrator profile experience; see
[Phase C profiles and validation](user-management-phase-c.md).
Phase D completes controlled demonstration onboarding; see
[secure manual setup and activation](user-management-phase-d.md).
No employee data or statistics are mocked by the APIs.

## Authorization and session policy

All `/api/admin/users` endpoints require the existing authenticated administrator
session with verified MFA and a trusted browser origin. Every mutation additionally
requires a successful sign-in within the previous five minutes; sign out and sign
in with MFA again when `USER_REAUTH_REQUIRED` is returned. Authority, account
status, MFA proof, expiry, revocation, and session version are rechecked inside the
mutation transaction. Reads are limited to 120 requests/minute per administrator,
writes to 30/minute; setup submission is limited to 20 attempts/15 minutes per IP.

Account mutations use a PostgreSQL transaction-level advisory lock and row locks.
This serializes last-administrator checks across API workers. An administrator
cannot disable, delete, or change their own role. Removing another active admin
requires at least one other active, password-provisioned, MFA-enrolled admin.
Concurrent administrators cannot disable each other using stale authorization.

`sessionVersion` is embedded in signed access tokens and checked on every protected
HTTP request and real-time validation. Status and role changes, email changes,
setup completion, and soft deletion increment it. Reactivation never revives an
old token. Old tokens without a version are accepted only while the account's
version remains zero. Local sockets are disconnected after account mutations;
other workers use the existing database revalidation before dispatch and polling.

## API contract

All responses use `Cache-Control: no-store`. Use JSON POST requests, consistent
with the existing application's mutation routes and CORS policy.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/admin/users` | Paginated directory |
| GET | `/api/admin/users/summary` | Database counts, independent of directory filters |
| GET | `/api/admin/users/options` | Departments, supported roles and account states |
| GET | `/api/admin/users/:id` | Safe account information, including retained deleted accounts |
| GET | `/api/admin/users/:id/profile` | Safe account, security, incident, training, quiz, and certificate summary |
| POST | `/api/admin/users` | Create an employee and optionally issue initial setup token |
| POST | `/api/admin/users/:id/update` | Edit identity and department |
| POST | `/api/admin/users/:id/status` | Activate, deactivate, or suspend |
| POST | `/api/admin/users/:id/role` | Explicit privileged role change |
| POST | `/api/admin/users/:id/setup` | Replace an unused initial setup token |
| POST | `/api/admin/users/:id/delete` | Retention-preserving soft deletion |
| POST | `/api/auth/setup` | Consume a setup token and set initial password; no session issued |
| POST | `/api/auth/setup/validate` | Check link eligibility without consuming it or disclosing account identity |

Directory filters: `search`, `departmentId`, `role`, `status`, `sort`, `direction`,
`page`, `pageSize`. Search matches case-insensitive partial first/last names,
multiword full names, email, employee identifier, or an exact internal UUID.
Sorting supports `name` (surname then first name), `createdAt`, and `lastLoginAt`,
with `asc`/`desc` and an ID tiebreaker; missing last login sorts last. Default page
size is 20, maximum 100. Unknown or repeated filters are rejected. Responses have
`items`, `total`, `page`, `pageSize`, and `hasMore`.

Deleted accounts are excluded by default; use `status=DELETED` to retrieve them.
Summary `total`, `active`, `inactive`, and `administrators` exclude deleted users.
`inactive` counts DEACTIVATED accounts; separate `invited`, `suspended`, and
`deleted` counts preserve the distinction between supported lifecycle states.

Create requires `firstName`, `lastName`, `email`, and an existing `departmentId`.
Optional `employeeIdentifier` is distinct from the immutable database UUID;
letters, digits, periods, hyphens, and underscores are accepted, normalized to
uppercase, and unique when supplied. Email is normalized to lowercase. Identity
uniqueness includes deleted accounts to preserve historical identity. `role` may
only be EMPLOYEE on creation. `status` may be INVITED, ACTIVE, or DEACTIVATED;
ACTIVE creation becomes INVITED until the employee completes password setup.

Update accepts only identity fields and `expectedUpdatedAt`. Role and status
require their respective separate operations. Every existing-account mutation
requires `expectedUpdatedAt`, copied exactly from the latest account response;
stale changes return `409 USER_CONFLICT`. Deletion also requires `confirmation`,
the exact employee identifier or internal UUID when no employee identifier exists.

Promotion requires a provisioned active account, invalidates its sessions, and
requires MFA enrollment through the existing sign-in flow. Role changes clear
prior MFA material so a later promotion cannot reuse old privileged credentials.

## Initial password setup

With explicit non-production `DEMO_ACCOUNT_SETUP_ENABLED=true`, creation of an
invited account or setup reissue returns `{ user, setup: { token, expiresAt } }`.
The cryptographically random 256-bit token is shown only in that
response. Storage contains only its SHA-256 digest and 24-hour expiration; no
password is created or emailed by the administrator API. Reissue invalidates the
previous token. Email changes, deactivation, suspension, and deletion clear it.

There is no email delivery integration. In the controlled dummy-data demo, an
MFA-authenticated administrator with a sign-in less than five minutes old can copy
the link from the transient issuance panel and hand it directly to the verified
participant. Only a digest is stored; old tokens cannot be retrieved. The link
uses `/account-setup#token=...`; its fragment is removed before the setup page is
initialized. Do not log it, use a URL query, persist it in browser storage, or expose
it in analytics. Use a separate/private browser for the employee demonstration.

The demo flag defaults to false and is rejected in production. When disabled,
creation still provisions a pending employee but does not issue or disclose a
token; the reissue endpoint denies disclosure. Organizational onboarding requires
an approved, identity-verified delivery mechanism before enabling it.

POST `{ "token": "<single-use-token>", "password": "<employee-chosen-password>" }`
to `/api/auth/setup`. Passwords require at least 12 characters and at most 72 UTF-8
bytes, avoiding bcrypt truncation, and a local zxcvbn score of at least 3 (Strong).
The page submits `confirmPassword`; when present it must match on the backend.
The existing bcrypt implementation hashes the
password. Consumption rechecks eligibility and expiry under a database row lock;
concurrent submissions cannot consume a token twice. The employee then signs in
normally. This is initial setup only, not password reset for existing credentials.
Validation and redemption share a 20-request/15-minute IP rate limit. Neither
returns account identity or a session, and both use no-store/no-referrer headers.

## Privacy, retention, audit, and migrations

Soft deletion disables access, invalidates sessions, and clears credentials, MFA
material, and setup tokens. It retains identity and all incident, analysis,
training, certificate, community, and audit relationships. It cannot be reversed
by the activation endpoint. Permanent deletion and identity reuse are unavailable
because the existing retention policy does not authorize account disposal.

Required audit records are committed in the same transaction as account writes;
audit failure rolls back the change. Events include USER_CREATED, USER_UPDATED,
USER_ACTIVATED, USER_DEACTIVATED, USER_SUSPENDED, USER_ROLE_CHANGED,
USER_SETUP_ISSUED, USER_SETUP_COMPLETED, USER_DELETION_REQUESTED, and USER_DELETED.
Only actor/target identifiers, timestamps, field names, and necessary status/role
metadata are stored. No passwords, tokens, email values, private chats, or analysis
contents appear in account audit metadata or directory/detail projections.

Migration `20261020000200_user_management` adds lifecycle columns to `users`,
indexes for lifecycle/sort fields, and case-insensitive identity uniqueness. It
does not rewrite identities or drop relationships. Legacy case-only identity
duplicates intentionally cause migration failure for review instead of silently
merging users. Existing `employeeIdentifier` is reused. `lastLoginAt` is recorded
on future successful employee sign-ins and administrator MFA completions; existing
unknown login dates stay null. No new dependency is required.

Run `npm run prisma:format`, `npm run prisma:validate`, `npm run prisma:generate`,
then `npm run db:migrate` before starting the updated application. Directory
substring search uses bounded pagination with Prisma; very large deployments may
need a separately reviewed trigram index after measuring query performance.

## Validation

`npm run test:users`

Integration tests use local PostgreSQL and HTTP, synthetic fixture accounts, and
real session and socket validation. Last-admin edge cases also have an isolated
unit fixture so tests never deactivate existing real administrators. Test account
cleanup is scoped to fixture IDs. Authentication, MFA, notifications, incidents,
training, quizzes, and certificates should be included in regression validation.

## Invite links (self-registration)

An administrator with a recent MFA sign-in can generate a shareable link from User Management → Invite Link. Anyone
holding the link can create one **employee** account at `/register#token=…` and sign in afterwards.

- Endpoints: `GET/POST /api/admin/invites`, `POST /api/admin/invites/:id/revoke`, and the public
  `POST /api/auth/register/validate` and `POST /api/auth/register`.
- Controls: only a SHA-256 digest of the token is stored and the link is shown once; links expire (1 hour to 7 days),
  have a use limit (1–200), can be revoked, can be restricted to one email domain, and always create `EMPLOYEE`
  accounts in the department chosen by the administrator. Registration uses the same password policy as account setup,
  creates no session, is rate limited, and is audited (`REGISTRATION_INVITE_CREATED`, `REGISTRATION_INVITE_REVOKED`,
  `USER_SELF_REGISTERED`).
- Trade-off: the link does not verify identity. Share it only with intended people, prefer a short validity, a low use
  limit and an email-domain restriction. Set `REGISTRATION_INVITES_ENABLED=false` to disable the feature.
