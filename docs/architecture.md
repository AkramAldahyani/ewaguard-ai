# Phase 0 architecture

The repository uses npm workspaces and one root lockfile. All application code is
JavaScript with ES modules. Dependencies are assigned to the workspace that uses them.

```text
frontend/
  src/                  React shell, Router routes, Tailwind entry stylesheet
  vite.config.js        Build and local /api proxy
backend/
  src/
    config/             Environment loading and validation
    routes/             REST route handlers (health only)
    middleware/         Consistent safe API error responses
    app.js              Express composition without opening a network port
    server.js           Startup and graceful shutdown
  prisma/               PostgreSQL datasource; no models yet
  prisma.config.js      Prisma CLI paths and validated connection URL
  tests/                Node test runner and real loopback HTTP tests
docs/                   Short foundation decisions
```

Add services, controllers, and feature directories when their phases need them.
The health endpoint does not require an artificial controller/service split.

## Responsibility boundaries

React handles rendering and React Router handles navigation. Tailwind supplies
styling utilities; the actual design system is deferred to Phase 1. Express provides
REST endpoints, security headers, a 32 KiB JSON body limit, one allowed browser
origin, and generic error responses. CORS is not authentication or authorization.
The current API contains no protected resources or feature endpoints.

Prisma has a PostgreSQL provider and CLI configuration only. There are no tables,
migrations, seeds, generated client, or database connection at runtime. Adding an
unused database client or a dummy table would misrepresent Phase 0. Phase 2 will
define the schema, migration, and client configuration.

Future modules must preserve: **security tools detect; the risk engine evaluates;
AI explains and coordinates.** No AI or security classification runs in Phase 0.

## Docker preparation

Separate frontend/backend workspaces, injected environment configuration, an
explicit bind address, shutdown handling, and `.dockerignore` prepare for containers.
The root directory will be the Docker build context because workspaces share the
root lockfile. Runtime configuration must be injected, never baked into an image.
No Dockerfiles, Compose services, or deployed infrastructure are implemented yet.

In deployment, a web server/reverse proxy must serve `frontend/dist`, provide SPA
fallback for frontend routes, and forward `/api` to the backend. Vite's development
proxy is not a production server; `vite preview` does not provide the API proxy.
TLS termination and trusted-proxy configuration require deliberate deployment setup.

## Dependency configuration references

- [Vite guide](https://vite.dev/guide/)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [Prisma configuration reference](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference)

Prisma 7 uses its config file for the connection URL. A stable 7.x version is used;
the registry's Prisma 8 release candidate is not part of this foundation.

Root npm overrides pin two Prisma tooling dependencies to patched versions:
`deepmerge-ts` 8.0.2 and `mysql2` 3.24.5. These address
[recursive merge exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx),
[MySQL authentication downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr),
and [compressed protocol exhaustion](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3).
MySQL is not an application database; that package is a transitive Prisma CLI
dependency. The deepmerge major release changes Map merging and TypeScript types;
this project's CLI configuration uses plain objects. Format/validation are checked
with the override. Recheck migration/client compatibility in Phase 2 and remove
overrides when Prisma incorporates patched dependencies.
