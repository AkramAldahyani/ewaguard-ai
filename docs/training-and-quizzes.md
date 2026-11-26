# Training, quizzes and certificates

## In short

EWAGuard AI includes a small security-awareness learning system:

- **Courses**: short text lessons (about 5–9 minutes) that administrators write, review, publish and assign.
- **Course quizzes**: a quiz at the end of a course. Passing it completes the course.
- **Certificates**: issued automatically when a course is legitimately completed.
- **Monthly quizzes**: a separate quiz each month for all employees, to keep knowledge fresh and show trends.

```text
Admin writes draft → reviews → publishes → assigns employees
Employee starts → reads each section in order → takes quiz → passes
   → course COMPLETED → certificate issued → analytics updated
```

Seven ready-made courses are described in [training courses](training-courses.md);
twelve monthly quizzes are in the [monthly quiz answer key](monthly-cybersecurity-quizzes-2026-2027.md).

## Courses

### Life cycle

```text
DRAFT ──review──► reviewed DRAFT ──publish──► PUBLISHED ──archive──► ARCHIVED
  ▲                    │
  └──── any edit clears the review
```

- Any edit clears the review and increases the version. Publishing requires a review.
- Published content cannot be edited. To change it, create a new course.
- Archiving keeps existing assignments and progress visible but stops new assignments and progress.
- An administrator may review their own draft (no separate-reviewer rule yet).

### Content rules

| Field | Rule |
| --- | --- |
| Title / description | 1–200 / 1–2,000 characters |
| Learning objectives | 1–8, up to 240 characters each |
| Estimated time | 1–60 minutes (5–8 recommended) |
| Topic | PHISHING, SOCIAL_ENGINEERING, PASSWORD_SECURITY, MFA, MALWARE, SAFE_BROWSING, USB_SECURITY, PHYSICAL_SECURITY, INFORMATION_HANDLING, INCIDENT_REPORTING, OTHER |
| Sections | 2–16, each with a unique key, title (≤120) and body (≤6,000); total ≤40,000 characters |
| Quiz required | yes / no |

Content is **plain text only**; HTML is rejected. The reader turns a few simple
conventions into formatting (always as safe React text):

- a blank line starts a new paragraph;
- lines starting with `- ` become bullets, `1. ` numbered steps;
- a short line ending in `:` above a list becomes its heading;
- paragraphs starting with `Key takeaway:`, `Example:`, `Watch out:` or `Tip:` become highlighted boxes.

### Assigning

- One employee at a time, selected employees (up to 200), or **all active employees**. The course must be published.
- Assigning the same person twice changes nothing. Revoked assignments are never reactivated.
- Employees who join later are not added automatically; run "assign to all" again.

### Progress

- Opening a course does **not** start or complete it. The employee presses **Start**.
- Sections must be acknowledged **in order** ("I have read this section"). The server calculates the percentage; the browser cannot send its own.
- After the last section, the material is complete. If the course has a quiz, it stays **IN_PROGRESS** until the quiz is passed. Without a quiz it becomes **COMPLETED**.
- Progress is saved on the server, so the employee resumes after a refresh or on another device.
- Acknowledging sections proves the steps were done, not that the material was understood. The quiz is the comprehension check.

## Course quizzes

- One quiz per quiz-required course. Questions are **multiple choice** or **true/false**, each with an explanation and points.
- Life cycle: DRAFT → APPROVED → PUBLISHED. A quiz can be published only after its course is published. Published quizzes cannot be edited.
- Default settings: **80% to pass, 3 attempts**.
- The quiz opens only after all sections are read.
- **Scoring happens on the server** inside a database transaction. The answer key and explanations are never sent before submission.
- Submitting the same answers again returns the same result; different answers for an already submitted attempt are rejected.
- Passing marks the course COMPLETED and issues the certificate in the same transaction. Failing leaves it IN_PROGRESS (if attempts remain).

## Certificates

- Issued only when a course is legitimately completed (all material read and, if required, the quiz passed), in the same locked transaction. A course can produce **only one** certificate per assignment.
- The certificate number is a random UUID. It stores snapshots of the name, course title, completion date, issue date and quiz score.
- PDFs are generated with **PDFKit** on demand (landscape A4 with the EWAGuard AI logo; optional `CERTIFICATE_ORGANIZATION_NAME`). They are not stored.
- Employees can see and download **only their own** certificates. Administrators (with MFA) can list, search, verify a number and download.
- Monthly quizzes never issue certificates.

## Monthly quizzes

- **One quiz per calendar month** (UTC), available to **all active employees** once published; no individual assignment is needed. An employee's record is created the first time they start.
- Life cycle: DRAFT → APPROVED → PUBLISHED → (optional) ARCHIVED. Publishing is manual and refused after the month's closing time.
- Shown to employees as **Upcoming**, **Open** or **Closed** depending on the opening and closing times. Drafts are invisible.
- Each question has a **topic** tag used by awareness analytics.
- Scoring, answer secrecy and retries work the same way as course quizzes. Monthly results never change course progress.
- **History**: for each month, the employee's **best** score, and the change in percentage points from their previous recorded month. No trend is shown for the oldest month, and no improvement is claimed that the data does not show.

## AI-written content

AI may help draft content in the future, but nothing becomes visible to
employees without an administrator reviewing, editing, approving and publishing
it. The provided courses and quizzes were written by people (`origin: HUMAN`).

## Ready-made content (development provisioning)

```bash
npm run training:provision -- --course all --admin-email <admin email>          # 7 courses + quizzes
npm run training:provision -- --course phishing-awareness --admin-email <admin email>
npm run monthly:provision -- --period all --admin-email <admin email>           # 12 monthly quizzes
npm run monthly:provision -- --period 2027-03 --admin-email <admin email>
```

These commands:

- refuse to run in production;
- require an active administrator with MFA, recorded as the author;
- go through the normal services (same validation and audit records);
- skip anything that already exists (matched by course title or quiz month);
- only create **drafts**: they never review, publish or assign.

After provisioning, an administrator must review and publish each course, approve
and publish its quiz, assign employees, and publish each monthly quiz before its
month ends.

## API summary

| Area | Administrator (MFA) | Employee |
| --- | --- | --- |
| Courses | `/api/admin/training` (list, create, edit, review, publish, archive, assignments, bulk assignments) | `/api/training` (my assignments, details, start, acknowledge section) |
| Course quiz | `/api/admin/training/:programId/quiz` (create, edit, approve, publish, attempts) | `/api/training/:assignmentId/quiz` (view, start, submit, result) |
| Monthly quizzes | `/api/admin/monthly-quizzes` (list, create, edit, approve, publish, archive, report) | `/api/monthly-quizzes` (list, history, view, start, submit, result) |
| Certificates | `/api/admin/certificates` (list, detail, PDF, verify by number) | `/api/certificates` (mine, detail, PDF) |

- Every change includes `expectedUpdatedAt`; stale edits return 409 and the editor keeps unsaved text until the administrator chooses to reload.
- Limits: 120 requests per minute per user, 60 writes per minute. Responses are `no-store`.
- Audit events include `TRAINING_CREATED`, `TRAINING_EDIT`, `TRAINING_REVIEW`, `TRAINING_PUBLISH`, `TRAINING_ARCHIVE`, `TRAINING_ASSIGNED`, `COURSE_QUIZ_*`, `MONTHLY_QUIZ_*` and `TRAINING_CERTIFICATE_ISSUED`. They contain IDs and versions, not course text.

## Code and tests

- Backend: `backend/src/training/`, `backend/src/certificates/`, `backend/src/routes/training.js`, `monthly-quizzes.js`, `certificates.js`
- Content: `backend/src/training/content/`
- Frontend: `frontend/src/features/training/`, `monthly-quizzes/`, `certificates/`
- Tests: `backend/tests/training*.test.js`, `course-quiz.integration.test.js`, `monthly-quiz*.test.js`, `certificate-pdf.test.js`, and the matching `frontend/tests/*-ui.test.mjs`. Monthly quiz tests pin their clock to unused years (2093/2094) so they never touch real months.
