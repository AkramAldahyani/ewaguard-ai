# Phase 11A — Training platform foundation

Phase 11A1 implements the training backend, and Phase 11A2 connects administrator and employee interfaces. Phase 11B1 adds the secure course-quiz backend, and Phase 11B2 connects administrator and employee quiz interfaces. Certificates, monthly quizzes, AI content generation, and awareness analytics are not implemented.

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

Validation executed for this subphase: 435 backend tests (including 12 training tests), 173 frontend regression tests, and 27 database invariant tests passed. Lint, production build, backend syntax checks (including all new modules), and Prisma validation passed. Migration status reported all nine existing migrations current; dependency audit reported zero vulnerabilities. The production build retains its existing large-bundle warning. No Git commands, paid API calls, database resets, schema changes, or migration rewrites were performed. A separate master development specification was not found in the repository; implementation follows AGENTS.md, existing architecture documents, and the phase requirements.
