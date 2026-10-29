# Email phishing detection and risk policy 1.1

## Investigation

The path is `/api/analysis/email/eml` (bounded Multer upload and acknowledgement)
→ `parseEmailInput` (MailParser) → `analyzeEmail` (HTML tokenizer and local rules)
→ `persistEmailAnalysis` → `evaluateRisk` → minimized database evidence
→ `completeAnalysisEscalation` → incident, event, audit and notification records.
`EmailResults` displays the authoritative `result.risk`; AI receives a fixed,
minimized projection and cannot override the classification.

The original `sample3.eml` was initially not present in the workspace. The fixture
`backend/tests/fixtures/reported-paypal-phishing.eml` is a reconstruction from the
reported headers and description, not the original file. Its original policy
1.0 result was **19 / LOW**, with only authentication concern (15) and urgency
(4).

After the original file was supplied, a direct comparison using the Git HEAD
analyzer/evidence/risk modules reproduced **29 / MEDIUM** under policy 1.0 and
**67 / HIGH** under the updated code. The original had three old indicators:
reported authentication failure (15), a different Reply-To mailbox on the same
domain (10), and urgency (4). The domain matched throughout; neither version
reported a Reply-To domain mismatch. Under 1.1 the address difference adds zero
points because the lookalike already consumes the identity group's 25-point cap.
The original is a multipart/mixed envelope containing one HTML body and no
attachment parts. Its `cid:` image reference does not create an attachment.
An original-file regression runs when local `sample3.eml` is present; the
sanitized reconstruction always runs without requiring submitted recipient data.

Confirmed gaps: no sender lookalike detection; no email shortener rule; the
display-name list omitted PayPal; financial rules missed payment-dispute lures.
HTML-only MIME parsing, HTML href extraction, authentication parsing, score
normalization, rendering and escalation already worked. The email pipeline
does not call VirusTotal at all, so VirusTotal was not the gate preventing HIGH.

## Scoring rationale

Thresholds stay LOW 0–24, MEDIUM 25–49, HIGH 50–74, CRITICAL 75–100.
Weights express deterministic policy, not calibrated probabilities.

| Evidence family | Reconstruction contribution | Rationale |
| --- | ---: | --- |
| Claimed-brand sender lookalike | 25 | Strong identity concern; capped with other identity indicators |
| Reported authentication failure | 15 | One correlated signal across SPF, DKIM and DMARC, never verified authentication |
| Payment dispute instruction | 15 | Financial action pressure, not merely an amount or invoice subject |
| URL shortener | 8 | Obscured destination, not a malicious reputation verdict |
| Urgency | 4 | Weak corroboration |
| Total | 67 / HIGH | Several independent evidence families |

Brand claim and lookalike indicators are both visible but share the existing
25-point identity cap. Repeated indicators and authentication failures do not
multiply scores. Without authentication evidence the same remaining indicators
score 52 / HIGH. A brand mention, shortener, or isolated SPF failure does not
produce HIGH alone. Reported PASS and zero provider detections never subtract
positive evidence or establish safety.

Receipt-only email heuristics remain capped at 74. A separate, strictly typed
`evaluateRisk` argument, `confirmedContext.corporateCredentialsSubmittedToPhishingSite`,
raises the score to at least 75. This is for application-confirmed context,
never inferred from email text or accepted through analyzer HTTP/AI arguments.
There is currently no employee confirmation endpoint wired to this argument;
the new capability is tested at the deterministic risk boundary. Existing
assistance-only reported context continues to change guidance, not risk.

Risk version 1.1 is accepted alongside stored 1.0 snapshots. Existing records
are not silently rescored.

## Detection and privacy boundaries

The shared domain helper normalizes DNS case, IDNA and trailing dots. It uses
bounded whole-token confusable comparisons for common brand references, gated
by a corresponding brand claim. It is not exhaustive Unicode or typo detection.
Common-domain matches suppress this heuristic only; they are not trusted
senders and do not suppress authentication or other evidence.

Return-Path is parsed for display with the local part omitted and excluded
from persistence. Bounce-domain differences are not treated as phishing proof.
Missing authentication retains the existing `UNAVAILABLE` API state with an
empty claims array (unknown, never PASS/FAIL).

HTML is tokenized without execution. URLs are never opened or followed and
shorteners are never expanded. Only origins are returned. The existing URL
analyzer's SSRF controls remain intact. Attachments come from MIME parts, not
invoice wording; metadata remains NOT_SCANNED. Email link reputation remains
NOT_CHECKED and unavailable coverage is explicit.

## Regression coverage

The reconstruction, legitimate mail, isolated failure, alternative brands,
Unicode/case variants, HTML-only and multipart mail, actual attachment metadata,
absent authentication/reputation, confirmed submission, spoofed context,
privacy projection, frontend rendering and HTTP/database automatic escalation
have dedicated tests. Existing analyzer, risk, assistance, URL SSRF and incident
tests remain relevant.

## Validation performed

- Original-file follow-up: `node --test backend/tests/email-phishing-regression.test.js backend/tests/email-analyzer.test.js backend/tests/risk-engine.test.js`: **43 passed, zero skipped**, including the actual `sample3.eml`.
- `node --test --test-reporter=dot backend/tests/email-phishing-regression.test.js backend/tests/email-analyzer.test.js backend/tests/risk-engine.test.js backend/tests/incident-assistance.test.js backend/tests/url-analyzer.test.js`: 165 passed.
- `node --test --test-concurrency=1 frontend/tests/email.test.mjs frontend/tests/risk.test.mjs`: 27 passed.
- `node --test --test-concurrency=1 backend/tests/email-api.integration.test.js backend/tests/incident-engine.integration.test.js backend/tests/incident-detail.test.js backend/tests/notifications.integration.test.js backend/tests/tool-registry.test.js backend/tests/tool-responses.test.js`: 100 passed, including real local PostgreSQL, HTTP and authenticated Socket.IO.
- `npm.cmd run build`: passed; Vite warned about the existing large application bundle.
- Focused ESLint on all changed JavaScript/JSX files: passed.
- `git diff --check`: passed (Git emitted line-ending notices).
- `npm.cmd run lint`: failed on four errors in untouched
  `frontend/src/features/analytics/AnalysisOverview.jsx`,
  `frontend/src/features/audit/AuditLogsPage.jsx`, and
  `frontend/tests/audit-ui.test.mjs`. Those unrelated changes were preserved.

Frontend verification used actual analyzer results rendered through React/Vite
tests, not a manual browser session. No schema changes or migrations were needed.

## Changed files

- `backend/src/analyzers/domain-indicators.js`: shared normalized shortener and brand-confusable checks.
- `backend/src/analyzers/url/url-local.js`: reuse the existing shortener list through the shared helper.
- `backend/src/analyzers/email/email-analyzer.js`: new indicators, dispute-language detection and analyzer version.
- `backend/src/analyzers/email/email-evidence.js`: normalized domains, shorteners and Return-Path metadata.
- `backend/src/analyzers/email/email-privacy.js`: preserve analyzer version in minimized storage.
- `backend/src/risk/risk-policy.js`, `risk-engine.js`, `reason-codes.js`: deterministic weights, explanations, version and separate confirmed-interaction input.
- `backend/src/assistance/assistance-policy.js`, `backend/src/incidents/incident-detail.js`: preserve support for historical risk 1.0 and new 1.1 snapshots.
- `frontend/src/features/email/EmailResults.jsx`: Return-Path display.
- `backend/tests/fixtures/reported-paypal-phishing.eml`, `backend/tests/email-phishing-regression.test.js`: reconstruction and detection/scoring regressions.
- `backend/tests/email-api.integration.test.js`: upload, persistence, automatic incident creation and incident-detail regression.
- `backend/tests/risk-engine.test.js`, `frontend/tests/risk.test.mjs`: version-aware assertions.
- `frontend/tests/email.test.mjs`: real-result HIGH rendering and nonfabrication checks.
