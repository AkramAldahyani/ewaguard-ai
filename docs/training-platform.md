# Phase 11A — Training platform foundation

Phase 11A1 implements the training backend, and Phase 11A2 connects administrator and employee interfaces. Phase 11B1 adds the secure course-quiz backend, and Phase 11B2 connects administrator and employee quiz interfaces. Phase 11C1 adds the independent monthly-quiz backend, and Phase 11C2 connects administrator and employee monthly-quiz interfaces. Phase 11D1 adds certificate issuance, PDF generation, and protected APIs; Phase 11D2 connects employee and administrator certificate interfaces. AI content generation and awareness analytics are not implemented.

## Storage and lifecycle

The existing `TrainingProgram`, `TrainingAssignment`, and `TrainingProgress` Prisma models are reused without schema or migration changes. No seed/demo courses are installed. Test content is synthetic and removed with its test fixtures.

Programs begin as human-authored drafts. Administrators edit complete drafts, explicitly review the current version, then publish. Editing clears the review and increments the version. Publication requires review. Published content, objectives, and completion requirements cannot be edited. Archive is terminal: existing assignment/progress records remain available, but new assignments and progress writes are rejected. Employees receive archived summaries and progress without the archived content. Revoked assignments are inaccessible to employees and cannot be silently reactivated.

All program mutations require `expectedUpdatedAt` copied from the latest detail response. A stale value returns HTTP 409 `TRAINING_STALE`; reload before retrying. Row locks serialize lifecycle, assignment, and progress operations. Assignment uniqueness also has the existing database constraint. Audit records are committed in the same transaction as administrator mutations, and contain identifiers/version metadata rather than course bodies.

## Content contract

Create/edit accepts exactly: `title`, `description`, `topic`, `learningObjectives`, `estimatedMinutes`, `requiresQuiz`, and `content` (plus `expectedUpdatedAt` for edits).

- Title: 1–200 characters; description: 1–2,000.
- Objectives: 1–8 plain-text strings of at most 240 characters.
- Estimated duration: integer 1–60 minutes; approximately 5–8 is recommended.
- Topics: `PHISHING`, `SOCIAL_ENGINEERING`, `PASSWORD_SECURITY`, `MFA`, `MALWARE`, `SAFE_BROWSING`, `USB_SECURITY`, `PHYSICAL_SECURITY`, `INFORMATION_HANDLING`, `INCIDENT_REPORTING`, `OTHER`.
- Content: `{ "version": 1, "sections": [{ "key": "introduction", "title": "Introduction", "body": "Plain text." }, ...] }`.
- Provide 2–16 sections. Keys are unique lowercase slugs, starting with a letter, at most 40 characters. Section titles are at most 120 characters; bodies at most 6,000. Total serialized content is bounded at 40,000 characters, and HTTP JSON at 64 KiB.
- HTML angle brackets and unsafe control characters are rejected. Content is plain text, never HTML or executable Markdown. The future UI must render React text nodes, never raw HTML. Unknown fields are rejected.

Sections can represent introduction, relevance, examples, warning signs, recommended/avoided actions, a scenario, and takeaways. No organizational policy is invented or automatically supplied.

## Authenticated endpoints

All endpoints use existing cookie authentication, current server-side role checks, administrator MFA where applicable, trusted-origin controls, no-store responses, and per-user rate limits (120 requests/minute; writes additionally 60/minute). No credentials are accepted in payloads or URLs.

Administrator (`IT_SECURITY_ADMIN`, verified MFA):

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/api/admin/training` | List / create draft |
| GET | `/api/admin/training/employees` | Eligible active employees, minimal identity fields |
| GET | `/api/admin/training/:programId` | Content, metadata and minimal author/reviewer identities |
| POST | `/api/admin/training/:programId/edit` | Replace draft content; invalidate review |
| POST | `/api/admin/training/:programId/review` | Explicit approval of current draft |
| POST | `/api/admin/training/:programId/publish` | Publish reviewed draft |
| POST | `/api/admin/training/:programId/archive` | Retain history and stop learning/assignments |
| GET / POST | `/api/admin/training/:programId/assignments` | Progress report / assign `{ employeeId }` |

Review/publish/archive bodies contain only `expectedUpdatedAt`. Assignment returns `{ assignment, alreadyAssigned }`; repeated active assignments return the same record and do not generate duplicate progress or audit entries. There is no bulk assignment or reassignment endpoint. An administrator may review their own draft; separate-reviewer policy is not imposed in this phase.

Employee (`EMPLOYEE`):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/training` | Own non-revoked assignments |
| GET | `/api/training/:assignmentId` | Own eligible content and persisted progress |
| POST | `/api/training/:assignmentId/start` | Explicit start, body `{}` |
| POST | `/api/training/:assignmentId/sections` | Acknowledge `{ sectionKey, acknowledged: true }` |

Employee detail returns `{ assignment, contentAvailable, completionRequirement }`. Assignment includes training summary and progress. Published details additionally include learning objectives/content. Employee responses omit creator/reviewer identities, other employees, audit metadata, quiz attempts, and answers. Missing and foreign assignment IDs both return 404.

Lists use `page` (1–1,000), `pageSize` (1–50, default 20) and return `{ items, page, pageSize, hasMore }`. Program lists support `search` (title/description, max 100), `topic`, publication `status`, and `sort=created_desc|title_asc`. Sorting applies to the full result before pagination, with ID tie-breaks. Employee lookup supports `search`; assignment lists support progress `status=NOT_STARTED|IN_PROGRESS|COMPLETED`. Existing foreign-key/status/topic indexes are reused; text search is bounded but has no new full-text index.

## Progress and future quiz compatibility

GET does not start or complete a course. Explicit start sets IN_PROGRESS and timestamps. Section acknowledgements must follow the published section order; unknown keys, skips, client percentages/statuses, and forged completion fields are rejected. Concurrent/retried acknowledgements of the same section are idempotent. Refreshing/resuming reads the stored section keys; the next checkpoint is the first section absent from `completedSectionKeys`.

The server derives percentage from acknowledged sections. After all sections, it sets `materialCompletedAt` and 100% material progress. For `requiresQuiz: true`, status remains IN_PROGRESS and `completedAt` remains null. No quiz-result or final-completion endpoint exists in 11A1. For explicitly configured `requiresQuiz: false`, all sections satisfy the material-only completion rule and status becomes COMPLETED. Existing database quiz/completion constraints remain intact.

Acknowledgements demonstrate completion of the application workflow, not attention, elapsed reading time, or comprehension. The system cannot prevent an assigned employee from quickly acknowledging sections in order. Quiz-based assessment is deferred to 11B; courses requiring it cannot prematurely receive final completion or certificates.

## Verification and handoff

`backend/tests/training.integration.test.js` exercises real local PostgreSQL with synthetic scoped fixtures and authenticated HTTP: RBAC/MFA/origin, lifecycle/review/stale edits, XSS validation, assignment eligibility/concurrency, ownership, persisted sequential progress, completion gates, pagination/report minimization, archival, and audit rollback. Existing regression suites cover session expiry/revocation and incident/Socket.IO/AI behavior with mocked external services.

Phase 11A2 replaces the employee training placeholder and adds administrator training routes. Administrators can filter and page programs; create and edit structured plain-text drafts; add, remove, and reorder sections; preview; explicitly review and publish; archive; search eligible employees; assign individually; and inspect paginated progress. The editor sends the displayed `expectedUpdatedAt`; on a stale conflict it preserves unsaved text, reloads the latest server record, and requires an explicit discard before another edit attempt. Meaningful lifecycle changes use confirmation dialogs.

Employees can filter and page assigned courses, start or resume the server-recorded position, navigate sections, acknowledge them in order, and refresh progress. Archived assignments show saved progress without archived content or write controls. Material completion with `requiresQuiz: true` clearly remains IN_PROGRESS; the UI provides no quiz or certificate shortcut. All course text is rendered as React text nodes. Training requests use the existing credentialed API utility and keep protected data in component memory only.

The frontend adds interaction tests with mocked APIs for creation, section editing and preview, review/publish/archive, assignment and duplicates, stale edit recovery, employee start/acknowledgement and quiz gating, pagination/filtering, archived data, loading/error/empty states, and authorization/MFA failures. No browser visual verification is claimed without an authenticated browser session.

Phase 11A2 validation: the complete frontend suite passed 188 tests and the complete backend suite passed 435 tests. Lint, production build, backend syntax checks, Prisma validation, and migration status passed; all nine existing migrations are current. The dependency audit found zero vulnerabilities. The existing production bundle-size warning remains. No training schema, migration, or backend changes were needed in 11A2.

## Phase 11B1 course quiz API

The existing `Quiz`, `TrainingQuiz`, `QuizQuestion`, `QuizOption`, `QuizAttempt`, and `QuizAnswer` tables and database integrity triggers are reused. No schema change is required. One quiz binds to each quiz-required training program. A draft may be created while its program is draft or published; publication requires the program to be published. Published quiz content and historical submitted attempts cannot be edited.

Administrator endpoints under `/api/admin/training/:programId/quiz`:

| Method | Relative path | Behavior |
| --- | --- | --- |
| GET | `/` | Quiz metadata and full authoring preview, or `quiz: null` |
| POST | `/` | Create human-authored draft with `title`, `passingPercent`, `maxAttempts`, and ordered `questions` |
| POST | `/edit` | Replace draft question set with the same shape plus `expectedUpdatedAt` |
| POST | `/approve` | Explicitly approve the validated draft with `expectedUpdatedAt` |
| POST | `/publish` | Publish the approved quiz with `expectedUpdatedAt` |
| GET | `/attempts?page=&pageSize=` | Paged minimal employee identities and attempt scores |

Each question has `text`, `type` (`MULTIPLE_CHOICE` or `TRUE_FALSE`), `explanation`, integer `points`, and ordered `options` with `text` and one `isCorrect: true`. True/false options must be `True` and `False`. Input is bounded plain text without HTML. A complete draft replacement provides add, edit, remove, and reorder semantics. Approval and publishing use database validation in addition to request validation. Stale edits return `TRAINING_STALE` (409); lifecycle conflicts return `QUIZ_CONFLICT` (409).

Employee endpoints under `/api/training/:assignmentId/quiz`:

| Method | Relative path | Behavior |
| --- | --- | --- |
| GET | `/` | Availability reason, remaining attempts, attempt summaries, and answer-free quiz when eligible |
| POST | `/attempts` | Start or resume a permitted attempt, body `{}` |
| POST | `/attempts/:attemptId/submit` | Submit `{ "answers": [{ "questionId": "uuid", "selectedOptionId": "uuid" }] }` |
| GET | `/attempts/:attemptId` | Own submitted result and permitted explanations/correct options |

Only an active assignment owner with completed reading may start a published quiz. Opening the quiz does not start or pass it. Submissions require one valid option for every question and are scored in the database transaction, with weighted points, a snapshot passing threshold, and an immutable submitted result. Retrying the same submission returns the stored result; different answers for a submitted attempt return 409. Passing updates `TrainingProgress` to `COMPLETED` with the qualifying attempt in the same transaction. Failed attempts leave progress `IN_PROGRESS`; the configured attempt limit is enforced under an assignment row lock. Archived programs stop new starts/submissions while retaining authorized result review. Pre-submission employee responses never include answer keys or explanations. All routes retain cookie authentication, employee ownership or administrator MFA/RBAC, origin checks, rate limits, bounded JSON, and `Cache-Control: no-store`.

## Phase 11B2 interfaces

The administrator program workspace now includes a Course quiz tab for quiz-required programs. It supports bounded draft authoring, multiple-choice and true/false options, question and option editing, question reordering/removal, passing thresholds, attempt limits, answer-key preview, explicit approval/publication dialogs, and paginated attempt scores. Approved and published content is read-only. The tab preserves its unsaved draft when switching course views. A stale-edit conflict keeps unsaved questions visible, retrieves the latest quiz separately, and requires explicit discard before further writes.

The employee course reader now embeds an assessment panel for quiz-required assignments. It shows reading prerequisites or publication unavailability, starts/resumes permitted attempts, preserves unsent choices while navigating questions, allows answer review and confirmation before submission, and displays server-scored results, permitted explanations, attempt history and remaining-attempt messaging. A passing result refreshes server-authoritative training progress. Correct answers and explanations are rendered only after an authorized submitted-result response. All content is rendered as React text, and protected quiz data stays in component memory rather than browser storage.

## Phase 11C1 independent monthly quiz API

Monthly quizzes use the existing `Quiz(kind=MONTHLY)`, `MonthlyQuiz`, `MonthlyQuizAssignment`, question, option, attempt, and answer models. There is exactly one quiz record for each UTC calendar month (`YYYY-MM`) in this organization. The period is immutable, including after archive; replacement publication and version swapping are not supported. The database's unique period constraint and immutable published/attempted-content triggers preserve history. No schema change or migration is needed.

Publication makes the quiz available organization-wide to active authenticated employees. A monthly assignment is created once when an employee first starts; its `assignedById` refers to the quiz creator as publication authority. This avoids pre-creating records for employees who never participate. Administrators explicitly approve a saved draft before publishing. The configured opening and closing timestamps must fall in the selected UTC month, with a closing time at or before the first instant of the next month. Publication is refused after the deadline. `UNPUBLISHED`, `OPEN`, `UPCOMING`, `CLOSED`, and `ARCHIVED` are computed availability states; the stored quiz lifecycle is `DRAFT`, `APPROVED`, `PUBLISHED`, or `ARCHIVED`. Closing occurs at the deadline without mutating the record. New attempts and unsubmitted attempts cannot be submitted once closed or archived; submitted results remain reviewable by their owners.

Administrator endpoints under `/api/admin/monthly-quizzes`:

| Method | Relative path | Behavior |
| --- | --- | --- |
| GET | `/` | Paginated search/filter (`period`, `status`, `search`, `sort=period_desc|period_asc`) |
| POST | `/` | Create draft `{ period, opensAt, closesAt, title, passingPercent, maxAttempts, questions }` |
| GET | `/:id` | Full administrator quiz preview, topics, policy, window, and lifecycle |
| POST | `/:id/edit` | Replace draft questions and window with create shape excluding `period`, plus `expectedUpdatedAt` |
| POST | `/:id/approve` | Explicit content approval with `expectedUpdatedAt` |
| POST | `/:id/publish` | Publish approved quiz with `expectedUpdatedAt` |
| POST | `/:id/archive` | Archive with `expectedUpdatedAt`; preserve attempts and results |
| GET | `/:id/report` | Paginated minimal employee attempt scores and participation counts |

Each question includes `text`, `type` (`MULTIPLE_CHOICE` or `TRUE_FALSE`), `topic` (an approved training topic), `explanation`, integer `points`, and ordered `{ text, isCorrect }` options. The same bounded plain-text validation and one-correct-answer rule as course quizzes apply. Reports distinguish employees who started from employees who submitted and show the current active-employee population only as a present-time context, not a historical denominator.

Employee endpoints under `/api/monthly-quizzes`:

| Method | Relative path | Behavior |
| --- | --- | --- |
| GET | `/` | Paginated published quizzes and own attempted archived quizzes, with availability and best score |
| GET | `/history` | Paginated own month-by-month submitted results |
| GET | `/:id` | Open quiz questions without answers/explanations, plus own attempt summaries |
| POST | `/:id/attempts` | Start or resume an attempt, body `{}` |
| POST | `/:id/attempts/:attemptId/submit` | Submit `{ "answers": [{ "questionId": "uuid", "selectedOptionId": "uuid" }] }` |
| GET | `/:id/attempts/:attemptId` | Review own submitted result and permitted explanations |

The database scores weighted points transactionally. Assignment, attempt identity, every question and option, window, status, and attempt limit are checked server-side. The same answer submission is idempotent, while altered retries conflict. Monthly attempts never set `TrainingProgress` or course completion. The month-by-month representative score is the **highest submitted percentage** in that month; a tie selects the earliest attempt. The history delta compares that score with the preceding **recorded** month, which may be more than one calendar month earlier. No trend is invented for the oldest recorded month. Employee APIs omit answer keys before submission and never return another employee's attempts. Existing cookie authentication, employee ownership, administrator MFA/RBAC, origin checks, per-user rate limits, no-store responses, and minimized audit metadata apply.

## Phase 11C2 monthly quiz interfaces

The administrator navigation opens a paginated monthly quiz queue with title search, month and lifecycle filters, and server-wide period sorting. The detail workspace provides draft scheduling in UTC, topic-tagged multiple-choice and true/false question editing, answer-key preview, explicit approval/publication, archiving, and a paginated participation report. An edit uses the saved quiz `updatedAt`; a stale conflict blocks submission and preserves the local draft until the administrator explicitly loads the latest version. Only one record is permitted per UTC calendar month. Closing is determined by the saved schedule; there is no separate close operation.

The employee route lists available months, their window and attempt availability, and separate month-by-month history. An eligible employee can start or resume an in-progress attempt, navigate questions with unsent choices held in page state, review selections, confirm submission, and view the server-scored result and previous attempts. Unsent choices are not persisted across reloads. The history displays the backend-selected best submitted attempt and its percentage-point delta from the previous recorded month. These monthly results do not change course progress. All requests use the existing cookie-authenticated client; no answers or results are stored in localStorage.

Validation executed for this subphase: 435 backend tests (including 12 training tests), 173 frontend regression tests, and 27 database invariant tests passed. Lint, production build, backend syntax checks (including all new modules), and Prisma validation passed. Migration status reported all nine existing migrations current; dependency audit reported zero vulnerabilities. The production build retains its existing large-bundle warning. No Git commands, paid API calls, database resets, schema changes, or migration rewrites were performed. A separate master development specification was not found in the repository; implementation follows AGENTS.md, existing architecture documents, and the phase requirements.

## Phase 11D1 certificate backend

The existing `Certificate` model is reused. Material-only completion and passing course-quiz submission issue a certificate in the same locked database transaction as the authoritative progress update. The unique progress relation prevents duplicate issuance; the number is a random UUID. Failed course quizzes and independent monthly quizzes never issue certificates. An employee's first certificate-list request reconciles valid historical completions using the same lock order and eligibility checks. The certificate stores name, course title, completion date, issue date, and optional qualifying quiz score as historical snapshots. It is not linked to a public sharing portal.

Protected routes are `GET /api/certificates`, `GET /api/certificates/:id`, and `GET /api/certificates/:id/pdf` for employees, plus the corresponding administrator routes under `/api/admin/certificates` and `GET /api/admin/certificates/verify/:number`. Administrator routes require an active administrator session with verified MFA. Employee detail and PDF lookups require ownership and return the same not-found response for foreign IDs. All routes use trusted-origin checks, rate limits, and private no-store responses. Administrator search supports bounded name/title or exact certificate-number lookup and issuance status filtering. Verification is authenticated and reports stored completion metadata without public disclosure.

PDFKit renders a landscape A4 certificate from bounded plain text and the existing EWAGuard AI logo, with an optional `CERTIFICATE_ORGANIZATION_NAME` environment value. PDFs are generated in memory on authorized download, and response headers are set only after generation succeeds. The server does not claim that downloading succeeded merely because issuance succeeded.

## Phase 11D2 certificate interfaces

The employee certificate route lists paginated earned records, explains material-only and quiz-required eligibility, opens a private detail view, and downloads PDFs through a cookie-authenticated Blob request. Empty, loading, retry, denied, expired-session, and download-failure states are explicit. Completed training detail pages consult the employee certificate list and link to a specific certificate only after the backend returns an issued record for that course. The list request also reconciles eligible historical completions. Monthly quiz results do not participate.

Administrators have a dedicated certificate route and navigation entry. The list uses the supported server-side name/title/exact-number search, status filter, and pagination; the backend orders newest first and accepts no sort parameter. A private verification form checks a unique number and shows the server's completion confirmation. Authorized detail views can reverify and download. Role and MFA checks remain on the backend. Private records and PDFs stay in component memory or temporary browser Blob URLs; the URLs are revoked after download or unmount. No public sharing or client-side issuance is present.

Phase 11D2 validation: 214 frontend regression tests and 452 backend regression tests passed. Lint, production build, backend syntax checks, Prisma validation, migration status, and dependency audit passed. All nine migrations remain current, and the audit found zero vulnerabilities. The existing large-bundle build warning remains. Browser screenshot and PDF visual inspection were not performed in this subphase; the backend's PDF structure and response checks were established in 11D1.

## Training Content Phase TC1

The first production course, Phishing Awareness, is provisioned as a draft through the existing services (see `docs/training-phishing-awareness.md`). The reader now displays plain-text lesson conventions (paragraphs, `- ` bullets, `1. ` steps, and `Key takeaway:` / `Example:` / `Watch out:` / `Tip:` callouts) as React text nodes. The content contract and validation are unchanged. The course overview appears with the first section and shows the section count, duration and quiz requirement. The employee quiz-detail response now includes the published quiz's `passingPercent` (or `null`), and the quiz panel displays it. No schema, migration, scoring, attempt, completion or certificate rules changed.

## Training Content Phase TC2

Safe Browsing and Data Privacy are provisioned as drafts with the same services and renderer (see `docs/training-safe-browsing-data-privacy.md`). Provisioning now uses one script and a course registry: `backend/scripts/provision-training-course.js` and `backend/src/training/content/index.js`. `backend/tests/training-content.integration.test.js` covers all three courses. No platform, schema or UI behaviour changed.

## Training Content Phase TC3

Physical Security (`PHYSICAL_SECURITY`) and Reporting Security Incidents (`INCIDENT_REPORTING`) are registered in the content registry and provisioned as drafts (see `docs/training-physical-security-incident-reporting.md`). The shared content test also checks that certificates are not duplicated and that program-filtered Awareness Analytics counts are correct for every course. No platform, schema or UI behaviour changed.

## Training Content Phase TC4 and the seven-course catalogue

Secure Remote Work and Responsible AI complete the planned catalogue (see `docs/training-secure-remote-work-responsible-ai.md`). All seven courses are registered in `backend/src/training/content/index.js` and can be provisioned with `npm run training:provision -- --course all --admin-email <administrator email>`.

In the local development database, all seven exist as **drafts with draft quizzes (80% to pass, 3 attempts)**. None is reviewed, published or assigned. Employees see a course only after an administrator reviews and publishes it, approves and publishes its quiz, and assigns them.

| Phase | Course | Topic | State (local dev DB) | Documentation |
| --- | --- | --- | --- | --- |
| TC1 | Phishing Awareness | `PHISHING` | Draft | `docs/training-phishing-awareness.md` |
| TC2 | Safe Browsing | `SAFE_BROWSING` | Draft | `docs/training-safe-browsing-data-privacy.md` |
| TC2 | Data Privacy | `INFORMATION_HANDLING` | Draft | `docs/training-safe-browsing-data-privacy.md` |
| TC3 | Physical Security | `PHYSICAL_SECURITY` | Draft | `docs/training-physical-security-incident-reporting.md` |
| TC3 | Reporting Security Incidents | `INCIDENT_REPORTING` | Draft | `docs/training-physical-security-incident-reporting.md` |
| TC4 | Secure Remote Work | `OTHER` | Draft | `docs/training-secure-remote-work-responsible-ai.md` |
| TC4 | Responsible AI | `OTHER` | Draft | `docs/training-secure-remote-work-responsible-ai.md` |

The shared content test uses fresh synthetic actors for each course, so the seven full flows stay within the existing per-user training rate limits. No platform, schema or UI behaviour changed in TC4.
