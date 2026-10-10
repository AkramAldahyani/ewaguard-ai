# Phase 10C1 — Authenticated notification backend

This subphase implements the backend only. Phase 10C2 must connect the React bell,
notification panel and incident views to this contract. No browser notification UI,
Socket.IO client bundle, training, or later-phase functionality is enabled here.

## Transport and session security

The existing HTTP server hosts Express and Socket.IO at `/api/realtime`. Use the
existing HttpOnly access cookie and `withCredentials: true`; never send tokens in
query strings or `auth`. Only the configured trusted browser origins are accepted,
including WebSocket handshakes. Missing Origin is rejected for sockets. Polling
and WebSocket transports are supported. HTTP routes retain their existing origin,
role, MFA and ownership middleware.

JWT signature, issuer, audience, expiry, UUID subject/session ID, current account
status, role and administrator MFA enrollment proof are checked against storage.
Logout persists the token's session ID in `revoked_sessions` before completing;
the token itself is never stored. Both HTTP and Socket.IO reject revoked IDs.
Local sockets disconnect on logout. Other processes discover revocation at the
next authorization check. Expiry also has an exact disconnect timer. Authorization
is checked before each dispatch and again after its reads; failures disconnect.

Rooms are assigned by the server: `user:<authenticated UUID>` and, for verified
administrators only, `verified-administrators`. Clients cannot join rooms or send
application events; attempts disconnect. Dispatch is per authenticated socket,
not an unchecked room broadcast. Role changes invalidate existing connections.
Socket.IO's in-memory connection recovery is intentionally not enabled: every
reconnection authenticates again and retrieves durable authorized REST state.

Limits: 4 KiB incoming messages, five sockets per user per process, 1,000 active
transport clients per process, 30 handshake attempts/address/minute, 5-second
namespace connection deadline, and no transport compression or served client
bundle. Address and socket limits are in process; a reverse proxy/shared admission
policy is needed for clustered deployment. Forward WebSocket upgrades and long
polling for `/api/realtime`; do not broaden origin configuration to `*`.

## Durable events

| Incident operation | Recipient and notification kind |
| --- | --- |
| Automatic HIGH/CRITICAL creation | Active MFA-enabled administrators: INCIDENT_CREATED |
| Assignment | Assigned administrator: INCIDENT_ASSIGNED; other eligible administrators: INVESTIGATION_UPDATED |
| Unassignment | Eligible administrators: INVESTIGATION_UPDATED |
| Supported status transition | Incident's employee owner and eligible administrators: STATUS_CHANGED |
| Explicit REPORTER update | Employee owner: EMPLOYEE_UPDATE; administrators: INVESTIGATION_UPDATED |
| Internal investigation note | Administrators only: INVESTIGATION_UPDATED |

All recipients receive fixed text, an incident reference/ID, event kind, original
event severity, timestamps and read state. CRITICAL sets `urgent: true`. Neither
notification storage nor transport copies submitted analysis content, evidence,
incident descriptions/titles, note bodies, credentials or actor identities.
The authorized detail endpoint remains the source for current investigation state.

Notification inserts occur in the same PostgreSQL transaction as incident
creation or mutation. Storage failure rolls the transaction back. Phase 10A's
existing escalation recovery continues to work. Source idempotency, stale-version
checks and a unique `(recipientId, eventKey)` constraint prevent duplicate durable
notifications. Assignment no-ops create none. Existing history and audit writes
remain atomic. Administrator fan-out queries use batches of at most 200 recipients.

The Socket.IO dispatcher reads committed notification state every five seconds.
It coalesces changes between polls and sends only invalidation signals. Socket or
dispatcher failure cannot roll back successful incident writes. Notifications
remain available when users are offline or the process restarts. This is durable
inbox recovery, not an exactly-once delivery guarantee or an acknowledgement that
the person saw an alert. `deliveredAt` remains unset; an emission is not proof of
delivery. Important new alerts may take approximately five seconds to signal.

## REST API

Both supported roles use `/api/notifications`, authenticated by the existing
cookie. Administrator MFA is mandatory. Every query is recipient- and current-
role-scoped; employee notifications additionally require current incident ownership.
Expired rows and historical rows without an explicit audience/kind are excluded.
No historical notification or incident backfill is performed.

* `GET /api/notifications?limit=20&before=<cursor>&unread=true`: returns
  `{items, nextCursor}`. Limit 1–100; opaque cursor orders by creation time/UUID
  descending. Omit `before` to get the latest page. Unknown/repeated fields fail.
* `GET /api/notifications/unread-count`: returns `{unreadCount}`.
* `POST /api/notifications/:id/read`, JSON `{}`: marks only the caller's authorized
  notification read and returns `{notification}`. Idempotent repeat; foreign or
  missing IDs return 404. The first change creates a minimized NOTIFICATION_READ
  audit record in the same transaction. No mark-unread/bulk mutation is exposed.

All responses use `Cache-Control: no-store`. APIs are limited to 120 requests per
authenticated user/minute. Mutation bodies are limited to 1 KiB, uncompressed,
with strict field validation and existing trusted-origin checks.

## Socket contract for 10C2

* `notifications:ready`, `{recovery: 'FETCH_AUTHORIZED_LIST'}`: authenticate and
  fetch the latest notification page/unread count on every initial connection or
  reconnection. Refresh the active incident view as part of recovery.
* `notifications:changed`, no payload: invalidate notification list/unread count.
* `incidents:changed`, no payload: invalidate the currently authorized incident
  queue/detail. Read receipts alone do not emit this event. Internal note or
  assignment timing never produces an employee notification or incident signal.

Deduplicate inbox items by notification ID. Coalesce invalidations into one
in-flight refresh with a follow-up if a change arrives during the fetch. Refetch
on browser visibility/resume and reconnect; signals can be lost during transport
failure. Use REST cursor pages for older notifications rather than replaying
analyses or mutations. Navigate employees to `/incidents/:incidentId` and verified
administrators to `/admin/incidents/:incidentId`; backend authorization still wins.
Do not persist inbox content in localStorage. Disconnect/clear state on logout,
401, identity changes or unmount. Handle reconnecting/error states in 10C2.

## Schema, tests and operational limits

Additive migration `20261010000200_incident_notifications` extends Notification
with nullable `eventKey`, `audience`, `kind`, `severity`, adds deduplication/paging
indexes, and creates the indexed `revoked_sessions` table. No existing migration
or record is removed. Prisma client regeneration is required after deployment.
Notification expiry is a 90-day prototype review window. No automatic purge is
introduced; notification retention and expired revocation cleanup need an approved
operational policy. Revocation rows contain only random session IDs and expiry.

`backend/tests/notifications.integration.test.js` uses real local PostgreSQL and
real loopback Socket.IO clients with synthetic identities. It covers transport
authentication, MFA, origins, isolation, private notes, idempotency, rollback,
recovery, cursor pages, read authorization, logout, expiry, account changes,
resource limits and dispatcher failure. Existing incident and authentication tests
remain regression coverage. No OpenAI, VirusTotal or scanner calls are introduced.

The current app is single-organization; no tenant model is invented. Offline
notifications are created for administrators eligible at event time, not users
granted administrator access later. Durable notifications are shared across
processes through PostgreSQL, while socket limits/rooms are local. The prototype
polling dispatcher is deliberately simple; larger deployments should measure its
per-connection query load before adopting a shared dispatcher/adapter.

Implementation references: [Socket.IO server options](https://socket.io/docs/v4/server-options/),
[middleware](https://socket.io/docs/v4/middlewares/), and
[delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

Next subphase: **10C2 frontend notification UX and integration tests**. Stop before
Phase 11A or later work.

## Completion record — 2026-10-10

Full backend suite: **423 passed** (20 new notification checks including their
parent test). Full frontend regression suite: **141 passed**. Database integrity
suite: **27 passed**. Lint, production build, existing backend syntax command and
explicit syntax checks for all four
new runtime modules passed. Prisma format/validate/generate and migration deploy/
status passed; all nine migrations are applied. Dependency audit: **0 vulnerabilities**.
The existing frontend bundle-size warning remains. No browser visual verification
was performed; this subphase exposes backend contracts only. Real HTTP and both
Socket.IO transports were exercised through automated loopback integration tests.

Files created or modified in this subphase:

* `backend/src/notifications/notification-service.js` (new)
* `backend/src/notifications/realtime.js` (new)
* `backend/src/routes/notifications.js` (new)
* `backend/src/auth/session.js` (new)
* `backend/src/app.js`, `backend/src/server.js`
* `backend/src/routes/auth.js`, `backend/src/middleware/authenticate.js`
* `backend/src/incidents/incident-engine.js`, `backend/src/incidents/incident-management.js`
* `backend/prisma/schema.prisma`
* `backend/prisma/migrations/20261010000200_incident_notifications/migration.sql` (new)
* `backend/package.json`, `package-lock.json`
* `backend/tests/notifications.integration.test.js` (new)
* `backend/tests/incident-cleanup.js`, `backend/tests/incident-engine.integration.test.js`
* `backend/tests/incident-management.integration.test.js`, `backend/tests/mfa-rbac.integration.test.js`
* `docs/realtime-notifications.md` (new), `docs/incident-management.md`

The local generated Prisma client was regenerated. Frontend production output was
rebuilt for validation; frontend source is unchanged. No Git commands, paid APIs,
database reset, migration removal, deterministic risk-policy or AI-budget changes
were performed. Phase 10C1 is complete; Phase 10C as a whole awaits 10C2.
