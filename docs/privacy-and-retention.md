# Privacy, retention and audit

## In short

EWAGuard AI follows **privacy by design**: collect as little as possible, keep it
only as long as needed, and let people see only what their role requires.

- Raw sensitive content (email bodies, full URLs, file contents, passwords) is **not stored**.
- Each kind of data has an expiry date. A **cleanup worker** can remove expired records, but it is **off by default** and only runs after an operator turns it on.
- Important actions are written to an **audit log** that the application cannot edit.

This is a prototype policy. It is not an approved EWA retention schedule and does
not claim legal PDPL compliance.

## What is stored and for how long

| Data | What is kept | Who can see it | Expiry / cleanup |
| --- | --- | --- | --- |
| Accounts | Name, email, employee ID, role, department, status, bcrypt hash, encrypted MFA secret | The person (safe profile); administrators (limited fields) | Never auto-deleted; deactivate or soft-delete instead |
| Logged-out sessions | Random session ID and expiry | System only | Removed after the token's expiry |
| Chat conversations | Messages, timestamps | The owner only (no administrator chat access) | 30-day access window; then eligible for cleanup unless protected (see below) |
| Pending AI approvals | Encrypted email/URL input, state | The owner | Valid 5 minutes; ciphertext erased when used, rejected or expired |
| Email analyses | Indicator codes, counts, unverified authentication states, risk | The owner; incident snapshot for administrators | 30 days by default |
| URL analyses | Hostname, hash of the redacted URL, structured evidence, risk | Same | 30 days by default |
| File analyses | SHA-256, size, type, scanner statuses, risk | Same | 30 days by default |
| Temporary scan files | Random-named copy during scanning | Server only | Deleted immediately after scanning; leftovers swept at startup |
| Incidents | Reporter, assignee, risk, evidence snapshot, timeline, notes | Reporter (restricted view); administrators | **Never auto-deleted**. `retentionUntil` (90 days) is a review date only |
| Notifications | Recipient, kind, reference, severity, times | The recipient | Hidden after 90 days; deleted only when safe (see below) |
| Training, quizzes, certificates | Content, assignments, progress, answers, scores | The employee; administrators | Never auto-deleted (history and certificates depend on them) |
| Community | Posts, comments, moderation history, images | Approved content for all; full history for administrators | Text kept; images 90 days (7 after rejection/removal) |
| Acknowledgements | User, context, version, time | System and related records | Kept (other records depend on them) |
| Audit log | Action, actor, resource, time, outcome, small metadata | Administrators (without raw metadata) | Never auto-deleted; 90-day review date |
| AI usage | Request IDs, model, token counts, cost | System | **Never deleted** (deleting would refill the budget) |
| Password tools | Nothing | Nobody | Browser memory only |

Hashes and hostnames can still identify things, and free text (notes, posts) can
contain more than intended despite warnings. Database backups, server logs and
provider-side retention need their own organizational policy.

## The cleanup worker

Settings live in `backend/src/privacy/retention-policy.js` and `.env`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `RETENTION_ENABLED` | `false` | Must be exactly `true` to allow deletion and start the background worker |
| `RETENTION_PAUSED` | `false` | `true` stops deletion even when enabled (for a hold) |
| `RETENTION_BATCH_SIZE` | `100` | Records per category per run (1–500) |
| `RETENTION_INTERVAL_MINUTES` | `60` | How often the worker runs (1–1440); never immediately at startup |
| `RETENTION_EMAIL_DAYS` / `_URL_DAYS` / `_FILE_DAYS` | `30` | Expiry for new analyses (1–365) |
| `RETENTION_NOTIFICATION_DAYS` | `90` | Expiry for new notifications (1–365) |

Changing these values affects **new** records only; existing expiry dates are not
rewritten.

### What it may delete

Seven categories: expired approval payloads, chats, email analyses, URL analyses,
file analyses, notifications and expired session revocations.

### What it protects

- Only completed LOW/MEDIUM analyses with nothing depending on them. HIGH/CRITICAL, incomplete or unclassified analyses are kept for review.
- Anything linked to an incident, a tool-approval receipt or a community attachment.
- Everything belonging to a person who has an incident that is not CLOSED or FALSE_POSITIVE, or that has a legal hold. (RESOLVED is still protected until closed.)
- Chats with tool receipts or uncertain AI usage.
- It **never** deletes users, incidents, timeline events, notes, training, quizzes, certificates, community posts, acknowledgements, audit records or AI usage.

### How it runs safely

- A database lock lets only one worker run at a time across servers; another returns BUSY.
- Each batch is one transaction with strict time limits. Any failure rolls back the whole batch.
- Each successful batch writes a `RETENTION_CLEANUP` audit record (if that fails, the deletion is undone).
- It makes no network calls and never changes risk, grades or budgets.

### Operator steps

1. With `RETENTION_ENABLED=false`, run `npm run retention:preview` to see how many records **would** be removed. This changes nothing.
2. Review with the responsible owner: open investigations, holds, backups, logs. **Get explicit approval.**
3. Set the approved values and `RETENTION_ENABLED=true`. For a single batch: `npm run retention:cleanup -- --apply` (without `--apply` it only previews). `npm run chat:purge` does the same for chats only.
4. A restarted backend with cleanup enabled runs automatically at the set interval. Set `RETENTION_PAUSED=true` and restart to pause.
5. Monitor the COMPLETED / FAILED / BUSY / DISABLED results. Never reset the database or delete protected history to make cleanup succeed.

Deleting rows does not remove copies in old backups.

## Audit log

Important actions are recorded in `audit_logs`, usually in the same transaction
as the action, so the action fails if the audit cannot be written. Examples:

| Area | Events |
| --- | --- |
| Sign-in and MFA | `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `MFA_*`, `ADMIN_AUTHENTICATION_SUCCEEDED`, `SESSION_REVOKED`, `LOGOUT` |
| Users | `USER_CREATED`, `USER_UPDATED`, `USER_ROLE_CHANGED`, `USER_DELETED`, invite events |
| Incidents | `INCIDENT_CREATED`, assignment, status and note events, `INCIDENT_VIEWED`, `INCIDENT_NOTES_VIEWED`, `INCIDENT_EXPOSURE_REPORTED` |
| Training | `TRAINING_*`, `COURSE_QUIZ_*`, `MONTHLY_QUIZ_*`, `TRAINING_CERTIFICATE_ISSUED` |
| Community | Submission, moderation, deletion and report events |
| Other | `NOTIFICATION_READ`, `KNOWLEDGE_RETRIEVAL_REQUESTED`, `RETENTION_CLEANUP` |

Rules:

- Audit records **never** contain passwords, codes, tokens, cookies, API keys, request bodies, email addresses, IP addresses, note text or post text.
- Sign-in events are "best effort": if the audit store is down, sign-in still works and an event may be lost. First-time MFA enrollment is the exception and is rolled back if its audit fails.
- The application has no way to edit or delete audit rows. (A database administrator still could; this is not tamper-proof storage.)
- The **Audit Logs** page shows actions, actors, times and outcomes, but not raw metadata.

## Privacy boundaries by feature

| Feature | Boundary |
| --- | --- |
| AI chat | Owner-only; no administrator access; history excludes provider data and costs |
| Analyzers | Only minimized evidence stored; tools read only the owner's records |
| Incidents | Employees see only their own, restricted view; private notes stay private |
| Notifications | Recipient-only; real-time signals carry no content |
| Quizzes | Answer keys hidden until submission; administrator results need MFA |
| Certificates | Own certificates only; administrators with MFA |
| Community | Feed shows only approved posts; moderation reasons stay private |
| Analytics | Totals only; small groups hidden |

## Known limitations

- Optional sign-in audits can be lost if the audit store is down.
- Expired encrypted MFA challenge data can remain until the next sign-in replaces it.
- There is no general per-record legal-hold editor; pause cleanup globally for unrelated holds.
- Backup, log, host and provider retention are outside the application.

## Code and tests

- `backend/src/privacy/`, `backend/scripts/retention-cleanup.js`, `backend/scripts/purge-expired-chats.js`
- Tests: `backend/tests/retention.test.js`, `retention.integration.test.js`, `auth-audit.test.js`, `audit-traceability.integration.test.js`
