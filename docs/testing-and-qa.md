# Testing and quality checks

## In short

The project uses Node's built-in test runner. Backend tests live in
`backend/tests/`, frontend tests in `frontend/tests/`. Most tests use a **real
local PostgreSQL database** and real HTTP, while outside services (OpenAI,
VirusTotal, ClamAV, YARA) are replaced by test doubles, so normal test runs cost
nothing.

## ⚠ Use a separate test database

Backend tests, and the frontend `users-ui` and `account-setup-ui` tests, connect to
the database in `DATABASE_URL`. A safety guard requires a local host and the
database name `ewaguard_ai`. Most suites clean up after themselves, but some
leave small traces (for example a failed-login audit row).

**Run tests against a throwaway PostgreSQL cluster, not your real data:**

```bash
# one-time: create a separate cluster on another port
initdb -D <temp-folder>/pgdata -U postgres --auth=trust -E UTF8
pg_ctl -D <temp-folder>/pgdata -o "-p 55432" -l <temp-folder>/pg.log start
createdb -h localhost -p 55432 -U postgres ewaguard_ai

# point the tests at it (OpenAI / VirusTotal keys blank)
export DATABASE_URL=postgresql://postgres@localhost:55432/ewaguard_ai
export OPENAI_API_KEY= VIRUSTOTAL_API_KEY=
npm run db:migrate && npm run db:seed
```

The cluster needs pgvector installed (see [database](database.md)). The PDPL chat
test also needs the PDPL corpus imported:

```bash
DEV_EMPLOYEE_PASSWORD=... DEV_ADMIN_PASSWORD=... npm run db:seed:auth
node backend/scripts/pdpl-corpus.js --ingest --actor <admin UUID from the test DB>
```

## Main commands

| Command | Runs |
| --- | --- |
| `npm test` | Backend `*.test.js` suites |
| `npm run test:all` | Everything (backend unit + integration, frontend), one at a time |
| `npm run test:logic` | Core logic and workflow suites |
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier |
| `npm run build` | Frontend production build |
| `npm run check:backend` | Syntax check of key backend files |
| `npm run prisma:validate` | Schema validation |

Feature suites: `test:email`, `test:email:api`, `test:email:ui`, `test:url`,
`test:url:api`, `test:url:ui`, `test:file`, `test:file:api`, `test:file:ui`,
`test:risk`, `test:assistance`, `test:password`, `test:disclaimer`, `test:portal`,
`test:chat`, `test:chat:api`, `test:tools`, `test:users`, `test:users:ui`,
`test:setup:ui`, `test:database`, `test:vector`, `test:rag:*`.

Tips:

- Run with `--test-concurrency=1`. Several suites share the AI budget and concurrency slots on purpose.
- The user-management suites use a 768 MB memory cap.
- On rare occasions a test server gets a random port that Node's `fetch` refuses ("bad port"). Rerunning that file fixes it.
- The production build shows a "chunk larger than 500 kB" warning. This is known and harmless.

## What the tests cover (priorities)

Authentication and MFA, role and ownership checks (including attempts to read
other people's data), password privacy, the risk engine boundaries, every
analyzer, incident creation and permissions, notifications and Socket.IO
isolation, AI tool authorization and approvals, prompt-injection attempts (role
impersonation, "reveal your prompt", "publish this quiz"), RAG retrieval and
citations, training completion, quiz scoring and answer secrecy, certificate
eligibility, community moderation, disclaimer enforcement, file-upload safety and
retention.

## Optional live checks (manual only)

These use real services and may **cost money or quota**. They are never part of
automated runs. Several write a marker file in the ignored `.runtime/` folder to
prevent accidental paid reruns. **Do not delete those markers just to retry.**

| Script | Checks |
| --- | --- |
| `npm run openai:verify:model` | Model access (free, read-only) |
| `npm run openai:verify:live` | One small paid chat request |
| `npm run knowledge:verify:embeddings` | One paid embedding request |
| `node backend/scripts/verify-chat-routing.js --run <name>` | 27 routing questions against the live model |
| `node backend/scripts/verify-pdpl-live.js` | Fixed PDPL questions |
| `node backend/scripts/verify-company-live.js` | Fixed company-policy questions |
| `node backend/scripts/validate-url-live.js` | VirusTotal reachability with `example.com` |
| `node backend/scripts/validate-url-runtime.js` | Full URL flow against the running app |
| `node backend/scripts/validate-file-local.js` | Local ClamAV and YARA |
| `node backend/scripts/validate-file-runtime.js` | Full file flow against the running app |
| `node backend/scripts/validate-risk-runtime.js` | Risk and guidance against the running app |

The `*-runtime` scripts create a temporary test employee and remove it afterwards.

## UI review findings (already fixed)

A review of the React pages found and fixed:

1. Wide tables in chat answers could overflow on small screens; they now scroll inside the message.
2. Incident and training tables were cramped at laptop widths; cards are now used up to the `xl` breakpoint.
3. Shared table cells forced one line; long names and certificate numbers now wrap.
4. The confidence badge had no label; it is now labeled and reasons are grouped under "Key findings".

## Manual browser checklist

Automated tests render pages but do not replace a real browser check. Use
non-production accounts and harmless test content in Chrome, with DevTools open
(F12 → Console) and responsive mode at **1440, 1024, 768 and 390 px**. At each
width, everything important must be reachable without sideways page scrolling.

| Area | Widths | What to try | Expected | Result |
| --- | --- | --- | --- | --- |
| Shell and navigation (both portals) | all | Tab from the address bar, skip link, open/close mobile menu by keyboard, change page, resize | Visible focus, one current menu item, menu fits and returns focus, headings readable | ☐ Pass ☐ Fail |
| Home and AI assistant | 1440, 768, 390 | Ask a harmless question, scroll, focus the composer | Messages wrap, composer usable, newest message visible, clear loading/errors | ☐ Pass ☐ Fail |
| Email, URL, file, password | 1440, 768, 390 | Invalid and valid input, accept notice, upload a harmless file, read results | Readable errors, no double submission, level/confidence/evidence/actions distinct, long names wrap | ☐ Pass ☐ Fail |
| My Incidents, training, quizzes, certificates | 1440, 768, 390 | Filter and open records, answer a quiz by keyboard, confirm submit, open certificate | Clear choices and feedback, dialogs trap and return focus | ☐ Pass ☐ Fail |
| Security community | 1440, 768, 390 | Switch tabs, submit an invalid draft, open/close dialogs | Correct tab/panel, errors announced, text wraps | ☐ Pass ☐ Fail |
| Admin dashboard and incidents | all | Filter queue, open detail, timeline and actions, confirmations | Labels readable, tables scroll inside their area, actions reachable | ☐ Pass ☐ Fail |
| Analytics | all | Invalid custom dates, valid filters, charts and tables | Date errors next to inputs, readable chart labels, no overflow | ☐ Pass ☐ Fail |
| Admin training, quizzes, certificates, moderation | all | Search, filter, forms, confirmations | Controls wrap or scroll locally, notices readable, dialogs keyboard-operable | ☐ Pass ☐ Fail |
| Accessibility preferences | 1440, 390 | Repeat key flows at 200% zoom and with reduced motion; Tab, Shift+Tab, Escape | Still usable, focus visible, motion reduced, nothing relies on color alone | ☐ Pass ☐ Fail |

Record the date, browser version, account role, any console errors, and for
failures the page and screen width.
