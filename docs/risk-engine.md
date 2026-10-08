# Phase 7A — Central Risk Engine

Security tools detect. The risk engine evaluates. AI explains and coordinates.
This phase implements deterministic evaluation only. It creates no incidents and
adds no OpenAI, RAG, Socket.IO, or audit subsystem.

## Architecture and contract

`backend/src/risk/risk-engine.js` exports the pure function:

```js
evaluateRisk({ analyzerType: 'EMAIL' | 'URL' | 'FILE', evidence, evaluatedAt })
```

`evidence` is the existing server analyzer result. `evaluatedAt` is an optional ISO
timestamp supplied by the submission service, not the client. Production callers
always supply it. Omitting it leaves report freshness unknown and omits the output
timestamp, preserving deterministic evaluation even without a clock.

Pipeline: analyzer result → type-specific adapter → deduplicated weighted signals
→ category caps and corroboration → score and critical gate → confidence/coverage
→ stable reason codes and fixed recommendations. Adapters consume indicator IDs
and normalized scanner/provider evidence. They do not parse message text, inspect
bytes, resolve hosts, execute detection rules, or call providers.

Core modules import only other risk modules. They do not depend on Express,
Prisma, React, process environment, filesystem, credentials, or AI. Request
validators continue to reject extra JSON/multipart fields, including `score`,
`riskLevel`, and `confidence`. The server computes `result.risk` after successful
analyzer completion and before the existing atomic database insert.

The output includes `analyzerType`, `score`, `riskLevel`, `confidence`, `version`,
`reasons`, `evidenceCoverage`, `scoring`, `recommendedActions`, and (when supplied)
`evaluatedAt`. Coverage exposes fixed available/unavailable source names and a
conflict flag. Reasons contain a stable code, category, contribution and fixed
description; raw rule names, provider text, submitted content and secrets never
enter risk explanations. Consumed fields have bounded arrays, enums, finite
integer counts and type checks. Malformed consumed evidence throws a generic
TypeError, sanitized by the existing HTTP error handler. Missing evidence yields
explicit coverage gaps. Unknown indicator IDs cause a coverage limitation.

## Version, score and thresholds

Model version: **1.0**, included in every result. Policy lives in
`risk-policy.js`; description definitions live in `reason-codes.js`.

| Score | Final level |
| --- | --- |
| 0–24 | LOW |
| 25–49 | MEDIUM |
| 50–74 | HIGH |
| 75–100 | CRITICAL |

Scores are integers, bounded to 0–100. They are policy scores, **not calibrated
probabilities**. Repeated indicators count once. Correlated IDs share reason
codes, with only their highest weight retained. Positive contributions are
allocated by descending weight and stable code order, subject to category caps.
Ordering of analyzer indicators does not change a result. Analyzer-provided
weights, titles, and provisional classification never add points: the underlying
evidence is already counted. Original provisional labels remain unchanged.

CRITICAL additionally requires either two independent strong sources (ClamAV,
strong YARA, fresh VT consensus), or one such source plus at least two distinct
structural reason groups contributing at least 25 points. Without this gate the
score is capped at 74. Weak heuristics alone therefore cannot become CRITICAL.
Scores still need to reach 75 after the gate is met. `scoring.uncappedScore`,
`scoring.capped` and `scoring.criticalEligible` make capping explainable. Reason
contributions sum to the uncapped score, not necessarily the final bounded score.

## Email weighting

| Evidence | Points |
| --- | --- |
| Credential request | 25 |
| MFA/code request | 30 |
| Reply-To domain mismatch / address-only mismatch | 18 / 10 |
| Displayed address mismatch | 18 |
| Authentication failure/error claim | 15 |
| Executable attachment / macro-capable attachment | 25 / 18 |
| Displayed URL destination mismatch | 20 |
| Payment pressure / process bypass | 15 each |
| Urgency / login or reset request | 4 each |

Caps: content 35, identity 25, authentication 15, attachments 25, email URLs 25,
financial 20 and process bypass 15. A credential/MFA request plus another signal
category adds 8 corroboration points. Credential request alone scores 25 (MEDIUM);
credential + Reply-To domain mismatch scores 51 (HIGH); credential + failed auth
claim + executable attachment scores 73 (HIGH). All email evidence currently
comes from unverified content/metadata, so email alone cannot meet the CRITICAL
strong-source gate. Supplied authentication passes never reduce risk.

## URL weighting

Structural signals share a 40-point cap. IDN is 10; mixed-script evidence replaces
that correlated reason at 18; account path is 15; brand-domain pattern is 18;
IP host is 10; shortener is 8; HTTP is 4. Obscuring syntax indicators share one
reason with a maximum weight of 8. TLS expiry, not-yet-valid, hostname mismatch or
untrusted chain collectively add at most 8. Valid TLS, resolved DNS and HTTPS do
not subtract risk. Sensitive query parameter names add no threat points.

Private/blocked URLs remain rejected by the analyzer's existing SSRF controls
before risk calculation. They are not completed analyses and do not get an
invented `URL_PRIVATE_TARGET_BLOCKED` risk result.

## File weighting

ClamAV DETECTED contributes 60; strongest YARA match contributes 50 for STRONG or
25 for WARNING. DEMO-only matches contribute zero with an explanatory reason.
Multiple YARA rules do not multiply votes. Duplicate local AV/YARA/reputation
indicator IDs are ignored because normalized scanner reports already count them.

Local structure shares a 40-point cap: extension/content mismatch 18, active
content 10, double extension 12, unsafe archive paths 12, macro content 18,
MIME-only mismatch 4, unusual filename 4. Encrypted, nested or incomplete archive
checks affect coverage. File-type heuristics cannot alone become CRITICAL.
ClamAV + strong YARA + VT consensus usually reaches CRITICAL (bounded to 100).

## VirusTotal normalization and reliability

Only existing normalized reports are consumed. Total usable analyses equal
malicious + suspicious + harmless + undetected counts. Each count must be a
nonnegative integer no greater than 10,000; zero-total reports are unavailable
evidence. Timeout/failure counts are not usable votes and are not included.

| Provider evidence | Points |
| --- | --- |
| At least 5 malicious, at least 10 total, malicious ratio at least 10% | 60 |
| At least 2 malicious below consensus threshold | 30 |
| One malicious | 12 |
| Suspicious votes only | 8 |
| No detections | 0 |

URL and domain reports are correlated: retain the largest contribution, never
sum votes across them, and count VirusTotal once for source independence. Harmless
votes establish a denominator; they do not cancel malicious votes. Reputation
scores reported by the provider are not extra votes.

The freshness window is 30 days, inclusive. Stale, missing-date or future-dated
reports retain their risk contribution but cannot supply a strong source for the
CRITICAL gate and prevent HIGH_CONFIDENCE. Freshness uses the supplied evaluation
timestamp, so archived results can be replayed exactly. The strongest report wins
ties in favor of fresh consensus; gaps in any report remain visible.

## Confidence, coverage and contradictory evidence

Confidence describes the support and coverage of this evaluation, not certainty
that an item is safe or that a detection is infallible.

- **LIMITED_CONFIDENCE:** email lacks authentication/header or content coverage;
  URL/file has no completed detection source; or conflict downgrades moderate
  confidence. Missing all scanners and VT NO_REPORT falls here even at score 0.
- **MODERATE_CONFIDENCE:** email has local and complete supplied auth claims with
  no relevant coverage gaps; or URL/file has at least one completed scanner or
  usable reputation source. Email never reaches HIGH_CONFIDENCE because headers
  are unverified. One clean scanner with missing other checks remains moderate
  and carries INSUFFICIENT_EVIDENCE.
- **HIGH_CONFIDENCE:** no missing or limited sources, fresh reputation metadata,
  and three available sources: ClamAV/YARA/VT for files; for URLs a usable VT
  report plus enough completed local/DNS/TLS observations to reach three. URL
  structural and network observations are coverage, not independent malware votes.

Absent email attachment scanning/link reputation is surfaced when such content is
present. Missing DNS/TLS, scanner errors, provider NO_REPORT, privacy skips and
disabled providers remain visible. Gaps add no automatic malicious points.
`INSUFFICIENT_EVIDENCE` and `NO_KNOWN_INDICATORS` can coexist. Neither means safe.

ClamAV CLEAN versus a positive YARA/VT result, zero-detection VT versus another
positive scanner, disagreeing URL/domain reports, and conflicting email auth
claims produce `CONFLICTING_SECURITY_EVIDENCE`. Detections retain their score.
Confidence drops one tier. YARA NO_MATCH alone is not contradictory: it merely
means the small configured rule set did not match, not a clean malware verdict.

## Reason codes and recommendations

`reason-codes.js` is the authoritative exhaustive dictionary. Families include
EMAIL_CREDENTIAL_REQUEST, EMAIL_MFA_REQUEST, EMAIL_REPLY_TO_MISMATCH,
EMAIL_AUTH_FAILURE, EMAIL_SUSPICIOUS_ATTACHMENT, URL_REPUTATION_MALICIOUS,
URL_ACCOUNT_PATH, FILE_CLAMAV_DETECTION, FILE_YARA_MATCH, FILE_VT_MALICIOUS,
FILE_TYPE_MISMATCH, PROVIDER_UNAVAILABLE, INSUFFICIENT_EVIDENCE,
COVERAGE_LIMITED, REPUTATION_STALE, REPUTATION_FRESHNESS_UNKNOWN and
CONFLICTING_SECURITY_EVIDENCE. Descriptions are fixed safe text; zero-point
coverage reasons are separate from weighted threat reasons.

Recommendations are fixed by final level: LOW advises ordinary caution and
independent verification; MEDIUM advises avoiding interaction until verification;
HIGH advises no clicking/opening/responding, no credentials, and contacting
IT/security; CRITICAL advises stopping immediately and urgently contacting
IT/security. Disconnection advice is conditional on suspected malicious execution
and company procedure. No remediation or incident creation is performed.

## Persistence and employee UI

No schema or migration changes. Existing `riskScore`, `severity` and
`riskRuleVersion` are written in the same insert as analysis evidence. Confidence,
reason codes and evaluation timestamp reside in `evidence.risk`. Email stores only
the minimized risk snapshot, preserving its strict no-free-text persistence
boundary. URL/file store the complete safe risk object with existing minimized
analyzer evidence. Prior rows are not backfilled. Retention stays unchanged.
The shared `riskColumns` and `riskSnapshot` adapters support later audit use with
the analysis ID; this phase adds no audit subsystem. pgvector and HNSW are untouched.

All three result views use shared `RiskResult` and existing accessible `RiskBadge`.
They show final level, score /100, confidence, up to four major reasons, coverage
warnings and deterministic actions. Weights/caps stay out of the employee UI.
Analyzer Finding remains visible separately, with a brief distinction from final
risk. Missing risk on a historical result is displayed as unavailable, never LOW.

## Validation and tuning

`npm run test:risk` covers the analyzer matrix, exact threshold boundaries,
availability, source deduplication, contradictions, freshness, malformed inputs,
determinism, privacy, pure imports and shared UI. Existing analyzer API tests also
verify persisted final risk and rejection of client-supplied risk fields.
`node backend/scripts/validate-risk-runtime.js` runs an opt-in live smoke against
the development server using a temporary synthetic employee, two emails,
example.com and harmless text; it verifies storage and logout then removes only
its own test records. Analyzer calls may use configured providers during this smoke.

Tune only the central policy, update the model version, document the rationale,
and revise expected examples/boundary tests. Evaluate false positives/negatives on
an approved labeled corpus before claiming accuracy or production calibration.
This initial policy is an explainable prototype rubric, not empirically validated
malware probability. Analyzer coverage, rule quality, forged email headers,
provider errors, stale reports and false positives remain limitations. No model
can infer compromise or malicious execution from evidence these analyzers do not
collect. Incident decisions and AI explanations remain future phases.
