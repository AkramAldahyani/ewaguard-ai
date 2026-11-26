# Email analyzer

## In short

At **Analyze Email** (`/analyze/email`) an employee can paste a suspicious email
(body and optional headers) or upload an `.eml` file. The server reads it safely,
collects warning signs, and the [risk engine](risk-engine.md) gives a score and
level with advice. HIGH or CRITICAL results automatically create an
[incident](incidents.md).

The email is **never opened in a browser**, links are **never visited** and
attachments are **never opened**. Only a minimized summary is saved.

## Step by step

1. The employee accepts the [sensitive-information notice](disclaimers.md) (required, valid 15 minutes).
2. They choose **Paste Email** or **Upload .eml** and submit.
3. The server checks: signed in, employee role, trusted origin, rate limit (30 per minute), and the acknowledgement.
4. The input is parsed with **MailParser**; HTML is read with **htmlparser2** as plain tokens (nothing is executed).
5. The analyzer collects evidence (see below) and gives a provisional finding.
6. The risk engine produces the final score, level, confidence, reasons and advice.
7. A minimized record is saved, and an incident is created if the level is HIGH or CRITICAL.
8. The page shows the result. Links are shown as plain, non-clickable text.

## What it checks

**Sender and identity**
- Missing, malformed, duplicate or multiple `From` addresses
- `Reply-To` that differs from the sender (different domain or different mailbox)
- Display names claiming a brand or authority ("PayPal", "IT Support") while the address does not match
- **Look-alike sender domains** (for example `paypa1` imitating PayPal), when the email also claims that brand
- International (IDN) domains and unusually many domain parts
- `Return-Path` is shown for information only and never saved

**Content**
- Urgency and account threats
- Password reset, login or credential requests
- Requests for MFA codes
- Payments, wire transfers, gift cards and payment-dispute lures
- Requests to bypass normal process
- Invitations to open attachments or enable macros

These are simple English-language patterns. They can match innocent text and miss
clever or non-English wording. Text is normalized first (invisible characters
removed, wrapped lines joined) so line breaks do not hide phrases.

**Links**
- Plain HTTP, IP-address hosts, punycode, very long hostnames, embedded credentials, unusual schemes, URL shorteners
- Link text that shows one address but points to another
- Only the scheme and host (the "origin") are kept. Paths, query strings and fragments are dropped.

**Authentication headers (SPF / DKIM / DMARC)**
- Read from `Authentication-Results` and `Received-SPF` when present.
- Reported as `HEADER_CLAIM`, `CONFLICTING_CLAIMS` or `UNAVAILABLE`. They are **always marked unverified**, because anyone can forge headers in a pasted or uploaded email.
- A "pass" never lowers the risk.

**Attachments**
- Name (redacted), claimed type, size and category: executables/scripts, macro-capable files, archives, double extensions, hidden text-direction characters.
- Every attachment is marked **NOT SCANNED**. Email attachments are not run through ClamAV or YARA; use the [file analyzer](file-analyzer.md) for that.
- Email links are not looked up on VirusTotal ("NOT CHECKED"); use the [URL analyzer](url-analyzer.md).

## Provisional finding vs final risk

The analyzer gives its own quick label: **No Strong Indicators**, **Suspicious**
or **Highly Suspicious**. This is shown separately and is **not** the final
result. The final LOW / MEDIUM / HIGH / CRITICAL level always comes from the risk
engine (current model **1.1**).

Because email evidence comes from unverifiable content, an email on its own
cannot reach CRITICAL. It can become CRITICAL only when the employee **confirms
they entered their credentials** (see [incidents](incidents.md#reporting-entered-credentials)).

## Limits

| Item | Limit |
| --- | --- |
| Pasted body / headers | 24 KiB / 8 KiB (UTF-8 bytes) |
| `.eml` file | 1 MiB, one file |
| `.eml` header section | 64 KiB and 1,000 lines |
| Decoded text + HTML | 2 MiB |
| Attachments / URLs examined | 20 / 200 |
| Concurrent analyses | 4 per server; extra requests get 503 |

Input is never silently cut short: oversized input is rejected.

## What is saved

One database insert with: owner, acknowledgement, indicator codes, provisional
finding, input mode, unverified authentication states, counts, attachment
categories and sizes, and the risk result. Records expire after 30 days by
default (see [privacy and retention](privacy-and-retention.md)).

**Not saved:** the body, headers, subject, addresses, links, attachment names or
bytes. The displayed result additionally hides likely secrets (labeled
passwords, tokens, keys) and masks email address local parts.

## API

| Method | Endpoint | Body |
| --- | --- | --- |
| POST | `/api/analysis/email/text` | JSON `{ "body": "...", "headers": "..." }` |
| POST | `/api/analysis/email/eml` | multipart with one field named `file` |

Success: HTTP 201 `{ analysisId, createdAt, result }`. The page also sends an
`Idempotency-Key` so a retry after a network error returns the saved result
instead of analyzing twice. Errors use `{ error: { code, message } }`: 400 bad
input, 401 not signed in, 403 wrong role/origin or missing acknowledgement, 413
too large, 415 wrong type, 429 too many requests, 503 busy.

## Example: a real phishing email

A reported PayPal-style phishing email first scored **19 / LOW** under the original
model. Investigation found missing checks: no look-alike sender detection, no
email shortener rule, PayPal missing from the brand list and no payment-dispute
pattern. After the fixes (model 1.1) the same kind of email scores **67 / HIGH**:

| Evidence | Points |
| --- | ---: |
| Sender domain imitating the claimed brand | 25 |
| Reported authentication failure | 15 |
| Payment-dispute instruction | 15 |
| URL shortener | 8 |
| Urgency | 4 |
| **Total** | **67 → HIGH** |

A sanitized reconstruction of this email is a permanent test
(`backend/tests/fixtures/reported-paypal-phishing.eml`). Older saved results keep
their original model version and are not rescored.

## Code and tests

- `backend/src/analyzers/email/` and `backend/src/analyzers/domain-indicators.js`
- `backend/src/routes/email-analysis.js`
- `frontend/src/features/email/`
- Tests: `npm run test:email`, `npm run test:email:api`, `npm run test:email:ui`, `backend/tests/email-phishing-regression.test.js`
