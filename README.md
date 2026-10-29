# EWAGuard AI

<p align="center">
  <img src="frontend/src/assets/branding/ewa_logo_wide_sticker.png" alt="EWAGuard AI logo" width="600">
</p>

Enterprise cybersecurity and Bahrain PDPL assistant prototype for threat analysis,
incident triage, and security awareness.

**Current implementation: Phase 0–2B foundation, design system and verified
PostgreSQL/pgvector architecture, Phase 3A authentication, Phase 3B RBAC/MFA,
the Phase 4A employee portal, Phase 4B chat interface, Phase 5A local password
security, Phase 5B sensitive-information acknowledgement, Phase 6A email analysis,
Phase 6B URL analysis, Phase 6C file analysis, Phase 7A central risk evaluation,
Phase 7B incident assistance, Phase 8A secure OpenAI/chat backend, and Phase 8B1
controlled tool registry, Phase 8B2A durable approvals, and Phase 8B2B Responses
function calling with multi-round budget accounting, Phase 8C employee chat integration,
and Phase 10A automatic incident creation. Phase 9 remains postponed pending approved source documents.**
Employees sign in using short-lived HTTP-only JWT cookies. Administrators must
enroll and verify TOTP before receiving an authenticated session. See
[RBAC and MFA operations](docs/rbac-mfa.md) for enrollment and key configuration.

The employee portal includes dedicated tool, awareness, incident, community, and
profile pages. Password strength analysis and secure generation run entirely in the
browser and create no password records or API requests. The assistant
supports real backend AI responses, conversation history and explicit analysis approvals. Later
feature submissions remain disabled and explicitly labeled as previews. See
[employee portal scope and verification](docs/employee-portal.md).

See [employee chat workflow and security boundaries](docs/chat-interface.md).
See [password security architecture and privacy controls](docs/password-security.md).
See [sensitive-information disclaimer architecture](docs/disclaimers.md).
Phase 6A supports employee email submissions and minimized evidence. See
[email analyzer scope and privacy boundaries](docs/email-analyzer.md).
Phase 6B adds public URL structure, DNS, TLS and VirusTotal report evidence without
loading webpages. See [URL analyzer architecture and privacy](docs/url-analyzer.md).
Phase 6C adds bounded employee file uploads, local ClamAV/YARA scans and VirusTotal
SHA-256 lookup only. See [file analyzer architecture and privacy](docs/file-analyzer.md).

Phase 7A computes deterministic final risk for all three analyzers, with separate
confidence, coverage, reasons and recommendations. See [Central Risk Engine](docs/risk-engine.md).
Run `npm run test:risk` for its policy and UI matrix.
Phase 7B adds deterministic employee next-step guidance derived from completed risk
results. See [Incident Assistance](docs/incident-assistance.md) and run
`npm run test:assistance`. Guidance itself performs no remediation or administrator contact.

Phase 10A records incidents automatically for finalized HIGH/CRITICAL email, URL
and file analyses, including approved AI analysis. See [Incident Engine](docs/incident-engine.md)
for ownership, atomic evidence/history, idempotency, retry and retention controls.
No administrator incident dashboard or Socket.IO notifications are implemented.

See [database architecture and setup](docs/database.md) for the 32 tables,
relationships, privacy boundaries, validation commands and pgvector prerequisite.
See [authentication architecture](docs/authentication.md) for the session model,
CSRF decision and development-account workflow.

## Local development

Use Node.js 24.13+ (24.x) and npm 11.x. Run from the repository root:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:seed:auth
npm.cmd run dev
```

Before seeding accounts, replace placeholders in ignored `.env`, generate a unique
JWT secret of at least 32 random characters, and set strong local-only
`DEV_EMPLOYEE_PASSWORD` and `DEV_ADMIN_PASSWORD` values (8–128 characters). Do
not add these development passwords to `.env.example`. Copy the example only if
`.env` does not already exist.

Open <http://127.0.0.1:5173>. Vite forwards `/api` to the backend on port 5000.
In development, <http://localhost:5173> also works: CORS and CSRF checks accept
both loopback hostnames at the configured scheme and port. Production accepts only
the configured `FRONTEND_URL`. Cookies remain separate for each hostname.
`GET http://127.0.0.1:5000/api/health` returns:

```json
{ "status": "ok", "service": "ewaguard-api" }
```

This endpoint checks API liveness only, not database or external-service readiness.
The home page displays the actual result or an unavailable message.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start both development servers; Ctrl+C stops them |
| `npm run dev:frontend` | Start Vite only |
| `npm run dev:backend` | Start API with Node watch mode |
| `npm run start:backend` | Start API without watch mode |
| `npm run build` | Build frontend into `frontend/dist` |
| `npm run lint` | Lint frontend, backend, tests, and configuration |
| `npm run check:backend` | Check backend entry/configuration syntax |
| `npm test` | Run foundation and authentication API tests |
| `npm run test:portal` | Render employee routes, role boundaries, profile and preview controls without a browser |
| `npm run test:chat` | Check chat state, keyboard decisions and safe structured presentation |
| `npm run test:password` | Check password strength, policy, secure generation and privacy boundaries |
| `npm run test:disclaimer` | Check disclaimer UI, authorization, metadata minimization and verification |
| `npm run test:email` | Check bounded email parsing, deterministic indicators and privacy minimization |
| `npm run test:url` | Check URL normalization, SSRF, DNS/TLS, and mocked reputation providers |
| `npm run test:url:api` | Check URL API authorization and real minimized PostgreSQL persistence |
| `npm run test:url:ui` | Check employee URL UI rendering and interaction state |
| `npm run test:file` | Check file validation, temporary lifecycle, scanner adapters and hash-only reputation |
| `npm run test:file:api` | Check employee multipart API, authorization and minimized persistence |
| `npm run test:file:ui` | Check file UI rendering, upload controls and interaction lifecycle |
| `npm run prisma:format` | Format the PostgreSQL datasource schema |
| `npm run prisma:validate` | Validate the MVP schema |
| `npm run prisma:generate` | Generate the ignored Prisma Client |
| `npm run db:migrate` | Apply pending migrations (requires pgvector installed) |
| `npm run db:status` | Inspect migration application status |
| `npm run db:seed` | Seed development roles/departments, without accounts |
| `npm run db:seed:auth` | Create/rotate two fake local accounts from ignored environment passwords |
| `npm run test:database` | Run rollback-isolated local database constraint tests |
| `npm run test:vector` | Verify real vector storage, similarity, index and constraints |

## Environment

The backend and Prisma load the root `.env` regardless of working directory.
Injected environment variables take precedence. The backend requires a valid
`JWT_SECRET`; Prisma and database-backed authentication require `DATABASE_URL`.
The example's placeholder URL is sufficient for **format/validate only**, which do
not verify database connectivity. No database is contacted by the Phase 0 API.

| Variable | Use |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | Backend port, 1–65535; default 5000 |
| `HOST` | Explicit bind address; default `127.0.0.1`; containers may use `0.0.0.0` |
| `FRONTEND_URL` | One browser origin allowed by API CORS; HTTPS required in production |
| `DEV_API_TARGET` | Vite development proxy target; default `http://127.0.0.1:5000` |
| `DATABASE_URL` | PostgreSQL URL for Prisma CLI configuration |
| `JWT_SECRET` | Server-only JWT signing secret; minimum 32 characters |
| `JWT_ACCESS_TTL_SECONDS` | Employee and administrator access-cookie lifetime, 60–3600 seconds; default 1800 (30 minutes) |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | Failed-login rate-limit window; default 15 |
| `LOGIN_RATE_LIMIT_MAX` | Failed login limit per client/window; default 10 |
| `VIRUSTOTAL_API_KEY` | Optional backend-only key for URL/domain and file-hash reputation reports |
| `CLAMAV_PATH` | Backend-only absolute path to the local ClamAV scanner executable |
| `YARA_PATH` | Backend-only absolute path to the local YARA executable |
| `YARA_RULES_PATH` | Absolute rules file/directory; development defaults to the project-owned starter rules |

Other integration variables in `.env.example` are reserved for later phases.
Never put secrets in `VITE_*` variables;
those values can become public browser code. Commit only placeholder examples.

## Privacy and retention (Phase 15A)

See [the data inventory and operating policy](docs/privacy-retention.md).
Database cleanup is disabled by default. `npm.cmd run retention:preview` reports
bounded eligible counts without deleting data. Do not enable or apply retention
without explicit operator approval. Phase 15B remains pending.

## Architecture and boundaries

See [the foundation architecture](docs/architecture.md). Follow [AGENTS.md](AGENTS.md)
for phase scope, security, privacy, and development requirements. Database design
is described in [Phase 2 documentation](docs/database.md); deployment belongs to
Phase 18. Phase 0 architecture notes remain a historical foundation description.

## Phase 8A backend

Secure employee chat APIs and conservative OpenAI spending controls are documented
in [docs/openai-chat.md](docs/openai-chat.md). Phase 8C connects the employee UI
to these APIs. Normal tests use mocked OpenAI responses and cost $0.

The [controlled tool foundation](docs/controlled-tools.md) enforces employee-owned
read-only results. Phase 8B2A implements
[durable human approvals and controlled email/URL execution](docs/tool-approvals.md).
Configure the dedicated
approval encryption key and use the documented employee REST endpoints. Phase 8B2B
connects Responses function calling, private-input approval handoff, saved-result
explanations and separately reserved model rounds. Phase 8C adds privacy, history,
approval/rejection and result recovery UI. Automated tests use mocked OpenAI
responses and no paid calls. Visual browser validation remains pending.
