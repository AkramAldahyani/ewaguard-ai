# EWAGuard AI

Enterprise cybersecurity and Bahrain PDPL assistant prototype for threat analysis,
incident triage, and security awareness.

**Current implementation: Phase 0 foundation only.** No authentication, security
analysis, AI, database-backed features, or awareness workflows exist yet.

## Local development

Use Node.js 24.13+ (24.x) and npm 11.x. Run from the repository root:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Copy the environment example only if `.env` does not already exist. On other shells,
use `npm` and the equivalent copy command. `npm.cmd` avoids Windows PowerShell's
script-execution restriction without changing machine policy.

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
| `npm test` | Run foundation HTTP, error handling, and configuration tests |
| `npm run prisma:format` | Format the PostgreSQL datasource schema |
| `npm run prisma:validate` | Validate the Prisma foundation |

## Environment

The backend and Prisma load the root `.env` regardless of working directory.
Injected environment variables take precedence. The backend can run with local
defaults without `.env`; Prisma requires a syntactically valid `DATABASE_URL`.
The example's placeholder URL is sufficient for **format/validate only**, which do
not verify database connectivity. No database is contacted by the Phase 0 API.

| Variable | Phase 0 use |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | Backend port, 1–65535; default 5000 |
| `HOST` | Explicit bind address; default `127.0.0.1`; containers may use `0.0.0.0` |
| `FRONTEND_URL` | One browser origin allowed by API CORS; HTTPS required in production |
| `DEV_API_TARGET` | Vite development proxy target; default `http://127.0.0.1:5000` |
| `DATABASE_URL` | PostgreSQL URL for Prisma CLI configuration |

Other variables already present in `.env.example` are reserved for later phases.
They are unused and not required now. Never put secrets in `VITE_*` variables;
those values can become public browser code. Commit only placeholder examples.

## Architecture and boundaries

See [the foundation architecture](docs/architecture.md). Follow [AGENTS.md](AGENTS.md)
for phase scope, security, privacy, and development requirements. Full database
design belongs to Phase 2, and deployment belongs to Phase 18.
