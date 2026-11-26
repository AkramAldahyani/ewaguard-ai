# Architecture

## In short

EWAGuard AI is a web application with three main parts:

1. **Frontend**: a React website that employees and administrators use in the browser.
2. **Backend**: a Node.js / Express server that does all the real work and enforces all security rules.
3. **Database**: PostgreSQL, which stores accounts, analyses, incidents, training, community posts and audit records. The pgvector extension adds document search.

Some features also use outside services: OpenAI (AI chat and document embeddings)
and VirusTotal (reputation lookups). ClamAV and YARA run locally on the server.

## The core principle

> **Security tools detect. The risk engine evaluates. AI explains and coordinates.**

```text
Employee submits an email, link or file
        ↓
Security analysis (parsers, ClamAV, YARA, DNS/TLS checks, VirusTotal)
        ↓
Structured evidence (a list of facts, no opinions)
        ↓
Risk engine (fixed rules → score 0–100 and LOW / MEDIUM / HIGH / CRITICAL)
        ↓
Guidance ("what should I do now?")
        ↓
HIGH or CRITICAL → incident created → administrators alerted
        ↓
AI assistant can explain the saved result (it cannot change it)
```

The AI is never the malware detector and never decides the risk level.

## Technology and why it was chosen

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | React, React Router, Tailwind CSS, Vite | Pages, navigation, styling and the development server |
| Backend | Node.js, Express (JavaScript, ES modules) | REST API, security checks and business rules |
| Database | PostgreSQL + Prisma ORM | Reliable storage with relations and constraints |
| Document search | pgvector | Stores embeddings for the PDPL and policy knowledge base |
| Login | JWT in an HTTP-only cookie, bcrypt, TOTP (otpauth) | Sessions, password storage and administrator MFA |
| Real-time | Socket.IO | Pushes "refresh now" signals for notifications and incidents |
| AI | OpenAI Responses API with function calling | Chat answers and controlled tool use |
| Email parsing | MailParser, htmlparser2 | Reads `.eml` files and pasted emails safely |
| Uploads | Multer | Receives files in memory with size limits |
| Malware checks | ClamAV, YARA | Local scanning of uploaded files |
| Passwords | zxcvbn, Web Crypto API | Strength checking and secure generation in the browser |
| Certificates | PDFKit | Builds certificate PDFs on demand |
| Images | sharp | Cleans and re-encodes community images |

## Folder map

```text
frontend/
  src/
    pages/          Top-level pages (home, login, profile, not found)
    features/       One folder per feature (email, url, file, chat, incidents,
                    training, monthly-quizzes, certificates, community, analytics,
                    users, notifications, password, setup, audit, dashboard)
    components/     Shared UI pieces (buttons, cards, risk badges, layout parts)
    layouts/        The application shell (sidebar, header, notification bell)
    context/        Shared React state (the logged-in user)
    services/       The API client used by every feature
  tests/            Frontend tests (Node test runner + Vite)

backend/
  src/
    app.js          Builds the Express app and mounts every route
    server.js       Starts the server, Socket.IO and background workers
    config/         Reads and validates environment variables
    routes/         One file per API area (auth, analysis, incidents, ...)
    middleware/     Authentication, role checks, trusted-origin checks
    auth/           Login, sessions, MFA, audit of sign-in events
    analyzers/      email/, url/, file/ analyzers and shared helpers
    risk/           The deterministic risk engine
    assistance/     "What should I do now?" guidance
    incidents/      Automatic incident creation and investigation logic
    notifications/  Notification storage and the Socket.IO dispatcher
    ai/             OpenAI adapter, chat service, tool registry and approvals
    rag/            Knowledge-base ingestion, indexing and retrieval
    training/       Courses, course quizzes, monthly quizzes, provisioning
    certificates/   Certificate issuance and PDF generation
    community/      Posts, comments, images, reports and moderation
    analytics/      Security and awareness statistics
    dashboard/      Administrator dashboard summary
    users/          User management and invite links
    privacy/        Retention policy and cleanup worker
    disclaimers/    Sensitive-information acknowledgements
  prisma/           Database schema, migrations and seed scripts
  scripts/          Operator command-line tools (provisioning, retention, checks)
  security/yara/    The project's own YARA rules
  data/             Knowledge-base source documents (PDPL PDF, sample policies)
  tests/            Backend tests

shared/             Code used by both frontend and backend
                    (disclaimer text, allowed file types)
docs/               These guides
```

## How a request travels

Example: an employee submits a suspicious link.

1. The React page sends `POST /api/analysis/url` with the session cookie.
2. **Authentication middleware** checks the cookie's token and reloads the account from the database (active? which role?).
3. **Role check**: only employees may use analyzers.
4. **Trusted-origin check**: the request must come from the EWAGuard website itself.
5. **Rate limit**: too many requests are refused with HTTP 429.
6. The **URL analyzer** collects evidence (structure, DNS, TLS, VirusTotal).
7. The **risk engine** scores the evidence.
8. The result is **saved** in one database transaction.
9. If the level is HIGH or CRITICAL, the **incident engine** creates an incident and notifications.
10. The response goes back to the page, which shows the score, reasons and advice.

Every protected route follows the same pattern: authenticate, check the role,
check ownership of the record, validate the input, then do the work.

## Important boundaries

- **The backend is the only authority.** Hidden buttons in the frontend are for convenience only; every rule is checked again on the server.
- **Secrets stay on the server.** API keys and encryption keys come from environment variables (`.env`), never from frontend code.
- **Errors are generic.** Users see a short code and message, never stack traces, SQL or file paths.
- **External services can fail safely.** If OpenAI, VirusTotal, ClamAV or YARA are unavailable, results say `UNAVAILABLE`. Nothing is invented.

## Running and deploying

- Development: `npm run dev` starts the backend and the Vite frontend together. Vite forwards `/api` (including the Socket.IO connection) to the backend.
- Production build: `npm run build` creates `frontend/dist`.
- In production, a web server or reverse proxy must:
  - serve `frontend/dist` and send unknown paths to `index.html` (single-page app);
  - forward `/api` and the WebSocket upgrade at `/api/realtime` to the backend;
  - provide HTTPS.
- `vite preview` is not a production server and does not forward the API.
- If a reverse proxy sits on the same host, set `TRUSTED_PROXY=loopback` so each client gets its own login rate limit.
- There are no Dockerfiles yet. The repository root would be the build context because both workspaces share one lockfile. Configuration must be injected at runtime, never baked into an image.

## Dependency notes

The root `package.json` pins a few transitive Prisma tooling packages
(`deepmerge-ts`, `mysql2`, `shell-quote`) to patched versions to fix known
security advisories. MySQL is not used by the application; it is only a
dependency of the Prisma command-line tool. Remove these overrides once Prisma
ships the fixed versions itself.
