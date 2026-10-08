# Phase 7B — Incident Assistance

Security tools detect. The risk engine evaluates. Incident assistance guides.
AI explains and coordinates. Phase 7B contains no AI integration.

## Architecture

`backend/src/assistance/incident-assistance.js` exports a pure, deterministic
`buildIncidentAssistance({ analyzerType, riskResult, evidenceContext, version })`.
It consumes a completed Phase 7A risk result and never repeats detection,
recalculates risk, changes the score/classification, or reads raw analyzer input.

The only dependencies are the central assistance policy and the risk reason-code
dictionary. There are no Express, Prisma, filesystem, scanner, provider, OpenAI,
environment-variable, network, clock, incident, notification or remediation APIs
in this service.

All three existing submission services now compute:

```text
Analyzer evidence → final risk → deterministic assistance → API result
                         ↓
                existing analysis persistence
```

The API envelope stays `{ analysisId, createdAt, result }`. The additive
`result.assistance` includes:

- `version`, `riskVersion`, `analyzerType`, and unchanged `riskLevel`;
- `urgency`, `headline`, `summary`, and `confidenceNotes`;
- `immediateActions`, `avoidActions`, and `followUpActions`;
- `escalationRecommendation: { level, description }`;
- nullable `credentialGuidance` and `deviceContainmentGuidance`, each with an
  applicability state, summary and actions;
- `evidencePreservationGuidance`, known risk `reasons`, and a fixed `disclaimer`.

All employee wording comes from reviewed fixed strings. Submitted reason
descriptions, provider payloads, URLs, filenames and other free text are not
copied into assistance. Known reason codes are sorted and deduplicated; actions
are deduplicated within each section. Unknown reason codes produce a fixed policy
coverage warning and independent-verification advice, never reflected raw text.
Cross-analyzer reason codes, malformed input and unsupported versions are rejected
with a generic error. Existing route validation rejects client assistance, final
risk and exposure fields. There is no new route or endpoint.

## Policy version and urgency

Assistance policy **1.0** supports risk model **1.0**. All mappings, action text,
confidence wording, preservation guidance and safety disclaimers reside in
`assistance-policy.js`. Version changes must accompany behavioral policy changes.

| Final risk | Assistance urgency | Escalation |
| --- | --- | --- |
| LOW | ROUTINE | NONE |
| MEDIUM | CAUTION | OPTIONAL |
| HIGH | URGENT | RECOMMENDED |
| CRITICAL | IMMEDIATE | URGENT |

NONE still allows contacting IT/security when new concerns arise. OPTIONAL means
contacting them if independent verification fails or uncertainty remains.
RECOMMENDED and URGENT explicitly direct employees to the approved reporting
channel. These are recommendations only: no report is submitted and no
administrator is contacted.

LOW uses qualified no-strong-evidence language and ordinary caution; it never
declares an item safe. MEDIUM pauses interaction pending verification. HIGH stops
interaction, prohibits sensitive replies, recommends contact and preserves
evidence. CRITICAL stops interaction immediately and calls for urgent contact.

## Analyzer- and reason-aware actions

**Email:** verify through a known phone number or separate trusted channel rather
than the supplied Reply-To. EMAIL_CREDENTIAL_REQUEST and EMAIL_MFA_REQUEST add
password/OTP and unexpected-approval warnings. EMAIL_REPLY_TO_MISMATCH reinforces
independent verification. Suspicious attachment/disguised-name reasons prohibit
opening or enabling active content and recommend keeping the original message.

**URL:** use an official bookmark or manually type the known domain. Suspicious
final levels and malicious/suspicious reputation reasons say not to revisit the
URL. Account-path/hostname reasons add no-credential-entry guidance. An account
path alone does not establish that credentials were submitted.

**File:** verify the source; for suspicious results, do not open, execute, or
forward the file to colleagues. ClamAV/YARA/hash reputation reasons add specific
precautions and security-contact advice. YARA rule names, severity weights and
provider vote counts are not reinterpreted here; final risk and reason codes
already express the security assessment.

## Confidence-aware language

HIGH_CONFIDENCE describes strong support for the evaluation; it is not a promise
of safety or certainty of compromise. MODERATE_CONFIDENCE describes partial
support and encourages reviewing limitations. LIMITED_CONFIDENCE states that
evidence is incomplete and never downgrades high-risk precautions.

PROVIDER_UNAVAILABLE, INSUFFICIENT_EVIDENCE, COVERAGE_LIMITED, stale/unknown report
freshness and CONFLICTING_SECURITY_EVIDENCE add fixed explanations and independent
verification advice. Missing provider results do not become reassuring guidance.

## Credential and MFA exposure

Credential-related reasons show **CONDITIONAL** guidance: if credentials were
entered, an OTP was shared or an unexpected prompt approved, contact IT/security
immediately. Where an account password may be exposed, use the official service
on a trusted device to change it and do not reuse the old password. Verify MFA,
review account activity where organizational procedures permit, report
unauthorized prompts/approvals, and reject unexpected requests.

The service optionally accepts only these boolean `evidenceContext` keys:
`credentialsExposed`, `mfaCodeShared`, `unexpectedMfaApproved`, `suspectedExecution`.
An omitted or false flag is not a reported event. True exposure flags produce
**REPORTED_CONTEXT** guidance and at least URGENT assistance/URGENT escalation.
True suspectedExecution produces IMMEDIATE assistance/URGENT escalation. Guidance
actions upgrade accordingly, without modifying the original risk result.

These context states are reusable service behavior only. **Current analyzer
endpoints do not accept these fields**, have no exposure questionnaire, and pass
no user-event context. A later authorized integration must validate context and
retain its non-secret boolean provenance if replay is needed. No actual password,
OTP or credential value is accepted, requested, stored or logged.

## Device containment and evidence preservation

For current analyzer-only flows, containment guidance appears only for FILE with
HIGH/CRITICAL risk and a ClamAV, YARA or malicious-hash reason. It is explicitly
**CONDITIONAL**: detection does not establish that the file ran or the device was
compromised. Weak/low-level file heuristics produce no device advice.

Only if malicious execution or compromise is suspected does the guidance advise
network disconnection where company procedure permits, immediate security contact,
and preservation of what happened/when. It advises against powering off, cleanup
attempts and alteration of system files. There are no commands or automated actions.

HIGH/CRITICAL results (and reported exposure/execution contexts) preserve evidence:

- EMAIL: keep the original message and available headers; do not broadly forward
  or delete material the security team may need.
- URL: preserve the URL as text and note when/how it arrived using the approved
  internal process; do not revisit it or post token-bearing URLs publicly.
- FILE: do not execute it; keep it isolated for authorized handling if company
  procedure permits; preserve source/time without forwarding or public uploads.

## Employee UI

`IncidentAssistance.jsx` is shared by Email, URL and File results. The
“What should I do now?” section shows urgency text, the next step, confidence
qualifiers, immediate/avoid/follow-up actions, escalation, conditional recovery
sections, preservation guidance and the policy version. HIGH/CRITICAL use a clear
left border and textual urgency, with restrained existing design-system colors.
There are no submission controls or incident-creation buttons. Text is rendered
through React escaping. Original risk results and provisional findings remain
visible. An old result with no assistance does not invent guidance.

## Persistence and reproducibility

No schema, migration, retention or pgvector/HNSW changes. No assistance object is
stored: services generate it separately, persist the existing analyzer/risk
projection, then attach assistance only to the API response.

Guidance is reproducible from persisted `evidence.risk` plus assistance policy
version 1.0. The builder supports both the complete risk object and the minimized
email `reasonCodes` snapshot. No rescanning or risk recalculation is required.
There is no clock dependence. Future policy revisions must retain old policy
implementations when exact historical reproduction is required; do not silently
claim the current policy reproduces an older version. The current response
includes the policy version, but this phase does not archive guidance delivery.

## Safety boundaries and Phase 10 relationship

Phase 7B only guides employees. It never creates incidents, sends alerts, contacts
administrators, changes passwords, isolates devices, deletes files, disables
controls, or performs malware removal. Existing authorization, acknowledgements,
SSRF defenses and secure upload controls are unchanged. `/incidents` remains the
existing preview. Phase 10 will provide actual incident handling; a recommendation
here is not an incident record or proof of reporting. Phase 8 and later work are
outside this change.

## Validation

`npm run test:assistance` exercises deterministic output, versioning, all urgency
and escalation levels, analyzer/reason-specific actions, conditional versus
reported exposure, confidence language, malformed input, secret-text suppression,
dependency boundaries and accessible UI rendering. Existing analyzer UI tests
check assistance integration. API/database tests verify reproduction from stored
risk, no stored duplicate guidance, rejected client context, and zero incidents
for the test employee.

`node backend/scripts/validate-risk-runtime.js` remains an opt-in live smoke for
the running development app. It verifies LOW and HIGH email assistance, URL/file
assistance, persisted-risk reproduction, unchanged incident counts and logout.
It creates and removes only its temporary synthetic employee/analysis records.
The existing analyzers may use configured scanners and approved reputation
providers; the assistance service does not. Inputs are harmless synthetic content
and example.com. No malware is executed and no credentials are printed.

Guidance remains generic company-procedure-aware advice. No organization-specific
reporting destination or approved response playbook has been supplied. Scanner
limitations, false positives and incomplete evidence remain visible in final risk
and confidence. This phase does not establish whether execution/exposure occurred.
