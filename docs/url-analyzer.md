# Phase 6B — URL Analyzer

The employee route `/analyze/url` is operational. This phase adds deterministic
URL evidence and an analyzer-local provisional finding. It does not implement
the central risk engine, final severity, OpenAI, incidents, or any Phase 6C work.

## Architecture and API

`POST /api/analysis/url` accepts exactly `{ "url": "https://example.com/" }`.
The response follows the email analyzer envelope:

```text
analysisId, createdAt, result:
  analyzer, version, normalizedUrl, localIndicators, dnsEvidence,
  tlsEvidence, threatIntelligence, provisionalClassification,
  recommendations, limitations
```

Authentication, database-authoritative EMPLOYEE role, trusted origin, and a current
URL_ANALYSIS acknowledgement are mandatory. The existing acknowledgement API is
used with the current disclaimer version, owned by the session employee and aged
no more than 15 minutes (future acknowledgements are rejected). The employee must
actively check the notice; no acknowledgement is inferred from pressing Analyze.
Administrators and anonymous callers are denied. Client identity fields and all
other unknown fields are rejected. There is no analysis history/read endpoint.

Each employee can submit ten times per minute. The route has four concurrent
analysis slots, retained until work finishes even when the client disconnects.
Input JSON is capped at 26 KiB without compressed request bodies. Expected input
errors are 400; missing acknowledgement/role/origin are 403, expired sessions 401,
oversized JSON 413, wrong media type 415, rate limit 429, and busy analyzer 503.
Database/unexpected failures use the existing sanitized 500 envelope. Failed
analysis creates no partial record. Responses carry Cache-Control: no-store.

## Normalization and privacy

Only explicit `http://` and `https://` URLs are supported, with a maximum of 4096
input characters before trimming. Surrounding whitespace is trimmed. Embedded
whitespace, controls, bidi formatting, backslashes, malformed percent escapes,
encoded authority components, missing/extra scheme slashes, and all userinfo
(including empty userinfo) are rejected before WHATWG URL parsing can repair them.
Hostname labels and lengths are validated. Hostnames are lowercase ASCII/IDNA,
one trailing DNS dot is removed, standard ports and URL components are canonicalized.
Alternate numeric IP spellings are evaluated after canonicalization so they cannot
bypass the private-address checks. Default ports are reported explicitly.

The helper returns a transient URL object for local inspection and a separate safe
projection. The projection contains protocol, hostname, port, approximate domain,
IP/IDN/mixed-script flags, path length/segment counts, query count, recognized
parameter names, and a redacted display representation. Actual non-root paths,
**all** query values, unknown query names, and fragments are omitted. Recognized
secret names include token, access_token, auth, apikey, api_key, key, session,
code, password, secret, sig, and signature. These are privacy evidence, not votes
that a site is malicious.

This is minimization, not a guarantee of secret detection. Hostnames themselves
can contain sensitive data; users must not submit them. JavaScript strings cannot
be securely erased from memory. Results and input live only in frontend memory;
reset, success, failure, and unmount clear the appropriate transient state. No
localStorage, URL query routing, analytics, or clipboard persistence is added.

## SSRF, DNS, and TLS

There are **no HTTP requests to the submitted destination**, no redirects, and no
page downloads, favicons, images, previews, or shortener expansion. HTTPS requests
to the fixed VirusTotal API are the only HTTP requests made by the analyzer.

`ipaddr.js` is a small direct backend dependency used to classify IPv4/IPv6. Only
public unicast addresses are eligible. Loopback, private, link-local, metadata,
CGNAT, multicast, documentation, benchmarking, reserved and transition/mapped
ranges are blocked. IPv6 must additionally fall within 2000::/3, excluding special
2001::/23, 2002::/16, and documentation 3fff::/20. The policy deliberately errs on
the side of blocking special-purpose addresses. Single-label and recognized
local/internal/test/development suffixes are rejected before resolution.

DNS uses a per-request cancellable resolver, bounded A and AAAA queries (1500 ms,
one try), and a 2500 ms overall deadline. Every returned address is checked; one
private address rejects the whole analysis. No answers, incomplete resolution,
or more than 32 addresses prevents all TLS/provider enrichment while preserving
local analysis. ENODATA/ENOTFOUND for an absent family is tolerated if the other
family returns usable public answers. Addresses and CNAME values are not returned
or stored. CNAME chains are covered by checking final resolved addresses; this
phase does not separately enumerate domain aliases or WHOIS.

TLS connects to exactly one validated numeric public IP on HTTPS port 443, using
the hostname for SNI. There is no second DNS resolution, which prevents DNS
rebinding between validation and connection. Other ports are reported SKIPPED_PORT
and never probed. The handshake has a three-second wall-clock deadline and is
destroyed immediately after certificate metadata is extracted. No application
data is written. The metadata probe observes invalid certificates intentionally;
it reports chain authorization, hostname matching, validity dates, expired and
not-yet-valid flags rather than accepting the certificate for an HTTP exchange.
Normal provider HTTPS certificate verification remains enabled. Raw certificates,
SANs, issuer strings and TLS errors are not persisted. A valid certificate never
establishes website trustworthiness.

## Local checks and provisional classification

Checks cover HTTP, IP hosts, long hostnames/URLs, many subdomains/hyphens/query
parameters, at signs, heavy/nested encoding, IDN, mixed Latin/Greek/Cyrillic
scripts, selected TLD patterns, brand/account/security hostname patterns,
login/account/reset path keywords, URL shorteners, sensitive parameter names,
and unusual ports. Each result includes a fixed ID, explanation, source, and
small internal weight. These checks can produce false positives and negatives.
Domain extraction uses a documented small common-suffix approximation, not a full
Public Suffix List or an authoritative brand/domain ownership database.

The reproducible local rubric excludes sensitive parameter names from suspicion
weights. Most signals have weight 1; IP hosts, shorteners, mixed scripts, and brand
patterns have weight 2. The three labels are:

- NO_STRONG_INDICATORS: default, including one weak indicator or one provider vote.
- SUSPICIOUS: at least two structural indicators with combined weight of 3 (an
  expired/mismatched certificate can contribute 1), or at least three provider
  detections, or a provider detection together with structural weight of 2.
- HIGHLY_SUSPICIOUS: at least three structural indicators with weight of 6 plus
  at least three provider malicious/suspicious detections.

URL and domain provider counts are combined by maximum, never summed as independent
votes. A provider alone cannot produce HIGHLY_SUSPICIOUS. These labels do not claim
maliciousness or safety. Missing DNS, TLS, or provider checks are explicit coverage
limitations, not clean verdicts. Certificate age, HTTP, IDN, TLD, or login words alone
do not establish that a URL is malicious. Recommended actions are deterministic.

## VirusTotal provider

`createThreatIntelligence()` exposes reusable `lookupUrl()` and `lookupDomain()`
operations. It contains all VirusTotal API details. There is no file-hash operation
yet. Future callers must apply the same public-target DNS validation before
enrichment; the adapter also rejects syntactically private/internal targets.

`VIRUSTOTAL_API_KEY` is read by backend configuration only. The example is blank;
never put it in VITE_ variables. Only the x-apikey header to the fixed API receives
the key. Request headers, raw inputs, provider payloads and errors are not logged.

The implementation uses GET report endpoints, never scan submission or rescan.
Only root URLs without paths, queries or fragments are eligible for exact URL
report lookup. URL IDs are unpadded base64url encodings used only in the provider
request. Other URL reports are SKIPPED_PRIVACY and receive hostname reputation
where possible. This is deliberately conservative: VirusTotal's current domain
API documentation says even queried indicators may be scanned and included in
its shared dataset. The UI explains this before acknowledgement. A domain report
is not evidence about the exact submitted path. IP literals receive local/DNS/TLS
evidence but no external reputation lookup in this phase.

Normalized results contain provider, scope, status, integer counts, optional
integer reputation, last analysis date, and cache flag. Raw provider data, engine
strings, categories, provider IDs, and echoed URLs are excluded. Statuses include
AVAILABLE, NOT_CONFIGURED, NO_REPORT (404), UNAUTHORIZED (401/403), RATE_LIMITED
(429/local budget), TIMEOUT, MALFORMED_RESPONSE, UNAVAILABLE, BUSY, SKIPPED_PRIVACY,
NOT_APPLICABLE and SKIPPED_DNS. A missing key or provider error does not fail local
analysis. Successful zero-detection reports are not presented as proof of safety.

Requests have a 3500 ms deadline, abort support, a 512 KiB response limit, no
redirect following, and at most two concurrent requests. A per-instance rolling
four-requests-per-minute budget and 60-second cooldown after provider 429 protect
prototype quotas. URL/domain lookups run sequentially so a 429 prevents the next
network request. There are no retries. A maximum of 256 normalized cache entries
uses hashed safe identifiers; AVAILABLE/NO_REPORT TTL is ten minutes, failures
30 seconds. No raw URL secrets or keys enter the cache. This is a single-process
prototype limit; shared deployment would need coordinated quotas. Provider-side
daily/plan quotas still apply.

urlscan.io is deferred: active submissions, privacy/visibility management and
asynchronous scan polling would expand Phase 6B unnecessarily.

## Persistence

The existing UrlAnalysis model is reused without schema changes or migrations.
One atomic insert records server-derived employee and acknowledgement ownership,
COMPLETED status, timestamps, 30-day expiresAt, hostname, safe result JSON, and
SHA-256 of the **redacted representation**. That hash is a minimized grouping
identifier, not an exact original-URL fingerprint. Paths, query values, unknown
names, fragments, credentials, raw DNS addresses, certificates, and raw provider
payloads are not stored. Final riskScore, severity, and rule version remain null.
No incident or AI operation is invoked. Expiry metadata is present; automated
retention deletion remains an operational task (no new scheduler in this phase).
The pgvector schema and HNSW index are untouched.

## Validation

Automated provider calls are mocked. `npm test` includes backend URL unit and real
local PostgreSQL/HTTP integration tests. Run focused suites with:

```powershell
npm.cmd run test:url
npm.cmd run test:url:api
npm.cmd run test:url:ui
```

The suites cover normalization, SSRF encodings/ranges, private DNS answers, TLS
metadata, provider normalization/failures/privacy/quotas, classification boundaries,
auth/RBAC/origin, acknowledgements, persistence/privacy, safe errors, UI sections,
nonclickable rendering, input/loading/reset/abort behavior, and session failure.

Explicit live checks (not part of npm test):

```powershell
node backend/scripts/validate-url-live.js
# With the development application running; creates and removes a synthetic employee:
node backend/scripts/validate-url-runtime.js
```

These use only example.com. The direct provider check prints reachability,
normalized-response receipt, and secret-exposure status. The runtime check verifies
login, acknowledgement, benign analysis, malformed/private rejection, minimized
storage, and logout. Do not run these repeatedly against limited provider quotas.

On 2026-10-07: all requested automated regression commands, frontend build,
backend checks, Prisma validation, migration status and npm audit passed. The live
runtime check returned RESOLVED DNS, AVAILABLE TLS and both normalized VirusTotal
reports. The network-restricted run also verified graceful SKIPPED_DNS behavior.
React rendering and interaction-state tests passed; visual browser and browser
console inspection could not be performed because no browser was connected.

## References

- [VirusTotal URL report endpoint](https://docs.virustotal.com/reference/url-info)
- [VirusTotal domain report and indicator-sharing warning](https://docs.virustotal.com/reference/domain-info)
- [VirusTotal response envelope](https://docs.virustotal.com/reference/api-responses)
