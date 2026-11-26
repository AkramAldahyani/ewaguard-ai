# Notifications and real-time updates

## In short

When something important happens to an incident, EWAGuard AI saves a
**notification** in the database for each person who should know. A bell in the
header shows the unread count. A live **Socket.IO** connection tells open
browsers "something changed, please refresh", so new alerts appear within about
five seconds without reloading the page.

The live connection carries **no content**, only a signal. The browser then
fetches the details through the normal, permission-checked API.

## Who is notified about what

| Incident event | Who gets a notification | Kind |
| --- | --- | --- |
| Automatic HIGH/CRITICAL incident created | Active administrators with MFA | `INCIDENT_CREATED` |
| Employee reports entered credentials | Administrators | `EXPOSURE_REPORTED` |
| Incident assigned | The assigned administrator; other administrators get an update | `INCIDENT_ASSIGNED` / `INVESTIGATION_UPDATED` |
| Unassigned | Administrators | `INVESTIGATION_UPDATED` |
| Status changed | The employee who reported it and administrators | `STATUS_CHANGED` |
| Shared (REPORTER) note | The employee; administrators get an update | `EMPLOYEE_UPDATE` / `INVESTIGATION_UPDATED` |
| Private note | Administrators only | `INVESTIGATION_UPDATED` |

Each notification contains fixed text, the incident reference, the kind, the
severity, times and read state. CRITICAL ones are marked **urgent**. They never
contain analysis content, evidence, incident descriptions, note text or who did it.

Notifications are created **in the same transaction** as the incident change, so a
change can never succeed without its notifications (or the other way round). A
unique key per recipient and event prevents duplicates.

## The live connection (Socket.IO)

- Address: `/api/realtime` on the same site, using the normal session cookie (`withCredentials`). Tokens are never put in the URL.
- Only trusted origins can connect. The session is fully checked on connect and **before every signal** (account status, role, MFA, revoked sessions, expiry).
- The server puts each socket into its own rooms (`user:<id>`, and `verified-administrators` for administrators). Clients **cannot** join rooms or send events; trying disconnects them.
- Logout, account changes and session expiry disconnect the socket.
- Every 5 seconds a dispatcher checks for committed changes and sends signals:
  - `notifications:ready`: just connected; fetch the latest list.
  - `notifications:changed`: refresh the bell and list.
  - `incidents:changed`: refresh the incident page you are looking at.
- Limits per server process: 4 KiB messages, 5 sockets per user, 1,000 connections, 30 connection attempts per address per minute.

Because the inbox lives in the database, nothing is lost while a user is offline:
they see everything next time they connect. A signal is not proof that a person
saw an alert (`deliveredAt` is not set).

## REST API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/notifications?limit=20&before=<cursor>&unread=true` | List (newest first, 1–100 per page) |
| GET | `/api/notifications/unread-count` | Unread count |
| POST | `/api/notifications/:id/read` | Mark one as read (body `{}`; repeat is harmless) |

Each user sees only their own notifications. Employees see a notification only
while they still own the incident. Marking read creates a `NOTIFICATION_READ`
audit record. Limit: 120 requests per minute. Notifications expire after 90 days
by default.

## In the browser

- One in-memory notification store per signed-in user; nothing is saved in `localStorage`.
- The bell shows the unread count (99+ for large numbers) and an urgent marker for unread CRITICAL alerts.
- The panel lists severity, reference, time and read state, links to the incident and has **Load more**.
- Bursts of signals are combined (150 ms) into one refresh.
- Reconnection is tried up to five times (1, 2, 4, 8, 16 seconds), then a **Reconnect** button appears. Status shows connecting / live / reconnecting / offline.
- No pop-up toasts, so reconnecting never floods the screen.
- If an administrator is editing an incident when a signal arrives, the form is **not** replaced; a "refresh pending" notice appears instead, and the stale-edit check still protects the save.

## Deployment notes

- The reverse proxy must forward WebSocket upgrades and long polling for `/api/realtime`. Never allow all origins (`*`).
- Connection limits are per process. Multiple backend processes would need a shared Socket.IO adapter and shared limits.

## Code and tests

- Backend: `backend/src/notifications/notification-service.js`, `backend/src/notifications/realtime.js`, `backend/src/routes/notifications.js`
- Frontend: `frontend/src/features/notifications/`
- Tests: `backend/tests/notifications.integration.test.js` (real Socket.IO clients), `frontend/tests/notifications.test.mjs`, `frontend/tests/notification-transport.test.mjs`
