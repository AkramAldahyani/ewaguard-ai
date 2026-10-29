# User Management Phase B: directory and account controls

Recovery validation date: 2026-10-21.

## Scope and preserved work

The interrupted implementation was already present. No reset, revert, clean,
checkout, or deletion of existing work was performed. Phase A services, schema,
migrations, and security controls were reused without modification. Phase C was
not started. The working tree includes substantial unrelated earlier changes;
those are not attributed to Phase B.

Phase B implementation files identified by their contents:

- `frontend/src/features/users/UserManagementPage.jsx`
- `frontend/src/features/users/UserDirectory.jsx`
- `frontend/src/features/users/UserPanel.jsx`
- `frontend/src/features/users/users-api.js`
- `frontend/src/features/users/users-model.js`
- `frontend/src/features/users/users.css`
- `frontend/tests/users-ui.test.mjs`
- User Management import/route in `frontend/src/App.jsx`
- Users navigation in `frontend/src/layouts/AppShell.jsx`

There is no separate Phase B commit boundary. Shared routing/navigation files also
contain earlier changes, so their entire diffs must not be treated as Phase B.
Recovery changed only the UI test, summary hint, package test script, and these
user-management documents.

## Implemented behavior

- Administrator route and navigation at `/admin/users`.
- Database-backed summary totals independent of directory filters.
- Debounced employee-ID, name, email, and internal-ID search; department, role,
  and account-status filters; server sorting and pagination.
- Responsive table/card layouts, account details, add/edit forms, validation,
  loading, empty, retry, success, and error states.
- Confirmed activation, suspension, deactivation, and privileged role changes.
- Soft deletion requires the exact employee/internal ID and explains retention.
- Latest account versions accompany mutations; stale updates offer reload.
- Recent-MFA reauthentication errors provide sign-out guidance; permission and
  last-administrator denials remain visible without bypassing backend controls.
- Keyboard action menus, native modal dialogs, focus restoration, reduced-motion
  styles, and labelled inputs.

## Crash investigation and recovery fixes

No reliable prior Phase B result log was found in `.runtime` or matching top-level
temporary log files. Earlier tests are therefore not claimed as passed.

Existing Vite (port 5173) and backend (port 5000) processes were identified and
left running. No leftover Phase B test runner or port conflict was identified
before testing. The current Codex sandbox execution helper failed before launching
commands; approved outside-sandbox execution was used. That helper failure does
not establish the cause of the original crash.

The first recovery UI run reproduced severe resource exhaustion. Its worker
reached about 10,410 MB working memory, with approximately 80 MB system physical
memory free. The worker was explicitly identified and stopped; development servers
were not stopped. Four tests completed successfully, an add-form test failed, and
the overall run failed. Later tests in that run were not counted as passed.

Two test problems were corrected:

1. The department selector matched both the directory filter and form field.
   Form queries are now scoped to the dialog.
2. Equality assertions comparing React-backed DOM objects with `null` could
   serialize large cyclic DOM/fiber structures during failed `waitFor` retries.
   Absence checks now assert booleans. The next bounded run finished in about
   eight seconds. This strongly supports test assertion diagnostics as the cause
   of the reproduced memory incident; the original crash has no confirming log.

Four Phase B test lint errors were fixed by referring explicitly to `dom.window`.
The total-users hint was corrected to say removed accounts are excluded.
`npm run test:users:ui` now uses a 768 MB heap cap, one test worker, and a 60-second
test timeout. Run validation groups sequentially. The timeout alone did not
prevent the initial synchronous memory spike, so retain the heap cap.

## Validation actually completed

| Command | Result |
| --- | --- |
| `npm run test:users:ui` | 13 passed, 0 failed, including real PostgreSQL/Express lifecycle through the rendered UI |
| `node --max-old-space-size=768 --test --test-concurrency=1 --test-timeout=60000 backend/tests/user-policy.test.js backend/tests/user-management.integration.test.js` | 24 passed, 0 failed |
| `node --max-old-space-size=768 --test --test-concurrency=1 --test-timeout=60000 backend/tests/auth.integration.test.js backend/tests/mfa-rbac.integration.test.js backend/tests/auth-audit.test.js` | 39 passed, 0 failed |
| `node --max-old-space-size=768 --test --test-concurrency=1 --test-timeout=60000 frontend/tests/portal.integration.mjs` | 10 passed, 0 failed |
| `node node_modules/eslint/bin/eslint.js frontend/src/features/users frontend/src/App.jsx frontend/src/layouts/AppShell.jsx frontend/tests/users-ui.test.mjs` | Passed |
| `npm run build` | Passed; large bundle warning remains |
| `npm run lint` | Failed only on the three existing audit UI errors listed below |

API/security tests exercise real database search, filters, pagination, lifecycle,
optimistic concurrency, role and MFA authorization, recent sign-in, self-protection,
last-administrator protection, session/socket revocation, trusted origins, rate
limits, audit rollback, and retained incident records. Fixtures are synthetic and
cleanup is scoped to their IDs. No database/schema change was needed in recovery.

## Remaining issues and acceptance

Functional Phase B requirements pass automated validation. No mocked production
directory data remains. Employee password-setup UI and invitation email delivery
are still unavailable and explicitly described as unavailable in the add-user UI;
these are outside the requested directory/account-controls scope.

Repository-wide lint retains the reported pre-existing errors:

- `frontend/src/features/audit/AuditLogsPage.jsx:14`: synchronous setState in effect.
- `frontend/tests/audit-ui.test.mjs:56` and `:61`: undefined `document`.

No browser was connected to the available browser automation tool. Consequently,
actual browser screenshots, viewport layout, native dialog focus trapping, and
browser-console inspection could not be verified. Responsive structures/styles
were inspected and DOM interactions passed, but full visual/browser acceptance
remains unverified. No runtime error occurred in the completed automated tests.
