# URL analyzer

## In short

At **Analyze URL** (`/analyze/url`) an employee pastes a suspicious link. The
server inspects the link's structure, looks up its DNS and TLS certificate, and
asks VirusTotal about its reputation. It **never opens the web page**. The
[risk engine](risk-engine.md) then scores the evidence.

## Step by step

1. The employee submits `{ "url": "https://example.com/" }` to `POST /api/analysis/url`.
2. The server checks: signed in, employee role, trusted origin, and rate limit (10 per minute per employee, 4 analyses at once per server).
3. The URL is **cleaned and validated** (see below). Unsafe or internal addresses are rejected.
4. **Local checks** look for suspicious patterns.
5. **DNS** is resolved and every returned address is checked to be public.
6. **TLS**: a short handshake reads certificate details from one validated public IP.
7. **VirusTotal** reputation is looked up (if a key is configured).
8. The risk engine scores the evidence; the result is saved; HIGH/CRITICAL creates an incident.

## Cleaning the URL

- Only `http://` and `https://` are accepted, up to 4,096 characters.
- Rejected before parsing: spaces inside, control or hidden direction characters, backslashes, broken `%` escapes, `user:password@` parts, and other tricks that browsers silently "repair".
- Hostnames are lowercased and converted to their ASCII form; alternate number spellings of IP addresses are normalized so they cannot sneak past the checks.

## Protection against SSRF

SSRF is when a server is tricked into contacting internal systems. The analyzer
prevents it:

- **No HTTP request is ever made to the submitted site**: no page download, redirects, previews, favicons or shortener expansion.
- Blocked targets: localhost, private networks, link-local, cloud metadata addresses, carrier-grade NAT, multicast, documentation and reserved ranges, and single-word or `.local`/`.internal`/`.test`-style names.
- **Every** DNS answer must be a public address. One private answer rejects the whole analysis.
- The TLS check connects to the **already-validated IP** (no second DNS lookup), only on port 443, with a 3-second limit, and closes immediately after reading the certificate. This prevents "DNS rebinding" tricks.
- DNS uses a 1.5-second query limit and a 2.5-second overall limit.

## Local checks

HTTP instead of HTTPS, IP-address host, very long host or URL, many subdomains or
hyphens, many query parameters, `@` signs, heavy encoding, international (IDN)
names, mixed alphabets (Latin/Greek/Cyrillic), unusual top-level domains,
brand-like or "account/security" words in the hostname (including look-alikes
like `paypa1`), login/reset words in the path, URL shorteners, sensitive
parameter names and unusual ports.

These can be wrong in both directions. A valid certificate or HTTPS never proves
a site is trustworthy.

## VirusTotal reputation

- Uses **read-only report lookups** (GET). The analyzer never submits a URL for scanning.
- For privacy, only **root URLs** (no path or query) get an exact URL lookup. Other URLs get a **domain** lookup instead (`SKIPPED_PRIVACY` for the URL part). IP addresses get no external lookup.
- Results keep only counts (malicious, suspicious, harmless, undetected), the reputation number and the report date.
- Possible statuses: `AVAILABLE`, `NOT_CONFIGURED`, `NO_REPORT`, `UNAUTHORIZED`, `RATE_LIMITED`, `TIMEOUT`, `MALFORMED_RESPONSE`, `UNAVAILABLE`, `BUSY`, `SKIPPED_PRIVACY`, `NOT_APPLICABLE`, `SKIPPED_DNS`.
- Protective limits: 3.5-second timeout, 512 KiB response cap, no redirects, 2 requests at once, 4 per minute, 60-second pause after a provider rate limit, a 10-minute result cache.
- The API key (`VIRUSTOTAL_API_KEY`) is used only on the server and never logged.
- A missing key or provider error never stops the local analysis. Zero detections are **not** proof of safety.

## Provisional finding

The analyzer shows its own quick label (**No Strong Indicators**, **Suspicious**,
**Highly Suspicious**) separately from the final risk. A provider vote alone
cannot produce "Highly Suspicious", and URL and domain votes are never added
together.

## What is saved

Owner, hostname, a hash of the **redacted** URL, the safe result and the risk
result. **Not saved:** paths, query values, fragments, credentials, DNS addresses,
raw certificates or raw provider responses. Records expire after 30 days by default.

## Code and tests

- `backend/src/analyzers/url/`, `backend/src/services/threat-intelligence.js`, `backend/src/routes/url-analysis.js`
- `frontend/src/features/url/`
- Tests: `npm run test:url`, `npm run test:url:api`, `npm run test:url:ui` (provider calls are mocked)
- Optional live checks (use real VirusTotal quota, only with `example.com`):
  `node backend/scripts/validate-url-live.js` and, with the app running, `node backend/scripts/validate-url-runtime.js`
