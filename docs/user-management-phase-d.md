# Phase D: secure employee setup and activation

## Demonstration configuration

Set the following explicitly in the backend environment (the root `.env` is loaded
by the existing configuration module), then restart the backend:

```dotenv
NODE_ENV=development
DEMO_ACCOUNT_SETUP_ENABLED=true
```

The default is false. Production rejects true at startup. The flag is server-side;
no `VITE_` flag grants authority. No SMTP, Graph, email delivery, public registration,
new authentication system, or schema migration was introduced. Dummy email
addresses need valid syntax and uniqueness, but no working mailbox.

Use localhost or HTTPS for clipboard access. For another device, use a configured
HTTPS frontend origin and the existing trusted-origin/proxy configuration; a
localhost link always points to the device on which it is opened.

## Demonstration steps

1. Sign in as an administrator with MFA. Account mutations require a sign-in in
   the last five minutes; sign out and complete MFA again if asked.
2. Open Users, Add User, and enter the participant's first/last name, employee ID,
   dummy email, and department. The existing Employee role is enforced; privileged
   role changes remain separate and require completed account setup.
3. Choose Setup pending and create the account. Copy Setup Link from the receipt.
   Inactive accounts receive no link until explicitly activated into Setup pending.
4. Verify the participant's identity and hand the credential directly to them.
   Open it in a separate/private browser so the administrator session is not reused.
5. Create and confirm a strong password. Complete setup, select Go to Login, and
   sign in normally with the registered dummy email and chosen password.
6. Clear the clipboard after handoff. Closing the receipt discards its in-memory
   credential. If lost or expired, use Generate New Setup Link on the pending
   user's actions menu. The replacement invalidates the previous token.

## Security design

- Reuses the Phase A 256-bit random, SHA-256-digested, 24-hour, single-use token.
- Demo-only initial issuance and replacement use the existing administrator RBAC,
  MFA, recent authentication, transaction locks, optimistic versions, rate limits,
  and atomic audit writes. Disabled demo mode creates pending accounts without a
  token and denies replacement. Turning the flag off stops issuance, not redemption
  of already-issued tokens; suspend/deactivate an account to revoke outstanding setup.
- Links carry the token in the URL fragment, never a query or path. The bootstrap
  immediately replaces the history entry with `/account-setup` and loads only the
  setup screen. No application auth provider, socket, or analytics initializes there.
- The raw token is transient in issuance/setup component memory and the explicitly
  requested clipboard only. It is absent from directory/profile responses, audit
  metadata, application logs, localStorage, and sessionStorage. Reloading a scrubbed
  setup page requires reopening the original link.
- All assets and strength checks are local. The HTML sets `no-referrer`; Vite dev
  and preview responses and setup APIs set no-store/no-referrer headers. Any future
  organizational static host must preserve these headers on `/account-setup`, serve
  the SPA for that route, use HTTPS, and exclude the page from analytics and caching.
- Validation is a JSON POST and returns only `{valid:true}`. Invalid, expired,
  replaced, used, configured, suspended, deleted, and otherwise ineligible accounts
  receive the same generic invalid-link response. Validation does not consume tokens.
- Validation and submission share 20 requests per IP per 15 minutes. The password
  retains the existing 12-character minimum and 72-UTF-8-byte maximum. Local zxcvbn
  now rejects scores below 3 on both client and server. Confirmation is mandatory
  in the page and validated by the API when supplied, preserving the Phase A API.
- Redemption rechecks eligibility under the original row lock after bcrypt hashing,
  atomically activates only INVITED eligible accounts, clears the token, increments
  the session version, and audits completion. It issues no session or cookie.
- Real organizational onboarding still requires an approved identity-verified
  delivery mechanism. Manual demo disclosure is prohibited in production.

## Changed files

Backend: `src/config/env.js`, `src/routes/admin-users.js`, `src/users/user-service.js`,
`src/users/user-policy.js`, `package.json`, and the two User Management test files.
The backend declares the already-used zxcvbn package; no second strength library.

Frontend: `src/features/setup/AccountSetupPage.jsx`, `src/features/setup/setup-link.js`,
`src/features/users/SetupLinkPanel.jsx`, `UserPanel.jsx`, `UserDirectory.jsx`,
`UserManagementPage.jsx`, `users-api.js`, `src/main.jsx`, `index.html`, `vite.config.js`,
`tests/users-ui.test.mjs`, and `tests/account-setup-ui.test.mjs`.

Root: `.env.example`, `package.json`, `package-lock.json`, and User Management docs.
All earlier uncommitted work was preserved.

## Validation actually executed

All test groups run sequentially with a 768 MB Node heap cap, one worker, and a
60-second test timeout.

| Command | Final result |
| --- | --- |
| `npm run test:users` | 27 passed, 0 failed |
| `npm run test:users:ui` | 14 passed, 0 failed |
| `npm run test:setup:ui` | 5 passed, 0 failed |
| `node --max-old-space-size=768 --test --test-concurrency=1 --test-timeout=60000 backend/tests/auth.integration.test.js backend/tests/mfa-rbac.integration.test.js backend/tests/auth-audit.test.js` | 39 passed, 0 failed |
| `npm run lint` | Passed |
| `npm run build` | Passed; existing large-chunk warning remains |

The rendered setup integration creates a real synthetic employee through the
authorized API, opens the fragment flow, submits a password, confirms database
activation and token deletion, signs in normally, and verifies replay denial.
Backend tests cover concurrent redemption, expiration, replacement, all blocked
statuses, duplicate identities, role protections, MFA/recent-auth denials, disabled
demo mode, production configuration rejection, password policy/confirmation, and
secret absence from captured logs and audit/directory/profile responses.

Initial validation found a missing MFA counter in the new synthetic fixture and
an unused bootstrap assignment; both were fixed before the passing runs above.
No hangs or memory exhaustion occurred. No browser surface was connected, so
real desktop/mobile screenshots, native clipboard permissions, and browser-console
visual acceptance remain unverified. DOM behavior and responsive styles are tested
or inspected, but are not claimed as browser visual acceptance.
