# Phase 3A authentication architecture

EWAGuard AI uses provisioned organizational accounts. There is no public
registration endpoint. Phase 3A supplies authentication only; role authorization
and administrator MFA belong to Phase 3B.

## Request flow

`POST /api/auth/login` accepts an `email` and a password. The server validates
bounded input, normalizes email case, retrieves the
account through Prisma and always performs a bcrypt comparison. Missing accounts,
wrong passwords, INVITED/SUSPENDED/DEACTIVATED accounts, and accounts with a
deactivation timestamp receive the same 401 response. Successful responses contain
only a safe profile and session expiry metadata.

Passwords use bcrypt cost 12. Plaintext values exist only for the duration of the
request or development seed process. Passwords and hashes are absent from response
objects, JWTs, frontend state and authentication logs.

The JWT is HS256-signed with an environment secret and contains only standard
`sub`, `iss`, `aud`, `iat`, `exp`, and `jti` claims. It contains no role or profile
data. Every protected request verifies the signature, algorithm, issuer, audience,
expiry and UUID subject, then reloads the active account, role and department from
PostgreSQL. The JWT therefore proves a session identity; database state remains the
trusted account source. This is authentication, not Phase 3B authorization.

## Cookie and CSRF decision

The access token is stored in `ewaguard_access` during development and the
`__Host-ewaguard_access` cookie in production. It is HTTP-only, `SameSite=Lax`,
`Path=/`, has a 15-minute default maximum age, and is `Secure` in production.
JavaScript cannot read it and no token is returned in an API body or localStorage.
Production configuration requires an HTTPS frontend origin.

Cookie-authenticated POST routes also validate browser origin metadata. `Origin`
must match the configured frontend origin; browser-controlled `Sec-Fetch-Site`
without Origin or outside same-origin/same-site is rejected. Non-browser REST
clients may omit both browser headers. Combined with SameSite and JSON-only login,
this is an appropriate CSRF boundary for this prototype without introducing a
second readable CSRF cookie. Re-evaluate if deployment becomes cross-site.

Logout clears the browser cookie with matching attributes. JWTs are stateless, so
a copied token cannot be centrally revoked during its remaining short lifetime;
database account suspension/deactivation invalidates it immediately on the next
request. Refresh tokens and server-side session storage are intentionally absent.
Phase 3B must integrate administrator MFA before treating password authentication
as a complete administrator session.

## API and errors

- `POST /api/auth/login` — throttled sign-in and cookie issuance.
- `POST /api/auth/logout` — idempotent cookie clearing.
- `GET /api/auth/me` — protected safe profile and expiry metadata.

Responses use the existing `{ error: { code, message } }` shape. Credential
failures do not disclose account existence. Invalid/expired tokens return
`AUTHENTICATION_REQUIRED`. Authentication responses set `Cache-Control: no-store`.
Logs contain event type and successful user ID where appropriate, never submitted
identifiers, passwords, hashes, JWTs or cookie values. Full audit persistence is
deferred to Phase 15.

Failed logins are limited per client with a memory-backed limiter (10 failures per
15 minutes by default); successful logins do not consume the failure budget. This
works for the current single-process prototype. A multi-instance deployment must
use a shared trusted store and configure Express proxy trust only for its known
reverse proxy.

## Frontend behavior

`AuthProvider` checks `/api/auth/me` on startup, holds only the safe user profile
and expiry, schedules local expiry, and clears state on authenticated API 401s.
`ProtectedRoute` redirects anonymous users to `/login` and returns them to their
original internal route after sign-in. The application shell renders the trusted
profile and provides logout. The login page is responsive and uses existing
branding/design-system components.

## Development accounts

The idempotent development-only account seed refuses `NODE_ENV=production`. It
reads two 8–128 character passwords from ignored local environment variables,
hashes them, and creates or rotates these fake accounts:

| Account | Employee ID | Role | Department |
| --- | --- | --- | --- |
| `employee@ewa.bh` | `DEV-EMP-001` | EMPLOYEE | Operations |
| `admin@ewa.bh` | `DEV-ADM-001` | IT_SECURITY_ADMIN | IT |

Set `DEV_EMPLOYEE_PASSWORD` and `DEV_ADMIN_PASSWORD` only in ignored `.env` or the
current shell, then run `npm.cmd run db:seed:auth`. The repository contains no
development password. Re-running rotates both password hashes. These accounts and
the local database must never be used as production identities.
