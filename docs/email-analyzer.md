# Phase 6A1 — Email parsing and evidence

Phase 6A1 implements the internal parsing/evidence library. Phase 6A2 adds
authenticated submission APIs and minimized persistence. Phase 6A3 connects the
employee portal at `/analyze/email`. No history endpoint, AI, malware scanner,
central risk engine, or incident creation is added.

## Phase 6A3 employee experience

The existing EMPLOYEE-protected route opens with the mandatory Sensitive Information
Notice and an unchecked acknowledgement. Only a successful acknowledgement API
response unlocks the form. Native, keyboard-operable radio controls select
**Paste Email** or **Upload .eml**. The shared API client sends credentialed JSON
or multipart requests; it lets the browser generate multipart boundaries and
preserves the existing session-expiry handling.

Paste mode has a required message body and optional raw headers, with UTF-8 byte
counters and a body character counter. Limits match the backend: 24 KiB body,
8 KiB headers. Input is never silently truncated. Upload mode supports a normal
keyboard-accessible picker and drag/drop of exactly one nonempty `.eml`, up to
1 MiB, with filename, size and removal controls. The browser never reads its
contents or opens attachments. Frontend checks are UX only; API validation is
authoritative. Switching modes clears the previous draft.

The page transitions through idle, validating, submitting, success and error.
Duplicate submissions are synchronously blocked, controls are disabled while
submitting, and a live status announces "Analyzing email" without claiming malware
scanning. A result receives focus and displays:

- Analysis identity, time, subject when available and readable provisional finding.
- Minimized sender and Reply-To metadata and mismatch evidence.
- SPF/DKIM/DMARC header claims, including unavailable and conflicting claims,
  explicitly not independently verified.
- Indicator categories, titles and evidence notes, without internal weights or regexes.
- URL origins as non-clickable text, with no previews, favicon requests or domain contact.
- Attachment names, types, sizes and categories marked **NOT SCANNED**, without
  open/download actions.
- Backend-provided deterministic recommendations and visible limitations.

The labels No Strong Indicators, Suspicious and Highly Suspicious are analyzer-local
findings. They are never mapped to LOW/MEDIUM/HIGH/CRITICAL or represented as a final
risk score. The UI explicitly explains that final evaluation will use the future
EWAGuard risk engine. No strong indicators does not guarantee safety. URL reputation
checking is not included, attachments are not malware-scanned, supplied authentication
headers may be forged and heuristic checks can miss sophisticated phishing.

When the backend requires a renewed acknowledgement (15-minute validity), the page
clears transient content, explains the renewal requirement and reopens an unchecked
notice. The employee can acknowledge and resubmit without reloading. Failed
submissions use fixed, user-friendly messages rather than backend exception text.
Session expiry follows the existing login redirect. Network/server errors allow retry;
the UI does not claim a failed submission was stored.

Raw body, headers and file references are cleared on success, reset, mode change,
acknowledgement expiry and page disposal. Analyze Another Email and Clear Result
clear the displayed result and errors as well. Requests are aborted on reset/disposal;
late responses cannot repopulate the page. Aborting a request does not undo an insert
already completed by the server. The page uses no browser storage, analytics or
content logging. Normal retry errors keep the draft until retry, clear or navigation.
Only minimized evidence is stored by the backend; raw uploads are not persisted.
Transient JavaScript strings cannot be securely erased.

Labels, field hints, native mode selection, semantic headings, status/error
announcements and focus movement support keyboard and assistive-technology use.
Responsive grids stack on smaller screens and long metadata wraps. The page uses
the existing design system and reduced-motion styles; no email HTML is injected.

`npm run test:email:ui` covers rendered components, the actual page state controller,
API-client contracts, UTF-8 boundaries, safe results, error mapping, renewal,
duplicate prevention, reset and stale responses. Portal tests retain employee/admin
route coverage. Browser automation was unavailable in the Phase 6A3 environment;
visual layout, actual keyboard interaction and browser-console checks remain
unverified. A live application HTTP smoke run through the Vite proxy used the real
frontend client/controller, login, acknowledgement, both modes, benign/suspicious
messages, malformed/oversized rejection, stored evidence inspection, expiry renewal,
reset and logout. All disposable database records were removed afterward.

## Phase 6A2 API contracts

- `POST /api/analysis/email/text`: `Content-Type: application/json`, body
  `{ "body": "Message text", "headers": "From: person@example.invalid" }`.
  Body is required and nonblank; headers are optional. Only these two string
  fields are accepted. Unknown fields (including userId, inputType, acknowledgementId
  and version), invalid types and arrays fail with 400.
- `POST /api/analysis/email/eml`: `multipart/form-data` with exactly one file
  field named `file`. No text fields or extra files are accepted.
- Success: HTTP 201 with `{ analysisId, createdAt, result }`; `result` is the
  Phase 6A1 display result below, not a database row. All email responses use
  `Cache-Control: no-store`. No retrieval endpoint is provided in this phase.

Both endpoints reuse the authentication cookie, current DB account status/role,
EMPLOYEE RBAC and trusted-origin middleware. Administrators (including fully
MFA-authenticated administrators) cannot submit. The server finds a current-version
EMAIL_ANALYSIS acknowledgement belonging to the employee and rechecks it with the
Phase 5B `verifyAcknowledgement` service. Its age must be at most 15 minutes;
future timestamps are rejected. First use `POST /api/disclaimers/acknowledge` with
`{ "context": "EMAIL_ANALYSIS" }`. No client-supplied acknowledgement ID or version
is accepted. The validity window is a named server policy constant.

Order: authentication → role → trusted origin → submission limit → concurrency
limit → acknowledgement verification → bounded input parsing/validation → analyzer
→ minimized projection → atomic database insert → safe response.

Pasted limits remain 24 KiB body and 8 KiB headers, measured as UTF-8 bytes. This
route alone permits a JSON envelope up to 197,632 bytes (sixfold JSON escaping plus
1 KiB overhead); all other JSON routes retain 32 KiB. Compressed email JSON is
rejected. EML is limited to exactly 1,048,576 bytes, with RFC822/MIME complexity
bounds from 6A1. Multer memory storage is used only on the EML route, after access
and acknowledgement checks. File count, field count and part count are bounded.
The original filename is used only to check `.eml` (case-insensitive), never as a
path or persisted metadata. Allowed claimed MIME types are `message/rfc822`,
`application/octet-stream`, and `text/plain` for common client fallbacks. Regardless
of MIME, the existing RFC822 shape validation and MailParser processing must pass.
Renamed arbitrary content fails those checks; a deliberately RFC822-shaped file
can pass. This is not perfect type detection or malware scanning.

The shared limiter permits **30 submissions per employee per minute**, counting
invalid attempts after authorization. Both modes share the budget. At most four
email requests may buffer/analyze concurrently per app instance; additional work
gets 503. Rate-limited work gets 429 with Retry-After. Limits use process-local
state like the existing limiters; multiple replicas would need a shared limiter
and deployment-level connection/time/body limits.

Errors use the existing `{ error: { code, message } }` format: 401 anonymous or
inactive session; 403 wrong role/origin/missing current acknowledgement; 400 invalid
input, malformed JSON/EML or parser rejection; 413 oversized content; 415 unsupported
content type/encoding; 429 rate limit; 503 busy; 500 unexpected or persistence failure.
Neither error bodies nor operational logs contain raw input or exception details.
No successful response is returned unless the database insert succeeds.

## Phase 6A2 storage and privacy

The existing `email_analyses` model is reused without schema changes or migrations.
A single atomic `create` assigns the authenticated employee and server-verified
acknowledgement, COMPLETED status, timestamps, and `minimizeEmailEvidence(result)`
in `evidence`. That projection includes analyzer/version, PASTED/EML input mode,
provisional classification, indicator IDs, unverified authentication states,
counts and attachment categories/sizes for future deterministic risk evaluation.
Sender/reply-to domains and final risk fields remain null. Display results are
returned only in the response; they are not stored.

No raw body, headers, EML, HTML, attachment bytes, subject, address, URL, attachment
filename or submitted free text enters persistence. This excludes secret/password
strings without relying on best-effort redaction. No new content logging is added;
existing authorization and generic error logs retain only fixed categories/IDs.
Upload buffers are cleared after processing; JavaScript strings and parser copies
remain transient and cannot be reliably erased. No upload is written to disk.

Records receive `expiresAt` 30 days after analysis. This is expiry metadata only:
there is no automatic cleanup scheduler in this phase. Operators must enforce
retention through the deployment's cleanup process, including backups. Existing
acknowledgement foreign keys and ownership/context triggers remain in effect.
The pgvector HNSW index is unchanged.

`npm run test:email:api` performs real PostgreSQL and loopback HTTP integration
checks, including employee login, acknowledgement, both submissions, stored row
inspection, malformed/admin rejection and logout. Fixtures and analysis rows are
deleted afterward. Parser/write failures use explicit injected test dependencies;
ordinary parsing, auth and persistence tests use the real implementations.

## Internal contract

Call `analyzeEmail` from `backend/src/analyzers/email/email-analyzer.js` with one mode:

```js
await analyzeEmail({ inputType: 'PASTED', body: 'Message text', headers: 'From: user@example.invalid' });
await analyzeEmail({ inputType: 'EML', eml: Buffer.from(rawRfc822Message) });
```

Extra fields, mixed modes, wrong types and empty messages are rejected. Pasted body
remains separate from parsed headers: a supplied base64/MIME header cannot reinterpret
ordinary pasted text. MIME messages use MailParser. HTML is tokenized with htmlparser2
to extract text and anchor destinations; no browser is involved and nothing is executed.
Both plain text and HTML alternatives contribute evidence. Bodies and attachment bytes
are transient only and are not returned by the analyzer.

## Bounds and error contract

`email-policy.js` defines byte limits: pasted body 24 KiB, headers 8 KiB, EML 1 MiB,
decoded text plus HTML 2 MiB. It also bounds header lines (100), Content-Type
declarations (100), MIME delimiter lines (200), attachments (20), URL candidates
(200), URL length (2,048 characters), and returned unique origins (50).

Oversized inputs are rejected before MailParser; decoded size and attachment count
are checked afterward. HTML-to-text generation, text-to-HTML generation, automatic
linkification and CID-to-data-URL conversion are disabled in MailParser. It buffers
attachments within the bounded input; no archives or attached messages are opened.
Inputs with malformed headers or missing multipart closing boundaries are rejected.
MailParser remains lenient about some other damaged MIME. This is deliberately a
bounded supported subset, not a full RFC validator or a malware sandbox.

Failures use `EmailAnalysisError` with fixed codes/messages: INVALID_EMAIL_INPUT,
EMAIL_INPUT_TOO_LARGE, MALFORMED_EMAIL, EMPTY_EMAIL, EMAIL_PARSE_FAILED. Original
parser exceptions and submitted content are not included. The limits are resource
controls, not a hard CPU deadline. Phase 6A2 also bounds request concurrency and
rate, with a route-specific JSON cap compatible with these decoded limits.

## Evidence and provisional findings

Sender checks cover unavailable or malformed addresses, duplicate/multiple From,
Reply-To differences, brand/authority display-name claims, display-address mismatch,
internationalized domains and numerous domain labels. Display-name claims are only
possible impersonation signals. Local-part comparison is conservative and may flag
legitimate aliases.

Content checks cover urgency/account threats, password reset, credential/login
requests, payments/wire transfers, gift cards, MFA-code requests, process bypass,
and attachment/macro invitations. These transparent English-language patterns can
match legitimate or negated statements and miss paraphrases or other languages.

URL evidence covers HTTP, IP hosts, punycode, many hostname labels, embedded credentials,
unsupported schemes, and URL-label/destination mismatch. No URL is visited, including
private addresses. Only canonical origins are returned; credentials, paths, query
parameters, fragments and link labels are omitted. Duplicate origins are collapsed.
An extraction-limit indicator makes incomplete URL coverage explicit. Hidden CSS,
images, obfuscation, relative links and complex browser rendering are not analyzed.

Each indicator carries a stable ID, category, fixed explanation and local weight.
`NO_STRONG_INDICATORS` is the default. Any weight >= 2, or sum >= 3, gives SUSPICIOUS.
A sum >= 7 across at least two positive-weight categories gives HIGHLY_SUSPICIOUS.
An urgency word alone does not produce SUSPICIOUS. Repeated instances of a rule do
not multiply its weight. Thresholds are provisional heuristics, not empirically
calibrated accuracy claims. No LOW/MEDIUM/HIGH/CRITICAL severity, risk score, incident
or escalation is produced. Rules are versioned `6A1.1` for later Risk Engine use.

## Authentication and attachment limitations

Authentication-Results and Received-SPF can supply claimed SPF/DKIM/DMARC results.
Comments and quoted strings are excluded before extracting method=result clauses.
Multiple differing values are CONFLICTING_CLAIMS; absent/unparseable results are
UNAVAILABLE. A single recognized result has status HEADER_CLAIM and a separate
claimedResults array. `verified` is always false. All submitted headers can be
forged; no trusted inbound mail-server boundary exists. DKIM-Signature and ARC
presence are booleans and never imply a successful verification.

Attachment metadata includes redacted filename, claimed content type, extension,
decoded size and category. Executables/scripts, macro-capable files, archives,
double extensions and text-direction controls produce indicators. Extensions and
MIME types are untrusted metadata, not file-content detection. Every attachment
reports NOT_SCANNED; ClamAV/YARA and secure general file analysis belong to 6C.

## Privacy and persistence handoff

The returned result has redacted display names/subjects/filenames, masked address
local parts, recipient counts and a Message-ID presence flag. It excludes the raw
message, headers, recipients, Message-ID value, body excerpts and attachment bytes.
Display redaction recognizes labeled credentials, bearer tokens, some key formats,
private-key blocks and long token-like strings. It removes control/bidi characters.
It can miss short, unlabeled or obfuscated secrets and can over-redact ordinary text.
Treat even redacted display results as sensitive; never log or blindly persist them.

`minimizeEmailEvidence(analyzerResult)` is the separate allow-listed persistence
projection for 6A2: fixed indicator IDs, provisional finding, input type, unverified
authentication states, counts and attachment categories/sizes. It omits **all**
submitted free text, including sender domains, origins, filenames, and subject.
It takes trusted analyzer output, never an arbitrary client-provided result.
Phase 6A2 persists this projection only. Immutable JavaScript strings cannot be securely erased.

## Phase status

6A1, 6A2 and 6A3 are implemented. The separate [Phase 6B URL analyzer](url-analyzer.md)
is implemented; email URL enrichment remains deferred. Phase 6C has not been started.

## Validation and references

`npm run test:email` exercises benign/suspicious synthetic messages, authentication
claims, safe MIME attachments, HTML links, privacy projection and rejection paths.
It is also included in `npm test`. Fixtures contain harmless text, never malware.

MailParser API and its HTML-safety limitations:
[official MailParser documentation](https://nodemailer.com/extras/mailparser).

Upload middleware: [official Multer documentation](https://expressjs.com/en/resources/middleware/multer/).
Multer 2.4.0 is the installed minimum for this phase.
