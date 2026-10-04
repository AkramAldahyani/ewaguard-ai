# Phase 3B: RBAC and administrator MFA

Phase 3A's cookie session remains the foundation. Every authenticated request
reloads active account status and role from PostgreSQL. JWT role claims and client
role fields never authorize access. Administrators additionally need a signed MFA
proof matching their current enrollment timestamp. Promoting an employee therefore
requires a new password/MFA login; the employee's existing token cannot gain admin access.

## Routes and reusable authorization

- `GET /api/employee/workspace`: EMPLOYEE only; representative access check.
- `GET /api/admin/workspace`: IT_SECURITY_ADMIN with completed MFA only.
- `POST /api/auth/login`: employees receive their existing session response;
  administrators receive HTTP 202, `mfaRequired`, and a separate HTTP-only challenge cookie.
- `POST /api/auth/mfa/verify`: `{ "code": "123456" }`; completes enrollment/login.
- `GET /api/auth/me`: safe profile only; no MFA secret, challenge state, or ciphertext.
- `POST /api/auth/logout`: clears both cookies and cancels the presented challenge.

Use `createAuthenticate` before `requireRole(...allowedRoles)`. Role denial is 403;
missing authenticated context is 401. `requireOwnershipOrRole(loader, options)`
loads a resource from trusted storage and compares its owner to the authenticated
identity. Admin exceptions are explicit via `roles`; they are not the default.
Both missing and inaccessible objects return identical 404 responses. Downstream
handlers use `req.authorizedResource`, not client-provided owner IDs. List queries
must separately scope ownership; mutations should authorize within their database
transaction to avoid a resource changing owners between checking and writing.

Frontend guards distinguish employee and administrator routes, show an access
restricted page, and provide role-aware navigation. `/admin` is only an access
confirmation shell, backed by the representative API. No later business features
or analytics are implemented.

## Enrollment and local setup

Configure a dedicated `MFA_ENCRYPTION_KEY` with 32 cryptographically random bytes
encoded as 64 hexadecimal characters in ignored `.env` (or a deployment secret
manager). Keep it separate from `JWT_SECRET`. A missing key disables administrator
sign-in; employee sign-in remains available. An invalid nonempty key rejects
configuration. `MFA_TOTP_ISSUER` defaults to EWAGuard AI and
`MFA_CHALLENGE_TTL_SECONDS` defaults to 300 (allowed 60–600).

Provision administrator accounts through trusted organizational procedures and
securely deliver their initial password. On first password-authenticated sign-in,
the server generates an enrollment secret and returns a provisioning URI only in
that response. The UI shows its manual setup key in memory, never in localStorage,
URLs, analytics, or logs. Add it to an authenticator as SHA-1, six digits, 30 seconds.
Enter a valid code to enable MFA and enter the admin workspace. Subsequent logins
show only the verification form. Refreshing an unfinished enrollment requires
restarting password login; the previous challenge is replaced.

This is password-authenticated initial enrollment, not an independent identity
proofing service. Provisioning must happen before deployment to real users; a
stolen initial password can otherwise enroll an attacker's authenticator first.
There is no unauthenticated enrollment/reset endpoint. No existing admin account
was enrolled by automated validation; tests use temporary accounts and remove them.

## Encryption, challenges and replay

Secrets and pending secrets use AES-256-GCM with fresh random 12-byte nonces and
authentication tags. Versioned authenticated data binds ciphertext to the user ID.
The key is never stored in PostgreSQL. Keep a protected backup; losing it prevents
TOTP verification. Key rotation requires controlled decrypt/re-encrypt maintenance;
do not simply replace a key after accounts have enrolled.

The separate challenge JWT has audience `ewaguard-mfa`, purpose `admin-mfa`, a random
identifier, and short expiry. It cannot authenticate normal API requests. Only its
SHA-256 digest is stored. One outstanding challenge per user is permitted. Challenges
are bound to the verified password hash, database role/status and expiry. Password
changes invalidate pending challenges. Row locks serialize validation, enrollment,
attempt increments and challenge consumption across API processes.

[OTPAuth](https://github.com/hectorm/otpauth) implements standard TOTP. Verification
accepts only six digits and ±1 thirty-second step. The accepted counter is stored;
the same or an older step cannot be reused, even on another challenge. Wait for the
next authenticator code when signing in again immediately after enrollment/login.

Five failed attempts exhaust the account's challenge budget. Re-entering a password
or cancelling does not reset an unexpired budget. IP throttling additionally limits
verification to 20 requests per 15 minutes per API process. Account attempt limits
persist in PostgreSQL; IP limits require a shared store for multi-instance deployment.
Production cookies are Secure, HTTP-only and `__Host-` prefixed; the challenge cookie
uses SameSite=Strict. Existing trusted-origin validation applies to MFA POST requests.
Authentication responses use `Cache-Control: no-store`.

Security logs contain event names and user IDs only. Enrollment starts/completions,
verification successes/failures, admin authentication and role denials are recorded.
Full persisted audit records remain Phase 15.

## Database and limitations

The additive migration `20261004000100_admin_mfa` adds eight fields to `users` and
checks enrollment consistency and attempt bounds. Enabled state derives from
`mfaEnabledAt`; no competing boolean is stored. No other tables or vector indexes
are redesigned. Preserve the SQL-managed HNSW index when generating future migrations;
do not use destructive resets or casually apply Prisma schema drift changes.

Recovery codes, self-service MFA reset, QR rendering and key-rotation automation
are deferred. A lost authenticator requires an identity-verified operator recovery
procedure; no password-only fallback is provided. Expired challenge data is bounded
to one row per account and replaced on the next login; scheduled retention cleanup
belongs to the later privacy phase.

Phase 3A's stateless logout limitation remains: clearing cookies does not revoke a
copied access JWT before expiry. Suspension/deactivation is checked on every request;
removing/changing MFA enrollment invalidates old admin MFA proofs. Server-side session
revocation is deferred. TOTP is not phishing-resistant authentication.

## Validation

`npm test` runs real PostgreSQL/HTTP employee authentication, RBAC, MFA enrollment,
verification, expiry, replay/concurrency, ownership, role/status changes, throttling,
secret redaction, configuration and encryption tests. Temporary fixture accounts are
deleted. Database/vector suites remain separate: `npm run test:database` and
`npm run test:vector`. No real administrator authenticator is modified by tests.
