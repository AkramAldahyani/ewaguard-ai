# Sign-in and access control

## In short

- Accounts are created by administrators (or through an administrator's invite link). There is no open public sign-up.
- Employees sign in with email and password.
- Administrators sign in with email, password **and** a 6-digit code from an authenticator app (MFA).
- After sign-in the browser holds a secure cookie. On every request the server checks the cookie and **reloads the account from the database** to confirm it is still active and still has the right role.

## Roles

| Role | Can do |
| --- | --- |
| `EMPLOYEE` | Use the analyzers, password tools, AI assistant, training, quizzes, certificates and community; see only their own incidents |
| `IT_SECURITY_ADMIN` | Investigate incidents, manage users, training, quizzes, certificates, community moderation, analytics and audit logs. Must complete MFA. Cannot use the employee-only analyzers or chat. |

The role is **never** taken from the token, the request body or the AI. It is
always read fresh from the database.

## Employee sign-in step by step

1. The employee sends email and password to `POST /api/auth/login`.
2. The server lowercases the email, looks up the account and **always** runs a bcrypt comparison (even for unknown emails, so timing does not reveal which accounts exist).
3. Unknown email, wrong password, or an account that is invited, suspended or deactivated all get the **same** "invalid credentials" response.
4. On success the server sets an HTTP-only cookie containing a signed JWT and returns a safe profile (name, email, role, department, expiry).

## Administrator sign-in with MFA

1. Password check as above. Instead of a session, the server returns HTTP 202 `mfaRequired` and a separate short-lived **challenge cookie**.
2. **First sign-in only (enrollment):** the server creates a new TOTP secret and shows it once (manual key / provisioning URI). The administrator adds it to an authenticator app (SHA-1, 6 digits, 30 seconds).
3. The administrator sends the 6-digit code to `POST /api/auth/mfa/verify`.
4. If the code is valid, the server issues the normal session cookie, which also carries proof that MFA was completed for the **current** enrollment.

MFA protections:

- The TOTP secret is encrypted with AES-256-GCM using `MFA_ENCRYPTION_KEY` (64 hex characters, kept separate from `JWT_SECRET`). Losing this key makes existing enrollments unusable, so back it up securely.
- Codes are accepted only within ±30 seconds, and **each code can be used once** (replay is blocked).
- 5 wrong codes use up the challenge; IP throttling adds a limit of 20 verifications per 15 minutes.
- Changing the password or the MFA enrollment invalidates old MFA proofs.
- If `MFA_ENCRYPTION_KEY` is missing, administrator sign-in is disabled; employees can still sign in.
- There is no self-service MFA reset or recovery codes yet. A lost authenticator needs an identity-verified manual recovery by an operator.

## The session cookie

| Property | Value |
| --- | --- |
| Name | `ewaguard_access` in development, `__Host-ewaguard_access` in production |
| Readable by JavaScript | No (HTTP-only) |
| SameSite | Lax (the MFA challenge cookie uses Strict) |
| Secure | Yes in production (HTTPS required) |
| Lifetime | 30 minutes by default (`JWT_ACCESS_TTL_SECONDS`, 60–3600) |

The JWT contains only standard claims (subject, issuer, audience, issue/expiry
times, a random session ID), a session version number and, for administrators,
the MFA proof. It contains **no role or profile data**.

### Logging out and revoking sessions

- Logout stores the session's random ID in `revoked_sessions`. Both HTTP and Socket.IO reject revoked IDs, so a copied cookie stops working.
- Every account has a `sessionVersion`. Changing status, role or email, completing setup or deleting the account increases it, which ends every older session at once.
- Suspending or deactivating an account takes effect on the very next request.

## Cross-site request protection (CSRF)

Every state-changing request must come from the EWAGuard website:

- The `Origin` header must match the configured frontend address.
- Browser `Sec-Fetch-Site` values from other sites are rejected.
- Together with SameSite cookies and JSON-only login, this blocks requests forged by other websites.

## Rate limits

- Failed logins: 10 per 15 minutes per client (successful logins do not count).
- MFA verification: 5 failures per challenge, 20 requests per 15 minutes per IP.
- These limits are stored in memory, which is fine for one server process. Several server processes would need a shared store.
- Behind a reverse proxy on the same machine, set `TRUSTED_PROXY=loopback` so the real client address is used. Keep the default (`none`) for direct access and for the Vite dev server.

## How routes are protected (for developers)

```js
router.use(createAuthenticate({ database, config }), requireRole('IT_SECURITY_ADMIN'));
```

- `createAuthenticate` verifies the cookie and loads the current account. Missing or invalid session → **401**.
- `requireRole(...roles)` → **403** if the role does not match. For administrators it also requires a valid MFA proof.
- Ownership: services load the record from the database and compare its owner with the logged-in user. Missing and "not yours" both return the **same 404**, so IDs of other people's records cannot be discovered.
- Frontend route guards only improve the experience. The backend checks are what actually protect data.

## Main endpoints

| Method and path | Purpose |
| --- | --- |
| `POST /api/auth/login` | Sign in (employees get a session; administrators get an MFA challenge) |
| `POST /api/auth/mfa/verify` | Submit the 6-digit code to finish administrator sign-in or enrollment |
| `GET /api/auth/me` | Current safe profile and session expiry |
| `POST /api/auth/logout` | Clear cookies and revoke the session |
| `POST /api/auth/setup`, `/setup/validate` | First-time password setup from an administrator's setup link |
| `POST /api/auth/register`, `/register/validate` | Self-registration through an invite link |

All authentication responses use `Cache-Control: no-store`.

## Audit records

Sign-in events are stored in `audit_logs`: `LOGIN_SUCCEEDED`, `LOGIN_FAILED`,
`MFA_ENROLLMENT_STARTED`, `MFA_ENROLLMENT_COMPLETED`, `MFA_CHALLENGE_STARTED`,
`MFA_CHALLENGE_SUCCEEDED`, `MFA_CHALLENGE_FAILED`, `MFA_START_FAILED`,
`MFA_CANCELLED`, `ADMIN_AUTHENTICATION_SUCCEEDED`, `SESSION_REVOKED`, `LOGOUT`.
They never contain passwords, codes, cookies, tokens, IP addresses or email
addresses. Failed password logins are recorded without an actor, so they do not
reveal whether an account exists.

## Development accounts

`npm run db:seed:auth` creates (or re-hashes) two local test accounts. It refuses
to run in production. Put the passwords only in your local `.env`:

| Account | Role | Password variable |
| --- | --- | --- |
| `employee@ewa.bh` | EMPLOYEE (Operations) | `DEV_EMPLOYEE_PASSWORD` |
| `admin@ewa.bh` | IT_SECURITY_ADMIN (IT) | `DEV_ADMIN_PASSWORD` |

Never use these accounts or the local database as real identities.

## Limitations

- No refresh tokens or server-side session store; a session simply expires after its lifetime.
- TOTP is strong but not phishing-proof (unlike hardware security keys).
- Initial MFA enrollment trusts whoever first signs in with the password, so initial passwords must be delivered securely.

## Tests

`npm test` covers login, sessions, roles, MFA enrollment and verification, replay,
expiry, throttling and secret redaction against a real local database.
See [testing](testing-and-qa.md) before running tests.
