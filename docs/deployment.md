# Public hosting (ewaguard-ai.com)

EWAGuard AI is published from one Windows PC at **https://ewaguard-ai.com**.
No router ports are opened. The PC makes an outbound, encrypted connection to
Cloudflare, and Cloudflare sends visitors down that connection.

## How a visit reaches the app

```text
Visitor's browser  ──https://ewaguard-ai.com──▶  Cloudflare (HTTPS certificate, hides the home IP)
        │  outbound tunnel opened by the PC
        ▼
cloudflared        Windows service "cloudflared", tunnel "ewaguard"
        │  http://127.0.0.1:8080
        ▼
Caddy              serves frontend/dist; forwards /api and the /api/realtime WebSocket
        │  http://127.0.0.1:5100
        ▼
Express backend    production mode → PostgreSQL, ClamAV, YARA, OpenAI
```

Everything on the PC listens on `127.0.0.1` only. `www.ewaguard-ai.com` and
plain `http://` are redirected to `https://ewaguard-ai.com`.

## Files

| File | Purpose |
| --- | --- |
| `deploy/windows/Caddyfile` | Web server: static site, `/api` proxy, security headers, redirects |
| `deploy/windows/run-backend.cmd` | Starts the backend with `.env.production`; restarts it if it stops |
| `deploy/windows/run-caddy.cmd` | Starts Caddy; restarts it if it stops |
| `deploy/windows/install-autostart.ps1` | One-time admin setup: cloudflared service and the two start-up tasks |
| `deploy/windows/restart-site.ps1` | Admin helper to restart Caddy and/or the backend after a change |
| `.env.production` | Production settings and secrets. **Git-ignored; never commit it.** |
| `logs/` | `backend.log`, `caddy.log` and setup logs (git-ignored) |

## Production settings

`run-backend.cmd` sets `EWAGUARD_ENV_FILE` to `.env.production`, so the backend
reads that file **instead of** the development `.env`. The two never mix.

| Setting | Value | Why |
| --- | --- | --- |
| `NODE_ENV` | `production` | Secure `__Host-` session cookie; HTTPS origin required |
| `FRONTEND_URL` | `https://ewaguard-ai.com` | The only origin CORS, Socket.IO and the trusted-origin check accept |
| `HOST` / `PORT` | `127.0.0.1` / `5100` | Reachable only through Caddy; does not clash with `npm run dev` on 5000 |
| `TRUSTED_PROXY` | `loopback` | Caddy passes the visitor's address, so each visitor has their own sign-in limit |
| `DEMO_ACCOUNT_SETUP_ENABLED` | `false` | Required in production (the app refuses to start otherwise) |
| `RAG_DEMONSTRATION_ENABLED` | `true` | The assistant answers from the seven sample company policies, always labeled as demonstration |
| `JWT_SECRET` | its own random value | Production sessions are separate from development sessions |
| `MFA_ENCRYPTION_KEY`, `TOOL_APPROVAL_ENCRYPTION_KEY` | same as development | The same database is used; a new key would lock administrators out of MFA |

The site uses the **same PostgreSQL database** as development.

## Starting automatically

| Part | How it starts after a reboot |
| --- | --- |
| PostgreSQL | Windows service (Automatic) |
| cloudflared | Windows service (Automatic) |
| Caddy | Task Scheduler `\EWAGuard\EWAGuard AI Caddy`, at start-up |
| Backend | Task Scheduler `\EWAGuard\EWAGuard AI Backend`, at start-up |

The two tasks run as the PC's own user account without administrator rights
(not as SYSTEM) and start 30 seconds after boot, even if nobody signs in.
The site is back about one minute after Windows starts. While the PC is off or
asleep, visitors see a Cloudflare error page. The link itself never changes.

## Everyday tasks

| I want to… | Do this |
| --- | --- |
| Publish frontend changes | `npm run build`. Caddy serves the new files immediately; no restart. |
| Publish backend changes or edit `.env.production` | In an **administrator** PowerShell: `deploy\windows\restart-site.ps1 -Part Backend` |
| Change the Caddyfile | Administrator PowerShell: `deploy\windows\restart-site.ps1 -Part Caddy` |
| See what happened | Read `logs\backend.log` and `logs\caddy.log` |
| Check the tunnel | Cloudflare dashboard → Networking → Tunnels → `ewaguard` (should be *Healthy*) |
| Take the site offline | Administrator PowerShell: `Stop-Service cloudflared` (start it again with `Start-Service cloudflared`) |

`Stop-ScheduledTask` alone is not enough to restart a part: it ends only the
task's `cmd` wrapper and leaves Caddy or Node running. Use `restart-site.ps1`.

## Security notes

- The tunnel token lives only in the cloudflared service settings. The setup
  script read it from the clipboard, never printed it, and cleared the clipboard.
  If it leaks, use **Refresh token** on the tunnel page in Cloudflare and run
  `install-autostart.ps1` again after `cloudflared service uninstall`.
- Caddy trusts forwarded headers only from `127.0.0.1` (cloudflared), and the
  backend trusts them only from Caddy, so visitors cannot fake their address.
- Static pages get a strict Content-Security-Policy, HSTS, `nosniff`,
  `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`. API responses keep
  the backend's own Helmet headers.
- Company-policy answers come from fictional sample policies. Every answer starts
  with `DEMONSTRATION / NOT OFFICIALLY APPROVED`. Activating or changing which
  samples are searchable still works only in development.
