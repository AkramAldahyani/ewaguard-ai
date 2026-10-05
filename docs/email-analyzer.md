# Phase 6A1 — Email parsing and evidence

Implemented: internal parsing/evidence library and tests. No public email API,
upload endpoint, database write, history endpoint, UI integration, AI, malware
scanner, or central risk engine is implemented by 6A1. Email remains a preview.

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
controls, not a hard CPU deadline; future API work must also bound request concurrency
and rate. JSON escaping can expand request bytes: 6A2 must set a route-specific JSON
cap compatible with these decoded limits without enlarging all other routes.

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
No persistence happens in 6A1. Immutable JavaScript strings cannot be securely erased.

## Remaining subphases

- 6A2: authenticated EMPLOYEE routes, trusted origin, server-side current EMAIL_ANALYSIS
  acknowledgement verification with an explicit age, bounded .eml upload, persistence
  using this projection, and API security tests. Validate extension/type/shape without
  trusting the client filename or Content-Type. Apply limits before buffering.
- 6A3: employee input/results UI, escaped text only, stale acknowledgement handling,
  end-to-end verification and final documentation. No raw HTML rendering.

## Validation and references

`npm run test:email` exercises benign/suspicious synthetic messages, authentication
claims, safe MIME attachments, HTML links, privacy projection and rejection paths.
It is also included in `npm test`. Fixtures contain harmless text, never malware.

MailParser API and its HTML-safety limitations:
[official MailParser documentation](https://nodemailer.com/extras/mailparser).
