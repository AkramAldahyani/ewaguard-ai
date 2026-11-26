# Database

## In short

All data lives in one PostgreSQL database (`ewaguard_ai` locally). The backend
talks to it through **Prisma**. The schema is in `backend/prisma/schema.prisma`
and every change is a reviewed SQL migration in `backend/prisma/migrations/`.

The database does more than store data: it also enforces many rules itself
(for example "a certificate needs a passed quiz"), so a bug in the application
cannot easily create impossible records.

## What is stored

| Area | Tables | Plain explanation |
| --- | --- | --- |
| People | `roles`, `departments`, `users` | Each user has one role (EMPLOYEE or IT_SECURITY_ADMIN) and usually a department. Passwords are stored only as bcrypt hashes; MFA secrets are encrypted. |
| Sessions | `revoked_sessions` | IDs of logged-out sessions, so a copied token stops working. |
| Invites | `registration_invites` | Shareable sign-up links (only a hash of each link is stored). |
| Chat | `chat_sessions`, `chat_messages` | An employee's private conversations with the AI, with a 30-day access window. |
| AI usage | `ai_usage`, `tool_approvals` | Spending records for every AI call, and encrypted "please confirm this analysis" requests. |
| Analyses | `email_analyses`, `url_analyses`, `file_analyses` | Results of each analysis: a minimized evidence summary, the risk score and level. No raw email body, full URL or file content is kept. |
| Incidents | `incidents`, `incident_evidence`, `incident_events`, `incident_comments` | Security cases, a frozen copy of their evidence, a timeline of changes and investigation notes. |
| Notifications | `notifications` | Messages for one recipient each (no "send to everyone" rows). |
| Knowledge base | `knowledge_documents`, `document_chunks` | PDPL and sample policy documents, split into chunks with embeddings for search. |
| Training | `training_programs`, `training_assignments`, `training_progress` | Courses, who is assigned, and how far each person has got. |
| Quizzes | `quizzes`, `training_quizzes`, `monthly_quizzes`, `quiz_questions`, `quiz_options`, `quiz_attempts`, `quiz_answers`, `monthly_quiz_assignments` | Course quizzes and monthly quizzes share one question/answer structure. |
| Certificates | `certificates` | One per legitimately completed course, with a unique ID. The PDF is generated on demand, not stored. |
| Community | `community_posts`, attachments, likes, saves, comments, reports, moderation actions | Posts and everything around them. |
| Accountability | `disclaimer_acknowledgements`, `audit_logs` | Who accepted which notice and when; a log of important actions. |

PDPL and company-policy documents share one table with a `kind` field instead of
two separate tables, so approval and indexing logic is not duplicated.

## Naming conventions

- Prisma models are singular PascalCase (`IncidentEvent`) and map to snake_case tables (`incident_events`).
- IDs are UUIDs. Incident numbers come from a database sequence, so gaps are normal.
- Times are stored as `timestamptz`. Monthly quiz periods are stored as the first day of the month.
- Emails are trimmed and lowercased before saving, so uniqueness works regardless of letter case.

## Rules the database enforces

These are written as SQL checks and triggers in the migrations, because Prisma
cannot express them:

- Scores, percentages and points stay within valid ranges; SHA-256 values have the right shape.
- A risk result is all-or-nothing: score, severity and rule version are either all present or all missing.
- An analysis or community post must use an acknowledgement belonging to the same user and the right context.
- Only approved, active knowledge documents and reviewed, published courses can be used.
- A quiz attempt belongs to exactly one course or monthly assignment for the same employee.
- Answers must belong to the attempt's quiz, and awarded points cannot exceed the question's points.
- A quiz can only be approved if every question has exactly one correct option (exactly two options for true/false).
- Published or attempted questions and submitted answers cannot be rewritten.
- A course can only be COMPLETED with all material done, and, if it has a quiz, a passing attempt.
- A certificate must match a completed progress record.

These checks protect consistency. They are **not** a replacement for the
application's role and ownership checks.

## Deleting data

- Accounts are **deactivated or soft-deleted**, not erased, because incidents, results and audit records refer to them.
- Most important history (incidents, results, certificates, moderation) uses **RESTRICT**: the database refuses to delete a record that other records depend on.
- **Cascade** deletion is used only where it is safe: a chat session's messages, a user's own notifications, a document's chunks.
- When an analysis is removed, the incident keeps its frozen evidence copy (the link becomes empty, not broken).
- Audit logs survive account deletion (the actor field becomes empty).

See [privacy and retention](privacy-and-retention.md) for the cleanup rules.

## Vector search (pgvector)

- `document_chunks.embedding` is a `vector(1536)` column with a cosine **HNSW** index.
- Prisma cannot model this column or index, so vector reads and writes use parameterized SQL.
- **Important:** `prisma migrate diff` will suggest dropping `document_chunks_embedding_hnsw`. This is a known Prisma limitation. **Do not apply that drop, and never use `prisma db push`**; it would also lose the SQL checks and triggers.

### Installing pgvector on Windows (PostgreSQL 18)

pgvector is a PostgreSQL server extension, not an npm package. It must be built
for the same PostgreSQL version. In an **administrator x64 Native Tools Command
Prompt** (Visual Studio Build Tools installed):

```bat
set "PGROOT=C:\Program Files\PostgreSQL\18"
cd /d "%TEMP%"
git clone --depth 1 --branch v0.8.7 https://github.com/pgvector/pgvector.git ewaguard-pgvector-v0.8.7
cd ewaguard-pgvector-v0.8.7
nmake /F Makefile.win
nmake /F Makefile.win install
```

This installs `vector.dll` and the extension files under `C:\Program Files\PostgreSQL\18`.
No database restart is needed. Check it with
`SELECT extversion FROM pg_extension WHERE extname = 'vector';`.

## Everyday commands

Run from the repository root (the real connection URL lives only in `.env`):

```bash
npm run prisma:format     # tidy the schema file
npm run prisma:validate   # check the schema
npm run prisma:generate   # regenerate the Prisma client
npm run db:migrate        # apply pending migrations (safe, never resets)
npm run db:status         # show which migrations are applied
npm run db:seed           # add the two roles and four departments (no accounts)
npm run test:database     # database rule tests
npm run test:vector       # pgvector tests
```

- The seed refuses to run in production and creates no user accounts.
- Never run `prisma migrate reset` on a database that holds real data.
- If a migration fails part-way, use Prisma's failed-migration resolution steps; never mark unapplied SQL as applied.
- Production should use a database account with fewer privileges than the account that runs migrations.

## Known quirk: timestamps

With the current Prisma PostgreSQL adapter and a non-UTC database session time
zone, stored timestamps can appear shifted when read with raw SQL or `psql`.
Prisma reads correct them. Day-based reports use the session time zone to stay
correct. Changing the session to UTC would require a migration that adjusts all
existing timestamps at the same time.

## Privacy rules for stored data

- No plaintext passwords, JWTs, API keys or unencrypted MFA secrets.
- No raw email bodies or headers, no full URLs with paths or query strings, no uploaded file bytes or original filenames.
- Audit metadata is limited to an allow-list of small fields and never copies request bodies, prompts or tokens.
