# Phase 15 — Privacy, retention and audit consistency

Reviewed against the current schema, services, routes and feature documentation on 2026-10-15. Phase 15 is split into **15A** (this inventory, policy, cleanup foundation and tests) and **15B** (audit consistency and further privacy-boundary corrections). This is a prototype operating policy, not an approved EWA retention schedule or a claim of Bahrain PDPL compliance. RAG and knowledge administration remain postponed.

## Data inventory

Unless stated otherwise, persistence is PostgreSQL through Prisma. Database operators and backups are a separate privileged access boundary; application RBAC does not restrict a database superuser. Employee access below always means the authenticated owner, not another employee. Administrator access requires an active administrator account and MFA proof tied to current enrollment. Authorization is enforced on the backend.

| Category / storage | Information and purpose | Application access | Expiration / disposal and privacy observations |
| --- | --- | --- | --- |
| Accounts: `users`, `roles`, `departments` | Names, email, employee identifier, role, department, status; bcrypt hash; encrypted MFA secret, counter and challenge metadata. Identity and authentication. | Safe own profile; limited identity projections in authorized operational workflows. Password hashes and MFA secrets are not profile fields. | No automatic account purge. Prefer deactivation. Expired pending MFA material can remain until subsequent authentication/cancellation; review in 15B. No plaintext password or JWT column. |
| Revocations: `revoked_sessions` | Random token identifier and expiry to reject logged-out sessions. | Internal authentication only. | Eligible at token expiry; bounded cleanup. No JWT value stored. |
| Chat: `chat_sessions`, `chat_messages` | Owner, title, ordered validated user/assistant text, timestamps and expiry; private continuity. | Employee-only chat routes with ownership checks; no administrator chat API or dashboard conversation projection. | Fixed 30-day access window from session creation. Eligible sessions without tool receipts, RESERVED/UNKNOWN usage or protected reporter investigations are purged with messages. Other sessions require review. Notice v3 distinguishes access expiry from physical removal. Text detection cannot guarantee absence of secrets. |
| Tool confirmations: `tool_approvals` | Identity/session/acknowledgement bindings, parameter digest, encrypted email/URL input, state, timestamps and result references. Explicit approval, replay prevention and recovery. | Owner-only context, review and decision routes; normal responses omit ciphertext and raw parameters. | Five-minute confirmation validity. Ciphertext cleared on execution claim, rejection and expiry reads; scheduled expiry clearing when enabled and eligible. Receipts are retained, and their related sessions/sources are excluded from automatic deletion. EXECUTING is never retried by cleanup. |
| Email: `email_analyses` | Owner, acknowledgement, minimized indicator/authentication/count/category evidence, deterministic risk, timestamps. | Employee analysis flow / authorized own tools; minimized linked incident snapshot for security staff. | New rows expire after 30 days by default. Raw body, full headers, subjects, addresses and attachment bytes are not persisted by the email projection. Only completed LOW/MEDIUM records without dependencies qualify for cleanup. |
| URL: `url_analyses` | Hostname, hash of minimized URL, structured network/reputation evidence and risk. | Employee analysis flow / own tools; minimized incident evidence. | Default 30 days. Paths, query values, fragments and credentials are omitted. Hostnames can still contain sensitive information. Same conservative eligibility as email. |
| File: `file_analyses` | Hash, size, MIME/type/extension, scanner states, minimized evidence, deletion timestamp, owner and acknowledgement. | Employee file analysis / own tools; minimized incident snapshot. No uploaded-file download API. | Default 30 days. Cleanup also requires no storage key, completed temporary deletion and no community attachment. No original filename/binary is stored by this flow. Hashes remain potentially identifying data. |
| Temporary files: isolated application temp root | Random UUID directories/files used for local scanners. Upload buffers also exist briefly in process memory. | Backend process and OS administrators only. | Existing `finally` removal remains mandatory; failure prevents persistence. Existing startup scavenger handles UUID directories older than 24 hours and rejects symlinks/root escapes. It is separate from the database worker and is not enabled/disabled by retention flags. Startup scavenging is not a continuously scheduled service; operators must monitor cleanup errors and protect directory ACLs. No file-storage deletion was run for this phase. |
| Incidents: `incidents`, `incident_evidence`, `incident_events`, `incident_comments` | Reporter/assignee, risk, minimized evidence snapshots, status/timeline, investigation notes, resolution, hold/review metadata. Investigation and accountability. | Reporter receives restricted own incident projection and REPORTER notes; MFA administrator receives authorized investigation projections. SECURITY_TEAM notes remain private. | No automatic deletion. `retentionUntil` is a review date, not permission to erase. All linked sources are retained even for closed cases. Notes/free text can contain excessive material despite notices; manual review required. |
| Notifications: `notifications`; Socket.IO transport | Recipient, incident reference, fixed message/kind, severity, delivery/read/expiry timestamps. Operational alerts. | Recipient/role scoped HTTP and authenticated sockets; employee incident ownership rechecked. | Default 90-day expiry hides records. Purge only unlinked notifications or CLOSED/FALSE_POSITIVE incidents with no legal hold and an elapsed non-null review deadline. Events and incident history remain. Socket payloads are projections, not a second archive. |
| Training: `training_programs`, `training_assignments`, `training_progress` | Reviewed content, assignments, activity, material completion and progress. Awareness delivery and legitimate completion history. | Assigned employee; MFA training administrators. | No automatic purge. Preserve completion, historical assignments and certificate dependencies. |
| Course/monthly quizzes: quiz definition/binding tables, `quiz_attempts`, `quiz_answers`, `monthly_quiz_assignments` | Questions/choices, approval/publication metadata, selected answers, attempts, score/pass snapshots. Server grading and awareness history. | Assigned employee and authorized training/quiz administrators through existing projections. Correct-answer exposure is controlled by attempt workflow. | No automatic purge; historical results and grading remain unchanged. Individual administrative result access is distinct from aggregate analytics. |
| Certificates: `certificates` | Unique ID, employee/title/score/completion snapshots, progress relation and revocation fields. Evidence of legitimate completion. | Own authenticated PDF/detail; MFA administrator list/verification/download. | No automatic purge. PDFKit generates PDFs on demand; no PDF binary archive in the current service. No public verification or deletion endpoint added. |
| Community: `community_posts`, `post_moderation_actions`, attachment relation | Submitted title/body/category, status, author, internal moderator decisions/reasons. Controlled internal awareness sharing. | Approved feed uses first name/last initial; own submissions exclude moderator notes; full moderation history restricted to MFA administrators. | No automatic purge. Free text needs human moderation. New attachments are not enabled; legacy attachment dependencies remain protected. |
| Acknowledgements: `disclaimer_acknowledgements` | User, context, notice version and timestamp. Submission prerequisite and accountability. | Submission checks and authorized relations; no general employee cross-user listing. | Ten-minute submission validity is not a deletion deadline. No purge because dependent analyses/posts/receipts require these records. |
| Audit: `audit_logs`; security console events | Action, actor/resource, time/outcome and small event-specific metadata. Accountability. | Internal database/operator access; no new audit administration endpoint. | Existing 90-day `retentionUntil` is a review date. No audit deletion. Log sink retention, access and backup policy require operator decisions. Authentication/MFA currently use console security events rather than durable database audit rows. |
| AI: `ai_usage` | Request/user/session IDs, status, model and notice/pricing versions, token bounds/counts, reserved/charged amounts, sanitized tool references. Budget and replay accounting. | Internal budget code; employee recovery returns only own limited request/tool status. | Never purged here: deleting charges would reset the lifetime budget. Raw provider payloads/system prompts are not stored. OpenAI adapter sets `store:false` and disables SDK logging; this does not establish the provider's retention policy. |
| Password tools: browser memory only | zxcvbn analysis and cryptographic generation. | Local employee UI only. | No backend request, database table, AI transmission or audit payload for input/generated passwords. Clipboard and browser/process memory require user/device controls. |
| Analytics/dashboard: derived queries, browser component memory | Incident aggregates, awareness assignments/results/certificates aggregates and bounded operational summaries. | MFA administrators only. | No separate analytics archive. No chat text, raw submissions or passwords. Department comparisons use minimum group/denominator thresholds of five and suppress small groups; this is not a proof against inference from repeated filtered queries. |
| Knowledge schema (postponed) | Document/chunk/version/approval and vector placeholders. | No Phase 9 administration/retrieval implemented here. | No automatic cleanup or ingestion added. |

## Confirmed findings and changes

- Expiration metadata existed on analysis and notification rows without a cleanup mechanism. Eligible records now have a centralized bounded disposal path.
- The old startup/hourly chat purge was unbounded and could cascade-delete an executing tool receipt. The replacement retains all sessions with receipts and preserves RESERVED/UNKNOWN usage and protected investigations.
- The previous standalone chat purge mutated immediately. Both operator commands now preview by default and require explicit apply plus an enable flag.
- Chat's old “retained for up to 30 days” notice overstated physical deletion. Version 3 explains the access window and retention exceptions.
- Cleanup previously lacked a transactional audit. Successful apply batches now write `RETENTION_CLEANUP` with system identity, run/resource UUID, timestamp, policy version and category counts. Audit failure rolls back deletion. Failed/busy runs are observable through fixed structured output, with no exception details or record contents. A database outage cannot guarantee a durable database failure audit.
- Existing privacy projections and tests cover passwords, private chats, minimized email/URL/file evidence, private moderation, scoped notifications and certificate access. This inventory is not a claim of a comprehensive security audit.

## Central retention settings

Source: `backend/src/privacy/retention-policy.js`. No dependencies or migrations added.

| Setting | Default | Limits / meaning |
| --- | --- | --- |
| `RETENTION_ENABLED` | `false` | Exact `true` enables apply and the background worker. |
| `RETENTION_PAUSED` | `false` | Exact `true` disables database apply even if enabled. Use for a broader hold or unresolved dependency review. |
| `RETENTION_BATCH_SIZE` | `100` | 1–500 parent rows per category per run. |
| `RETENTION_INTERVAL_MINUTES` | `60` | 1–1440; no immediate startup purge. |
| `RETENTION_EMAIL_DAYS` | `30` | 1–365 for new records. |
| `RETENTION_URL_DAYS` | `30` | 1–365 for new records. |
| `RETENTION_FILE_DAYS` | `30` | 1–365 for new records. |
| `RETENTION_NOTIFICATION_DAYS` | `90` | 1–365 for new records. |

Chat access remains fixed at 30 days to preserve its notice/contract; approval validity and JWT expiry remain controlled by their existing security policies. Existing stored expiration dates are not rewritten. No blanket historical migration is performed. Configuration is operator-only; restart processes after changing settings.

## Eligibility, concurrency and failures

The runner processes seven explicit categories: approval payload expiry, chats, email analyses, URL analyses, file analyses, notifications and expired session revocations. It selects IDs only, oldest expiry first, and reapplies the eligibility predicate during mutation. Previews return counts up to the batch limit, not record contents/IDs or full-database totals. `batchFull` means additional eligible records may remain.

Every batch uses a PostgreSQL transaction advisory lock shared across processes plus the existing chat/approval locks. It uses serializable isolation, a five-second statement timeout, one-second lock timeout and fifteen-second transaction timeout. A competing worker returns BUSY; in-process ticks cannot overlap. Any mutation/audit/serialization failure rolls back the whole batch and returns FAILED, with retry deferred to the next tick or operator invocation. Successful cleanup is idempotent for data; repeat runs still record their own audit outcome. Shutdown stops scheduling and waits for pending work before disconnecting.

Automatic expiry does not delete users, investigations, events, notes, training, quizzes, certificates, community posts/history, acknowledgements, audit records or AI usage. All analysis links and file attachment links block deletion. HIGH/CRITICAL, incomplete and unclassified analyses remain for review so cleanup cannot lose outstanding escalation. Any reporter incident not CLOSED/FALSE_POSITIVE, or any reporter legal hold, protects that person's chats/analyses and scheduled approval expiry. Notifications additionally respect incident review deadlines. `RESOLVED` is intentionally protected until closed.

There is no generic per-record legal-hold system or administrative hold editor. Existing incident holds are honored; a hold on unrelated material requires pausing database retention globally before proceeding. Authentication and direct approval operations still enforce their short-lived secret lifecycle; pause is not a promise to retain expiring credential material. The policy conservatively retains every session with tool receipts and every analysis referenced by a receipt. Review/backlog removal needs a separately approved dependency plan; do not manually delete receipts to bypass this protection.

The worker does no network analysis and never executes stored input, consumes AI/VT credits, adjusts risk, changes grading or resets spending controls. Cleanup runs outside request handlers; database locks can cause short contention. Category batches bound parent deletions; session message deletion uses the existing cascade. Large backlogs may require many runs. Preview and apply can differ if the database changes between them.

## Operator procedure (approval still required)

1. Keep `RETENTION_ENABLED=false`. Run `npm.cmd run retention:preview` to inspect bounded eligible counts. This reads the database without changing records or writing audits.
2. Review the policy with the responsible owner, including investigations, holds, backups, log sinks and organizational retention decisions. Obtain explicit approval before any real apply. This phase did **not** enable or execute database cleanup on existing records.
3. After approval, set approved retention values and `RETENTION_ENABLED=true` in deployment configuration. For a one-off batch use `npm.cmd run retention:cleanup -- --apply`. Without `--apply` this command only previews. The legacy `chat:purge` command delegates to this same runner with chat-only scope and also defaults to preview.
4. A restarted backend with enabled configuration schedules batches at the configured interval. Do not enable it merely to inspect counts. Set `RETENTION_PAUSED=true` and restart to suspend future database cleanup. Stop running workers before placing a broad external hold; an in-flight transaction must finish or be cancelled through normal operations first.
5. Monitor COMPLETED/FAILED/BUSY/DISABLED and per-category counts. Investigate repeated failures without logging database exception payloads. Never reset the database or remove protected history to make cleanup succeed.
6. Review retained exclusions manually. Account deactivation, incident holds and approved disposition/backup procedures require an authorized operator; no self-service deletion or public retention API exists.

## Audit inventory and 15B follow-up

| Area | Current coverage / follow-up |
| --- | --- |
| Authentication and MFA | Phase 15B persists the allow-listed events detailed below. Authorization denials remain console-only. |
| Incident investigation | Automatic creation now writes `INCIDENT_CREATED` in the creation transaction. Assignment, status and note mutations are transactional; `INCIDENT_VIEWED` and `INCIDENT_NOTES_VIEWED` audit sensitive reads. No separate severity/resolution mutation API is implemented. |
| Training | Creation/update/publication/assignment actions use database audit records. |
| Course/monthly quizzes | Authoring, approval/publication and submission paths use existing event-specific audit helpers. Training assignments are audited separately; monthly participation assignments are created by the attempt workflow. Grading untouched. |
| Certificates | Legitimate issuance writes `TRAINING_CERTIFICATE_ISSUED` transactionally. Eligibility untouched. |
| Community | Submission/moderation writes database audit; internal reason stays in moderation history, not audit payloads. |
| Incident awareness warning | `INCIDENT_AWARENESS_WARNING_PREPARED` records minimal category/training/notice metadata; publication still requires moderation. |
| Notifications | Read transitions audited; routing unchanged. |
| Retention | New transactional system audit for successful apply; fixed operational output for preview, busy, disabled and failed outcomes. |
| Role/user/knowledge administration | No new administrative write workflows introduced. Audit any future sensitive changes alongside their authorization. |

Backups, WAL, filesystem snapshots, console log rotation, host access, provider retention and physical secure erasure are outside this worker. Expiry does not remove old backups. No approved legal retention source was supplied, so no legal compliance conclusion is made.

## Completion validation (2026-10-15)

The complete frontend suite ran first, then the complete backend suite. Paid providers were mocked. Existing-record retention apply was never executed. The new PostgreSQL retention test narrows every mutation to a new synthetic owner and rolls the entire fixture transaction back; existing integration suites clean up their own synthetic records.

| Executed check | Result |
| --- | --- |
| `node --test --test-concurrency=1 frontend/tests/*.mjs` | 254 passed; none failed/skipped. |
| `node --test --test-concurrency=1 backend/tests/*.test.js backend/tests/database.integration.js backend/tests/vector.integration.js` | 534 passed; none failed/skipped. Includes HTTP authentication/MFA/ownership, chat privacy/log sentinels, analyzer minimization, notification routing, training/quiz/certificate/community regression, retention and database/vector checks. |
| Focused retention/chat/approval tests | Passed after correcting a synthetic fixture's five-minute approval TTL. |
| `npm.cmd run lint` | Passed. |
| `npm.cmd run build` | Passed; Vite warns about an existing large bundle. |
| `node --check` on all backend source/script `.js` files | 102 files passed. |
| `npm.cmd run prisma:validate` | Valid. No schema edit required. |
| `npm.cmd run db:status` | Nine migrations present; database up to date. No migration applied. |
| `npm.cmd audit --audit-level=low` | Zero vulnerabilities reported. |
| `npm.cmd run retention:preview` | COMPLETED; zero eligible entries in six categories, batch limit of 100 expired revocations reached. Affected count zero in every category. This is a bounded preview, not a total count. |

No Git commands, live OpenAI/VT calls, database reset, historical migration edits or existing-record retention deletion were performed. No mock application feature was introduced. Browser visual testing was not performed; the only user-visible change is the server-provided privacy notice.

## Files changed

- Configuration/commands: `.env.example`, `package.json`, `backend/src/config/env.js`, `backend/src/server.js`.
- Policy/worker: `backend/src/privacy/retention-policy.js`, `backend/src/privacy/retention-service.js`.
- Operator scripts: `backend/scripts/retention-cleanup.js`, `backend/scripts/purge-expired-chats.js`.
- Expiry creation: `backend/src/analyzers/email/email-submission.js`, `backend/src/analyzers/url/url-analyzer.js`, `backend/src/analyzers/file/file-analyzer.js`, `backend/src/notifications/notification-service.js`.
- Chat notice/legacy cleanup integration: `backend/src/ai/chat-policy.js`, `backend/src/ai/chat-service.js`, `backend/src/ai/tools/approval-service.js`.
- Tests: `backend/tests/retention.test.js`, `backend/tests/retention.integration.test.js`, `backend/tests/chat-api.integration.test.js`, `backend/tests/tool-approvals.test.js`.
- Documentation: `README.md`, `docs/privacy-retention.md`, `docs/openai-chat.md`, `docs/tool-approvals.md`, `docs/file-analyzer.md`, `docs/realtime-notifications.md`.

Phase 15A database changes: **none** (no schema changes or migrations). Existing expiry and dependency fields are reused. Prototype defaults and the explicit apply gate must be reviewed and approved before enabling cleanup.

## Phase 15B review (2026-10-16)

The inventory above describes the Phase 15A baseline; authentication audit coverage is superseded by this section. No new audit store, audit API, schema, migration, retention period, cleanup schedule, or administrator conversation access was introduced.

### Corrected audit gaps and privacy decisions

- Authentication/MFA previously emitted console-only events, sometimes inside transactions before commit. The existing `audit_logs` table now receives fixed uppercase actions, `SUCCESS`/`FAILURE`, database timestamps, nullable trusted actor/resource UUIDs, and empty metadata. No usernames, email addresses, IPs, user agents, request bodies, passwords, TOTP codes, provisioning URIs, secrets, cookies, session identifiers or JWTs are accepted by the authentication audit helper. Unknown actions are rejected. Invalid actor strings become null. Failure details contain no arbitrary text.
- Actions: `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `MFA_ENROLLMENT_STARTED`, `MFA_CHALLENGE_STARTED`, `MFA_START_FAILED`, `MFA_ENROLLMENT_COMPLETED`, `MFA_CHALLENGE_SUCCEEDED`, `MFA_CHALLENGE_FAILED`, `ADMIN_AUTHENTICATION_SUCCEEDED`, `MFA_CANCELLED`, `SESSION_REVOKED`, `LOGOUT`. Password failures are anonymous and retain the identical public response for unknown, invalid and inactive accounts. MFA failure actors are recorded only after a signed challenge resolves to an eligible database user; otherwise they are anonymous. An MFA start success means a challenge was committed, not an authenticated session.
- Ordinary login, challenge creation/verification, cancellation, revocation and logout audits are best-effort and awaited outside mutation transactions. Audit exceptions produce only a fixed `authentication_audit_unavailable` console event and allow-listed action. They do not turn successful authentication/logout into an error. There is no automatic retry queue and an outage or process crash can lose these audit events. Database availability remains necessary for authentication itself; this policy tolerates audit-store failure, not loss of the identity database.
- First-time MFA enablement is a durable administrator security mutation. `MFA_ENROLLMENT_COMPLETED` is required in the same transaction as the secret/counter/enrollment update. Audit failure rolls enrollment back and no success is emitted. Existing transactional administrative audits (incident mutations, training/quiz publication and assignments, certificates, moderation, awareness warning submission) remain fail-closed. Routine subsequent MFA verification remains available if its optional audit fails.
- Automatic incidents previously had a CREATED timeline event but no central creation audit. `INCIDENT_CREATED` now commits atomically with incident/evidence/history/notifications. Its actor is null with `system: AUTOMATED_RISK_ENGINE`, policy version and analyzer type only. The existing source lock and uniqueness boundary prevent retry duplicates. Revocation insertion uses `createMany` with duplicate suppression; only a newly inserted revocation emits `SESSION_REVOKED`. Each logout request can record its own LOGOUT outcome. Separate login/challenge attempts are separate events, not retries of an administrative mutation.
- Existing event names remain unchanged: `TRAINING_CREATED`, `TRAINING_EDIT`, `TRAINING_REVIEW`, `TRAINING_PUBLISH`, `TRAINING_ARCHIVE`, `TRAINING_ASSIGNED`; `COURSE_QUIZ_CREATED`/`EDITED`/`APPROVE`/`PUBLISH`/`SUBMITTED`; corresponding `MONTHLY_QUIZ_*` actions plus `MONTHLY_QUIZ_ARCHIVE`; `TRAINING_CERTIFICATE_ISSUED`; community submission/moderation actions; `INCIDENT_AWARENESS_WARNING_PREPARED`; `NOTIFICATION_READ`. Audit rows remain inaccessible for modification through application APIs. Database/operator permissions remain a separate boundary, not tamper-proof storage.

### Privacy boundaries reviewed

| Area | Verified implementation boundary |
| --- | --- |
| AI conversations and tool recovery | Employee role and owner-scoped conversation/analysis lookups; administrators cannot browse chat APIs. Histories exclude provider payloads and ledger costs. No new access introduced. |
| Email, URL and file analysis | Acknowledgement and employee identity bind submissions; tool reads enforce ownership. Email persistence uses fixed evidence projections; URL normalization strips credentials/path/query data; file storage excludes original filenames and bytes. Incident snapshots expose minimized evidence. |
| Incidents | Reporter-only employee queries, restricted timeline fields and REPORTER notes; SECURITY_TEAM notes and sensitive investigation reads restricted to administrators. Mutations retain version checks and transactional audits. |
| Notifications | Recipient, role, expiry and current incident ownership scope HTTP reads. Sockets recheck sessions and use payload-free invalidation signals. Read marking is scoped and idempotent. |
| Training/quizzes | Employee assignment/attempt ownership; unpublished content and answer keys withheld before submission. Own submitted review intentionally includes correct answers/explanations. Administrator results remain MFA-protected. No grading changes. |
| Certificates | Own detail/PDF; MFA administrator list, verification and download. Issuance eligibility, uniqueness and audit transaction preserved. |
| Community | Only approved posts in feed; own submissions omit internal moderation reasons. Administrator moderation history remains private and changes remain transactional. |
| Dashboard/analytics | MFA administrator access, bounded operational summaries and aggregates; no chat/raw analyzer submissions. Existing small-group suppression retained. |

No additional cross-user disclosure was confirmed in these reviewed paths. The privacy correction is the minimized persistent audit boundary; this review does not claim exhaustive security verification. Existing regression tests exercise cross-user denial, MFA, chat privacy, private notes, quiz disclosure, certificate access and socket recipient isolation. Phase 15B adds audit confidentiality/outcome/failure tests, transactional incident rollback/retry assertions and a cross-route administrator access matrix.

### Retention integration and remaining limitations

Cleanup remains disabled by default and preview remains read-only, including no audit writes. Apply still requires the existing explicit enable/apply gates. Successful batches require transactional `RETENTION_CLEANUP` audits; failed batches roll back and return fixed FAILED output without exception details or false success. Preview/BUSY/DISABLED/FAILED operational output is intentionally not a new durable audit stream. No existing-record cleanup or retention configuration change was performed for Phase 15B.

Legal holds, active/protected investigations, dependent analyses/tool receipts, training history, quiz attempts, certificates and AI billing ledgers retain Phase 15A safeguards. Audit review dates do not authorize automatic audit deletion. Existing retention tests cover disabled configuration, preview, holds, dependencies and rollback.

Remaining limitations: optional authentication audits can be lost during store outages; rate-limiter/origin/parser rejections and general authorization denials are not newly persisted as authentication audits. Expired encrypted MFA challenge remnants can remain until replacement/cancellation; no background credential cleanup was added. Free text may contain sensitive data despite notices/redaction. Hashes/hostnames can identify material, aggregate differencing remains possible, and backup/log/provider/host retention needs organizational decisions. Broader hardening belongs in a separately authorized Phase 16. No legal PDPL compliance conclusion is made.

### Phase 15B validation and completion

| Executed check | Result |
| --- | --- |
| Focused auth audit/auth/MFA/incident/retention run | 56 passed before the additional cross-route matrix was added. |
| Full backend regression: `node --test --test-concurrency=1 backend/tests/*.test.js backend/tests/database.integration.js backend/tests/vector.integration.js` | 542 tests executed: 540 passed, one stale console-event assertion failed along with its parent test. Updated that assertion to require the persistent login audit and scan both audit/log content for secrets. The affected email integration suite then passed all 17 tests. Full backend suite was not repeated. The new administrator route matrix passed in the full run. |
| Full frontend regression, run after backend: `node --test --test-concurrency=1 frontend/tests/*.mjs` | 254 passed, no failures/skips. |
| `npm.cmd run lint` / `npm.cmd run build` | Passed. Existing large-bundle warning remains. |
| `node --check` for all backend source/script JavaScript | 103 files passed. |
| `npm.cmd run prisma:validate` / `npm.cmd run db:status` | Valid; nine migrations, database up to date. No migration applied. |
| `npm.cmd audit --audit-level=low` | Zero vulnerabilities reported. |
| `npm.cmd run retention:preview` | COMPLETED, all affected counts zero. Six categories had zero eligible rows; expired revocations reached the bounded preview limit of 100. |

Important changed files: `backend/src/auth/auth-audit.js`, `backend/src/auth/mfa-service.js`, `backend/src/auth/session.js`, `backend/src/routes/auth.js`, `backend/src/incidents/incident-engine.js`; audit/auth/MFA/incident/email integration tests; this document. No frontend source changes, schema changes, migrations, new dependencies, Git commands or paid-provider calls. Tests use synthetic fixtures; retention integration mutations are restricted to synthetic records and rolled back. HTTP integration tests start the backend; no separate visual browser review was necessary for these backend-only changes.

Phase 15B is complete, completing Phase 15 with the documented limitations. Phase 9 RAG and Phase 13D remain postponed. Next recommended phase: **Phase 16 — Security hardening**, subject to a separate instruction.
