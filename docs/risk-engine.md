# Risk engine and guidance

## In short

The **risk engine** is plain program code (no AI) that turns analyzer evidence
into:

- a **score** from 0 to 100,
- a **level**: LOW, MEDIUM, HIGH or CRITICAL,
- a **confidence** label,
- a list of **reasons**, and
- fixed **recommended actions**.

The same evidence always gives the same result. After the score, a second piece
of fixed code, **Incident Assistance**, produces the "What should I do now?"
advice the employee sees.

```text
Analyzer evidence → risk engine (score, level, reasons) → Incident Assistance (advice)
                                    ↓
                  saved with the analysis; HIGH/CRITICAL → incident
```

Current model version: **1.1** (saved with every result; older 1.0 results are
kept as they were and never rescored).

## Levels

| Score | Level |
| --- | --- |
| 0–24 | LOW |
| 25–49 | MEDIUM |
| 50–74 | HIGH |
| 75–100 | CRITICAL |

Scores are **policy points, not probabilities**. "LOW" never means "safe"; it
means the available checks found little evidence.

## How the score is built

1. **Convert** each analyzer indicator into a reason code with a weight.
2. **Count once**: repeated or closely related indicators share one reason; only the highest weight counts.
3. **Cap by category** so one kind of evidence cannot dominate (for example, identity tricks add at most 25 points).
4. **Bonus for combinations**: in email, a credential or MFA request plus another category adds 8 points.
5. **CRITICAL gate**: a score of 75+ is allowed only with strong, independent evidence (see below). Otherwise the score is capped at 74.
6. **Confidence and coverage**: which checks ran, which were missing and whether they disagree.

Analyzer labels like "Suspicious" never add points by themselves, and anything
the client sends (`score`, `riskLevel`, `confidence`) is rejected.

### The CRITICAL gate

CRITICAL needs either:

- **two strong sources** among ClamAV detection, a STRONG YARA match and fresh VirusTotal consensus, **or**
- **one strong source plus** at least two separate structural warning groups worth 25+ points,
- **or** an employee's confirmed report that they entered credentials (email and URL results only).

So weak hints on their own can never become CRITICAL.

## Weights (model 1.1)

### Email

| Evidence | Points | Category cap |
| --- | ---: | --- |
| MFA / code request | 30 | content 35 |
| Credential request | 25 | content 35 |
| Sender domain imitating the claimed brand | 25 | identity 25 |
| Reply-To domain differs / only mailbox differs | 18 / 10 | identity 25 |
| Display name shows a different address | 18 | identity 25 |
| Executable attachment / macro attachment | 25 / 18 | attachment 25 |
| Disguised attachment name (double extension, hidden direction characters) | 15 | attachment 25 |
| Link text shows a different destination | 20 | email links 25 |
| Unusual link scheme / credentials in a link | 12 | email links 25 |
| URL shortener | 8 | email links 25 |
| Reported SPF/DKIM/DMARC failure | 15 | authentication 15 |
| Payment pressure or gift cards | 15 | financial 20 |
| Process bypass | 15 | process 15 |
| Urgency, login or reset request, attachment invitation | 4 each | content 35 |

Examples: a credential request alone scores 25 (MEDIUM); credential request +
Reply-To domain mismatch scores 51 (HIGH).

### URL

Structural signals share a 40-point cap: IP-address host 10, international
name 10 (mixed alphabets 18), account/login path 15, brand-like domain 18,
shortener 8, plain HTTP 4, obscuring tricks up to 8. TLS problems (expired, not yet
valid, wrong host, untrusted) add at most 8. A valid certificate, HTTPS or
successful DNS **never subtract** points.

### File

| Evidence | Points |
| --- | ---: |
| ClamAV detection | 60 |
| STRONG YARA match / WARNING YARA match | 50 / 25 |
| DEMO YARA match | 0 (explained only) |
| Content does not match extension | 18 |
| Macro content | 18 |
| Double extension | 12 |
| Unsafe archive paths | 12 |
| Active content | 10 |

Local structure warnings share a 40-point cap. Several YARA rules matching do not
multiply the score.

### VirusTotal reputation (URL and file)

| Report | Points |
| --- | ---: |
| 5+ malicious **and** 10+ total **and** at least 10% malicious ("consensus") | 60 |
| 2+ malicious (below consensus) | 30 |
| 1 malicious | 12 |
| Only "suspicious" votes | 8 |
| No detections | 0 |

URL and domain reports are not added together (the larger one counts). Reports
older than 30 days still count but cannot be a "strong source" for CRITICAL.

## Confidence

Confidence says how much evidence was available, **not** how certain it is that
something is safe.

| Confidence | When |
| --- | --- |
| HIGH_CONFIDENCE | No missing checks, fresh reputation and three available sources (for files: ClamAV, YARA and VirusTotal) |
| MODERATE_CONFIDENCE | At least one completed scanner or usable reputation source. Email can reach only this level because headers cannot be verified. |
| LIMITED_CONFIDENCE | Important checks missing, or evidence conflicts |

When sources disagree (for example ClamAV clean but VirusTotal malicious), the
result gets `CONFLICTING_SECURITY_EVIDENCE` and confidence drops one step. The
detection still keeps its points.

## Recommended actions (by level)

- **LOW**: normal caution and independent verification.
- **MEDIUM**: avoid interacting until verified.
- **HIGH**: do not click, open or reply; do not enter credentials; contact IT/security.
- **CRITICAL**: stop immediately and contact IT/security urgently.

## Incident Assistance ("What should I do now?")

A second fixed program (`backend/src/assistance/`) turns the final risk into
employee guidance. It never changes the score and never repeats detection.

| Final level | Urgency | Escalation advice |
| --- | --- | --- |
| LOW | Routine | None (contact IT if new concerns arise) |
| MEDIUM | Caution | Optional (if verification fails) |
| HIGH | Urgent | Recommended |
| CRITICAL | Immediate | Urgent |

The guidance contains: a headline and summary, immediate actions, things to
avoid, follow-up actions, escalation advice, and when relevant:

- **Credential / MFA guidance**: what to do *if* you entered a password, shared a code or approved an unexpected prompt.
- **Device guidance**: only for HIGH/CRITICAL files with a ClamAV, YARA or malicious-hash reason. A detection does not prove the file ran; disconnect from the network only if compromise is suspected and company procedure allows. Do not power off or try to clean the device yourself.
- **Evidence preservation**: keep the original email, note the URL as text, keep the file isolated; do not forward widely or delete.

All wording is fixed, reviewed text. Nothing from the submitted email, URL or
file is copied into the guidance. Policy version 1.0 of the assistance supports
risk models 1.0 and 1.1.

## Where results are stored

The score, level and model version are saved in the analysis row, in the same
insert as the evidence. Confidence and reasons are saved in the evidence JSON.
Guidance can be rebuilt exactly from the saved risk, so it is not stored twice
(except inside new incident snapshots, see [incidents](incidents.md)).

The employee result page shows the level, score out of 100, confidence, up to four
main reasons, coverage warnings and actions. Internal weights and caps are not
shown. An old result without a risk shows "unavailable", never LOW.

## Changing the policy

Change only `backend/src/risk/risk-policy.js` (and `reason-codes.js` for wording),
increase the model version, explain why, and update the boundary tests. Do not
claim accuracy without testing on a labeled set of real examples.

## Code and tests

- `backend/src/risk/` (engine, policy, reason codes, evidence adapters)
- `backend/src/assistance/` (guidance)
- `frontend/src/components/` (shared `RiskResult` and `RiskBadge`)
- Tests: `npm run test:risk`, `npm run test:assistance`
- Optional live smoke test with the app running: `node backend/scripts/validate-risk-runtime.js`

## Limitations

This is an explainable prototype rubric, not a calibrated malware probability.
It cannot detect what the analyzers did not collect, forged email headers remain
unverifiable, and false positives and negatives are possible.
