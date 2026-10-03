# EWAGuard AI

<p align="center">
  <img src="frontend/src/assets/branding/ewa_logo_wide_sticker.png" alt="EWAGuard AI logo" width="600">
</p>

Enterprise cybersecurity and Bahrain PDPL assistant prototype for threat analysis,
incident triage, and security awareness.

**Current implementation: Phase 0–2B foundation, design system and verified
PostgreSQL/pgvector architecture, plus Phase 3A authentication.** Provisioned active
accounts can sign in through a protected React shell using short-lived HTTP-only
JWT cookies. Full RBAC and administrator MFA remain Phase 3B.

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
`DEV_EMPLOYEE_PASSWORD` and `DEV_ADMIN_PASSWORD` values (14–128 characters). Do
not add these development passwords to `.env.example`. Copy the example only if
`.env` does not already exist.

Open <http://127.0.0.1:5173>. Vite forwards `/api` to the backend on port 5000.
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
| `JWT_ACCESS_TTL_SECONDS` | Access-cookie lifetime, 60–3600 seconds; default 900 |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | Failed-login rate-limit window; default 15 |
| `LOGIN_RATE_LIMIT_MAX` | Failed login limit per client/window; default 10 |

Other integration variables in `.env.example` are reserved for later phases.
Never put secrets in `VITE_*` variables;
those values can become public browser code. Commit only placeholder examples.

## Architecture and boundaries

See [the foundation architecture](docs/architecture.md). Follow [AGENTS.md](AGENTS.md)
for phase scope, security, privacy, and development requirements. Database design
is described in [Phase 2 documentation](docs/database.md); deployment belongs to
Phase 18. Phase 0 architecture notes remain a historical foundation description.
