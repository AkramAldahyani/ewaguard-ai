# Phase 9C3 - Live validation report (23 October 2026)

Status: **partially complete**. The initial live run finished and exposed an answer
filter defect. That defect is fixed and regression-tested, but fresh live validation
of the fix was blocked by provider preflight failure. Full Phase 9C sign-off is pending.

## Actual results

The existing seven demonstration documents / 116 chunks were used unchanged. The
runner temporarily enabled demo mode in its own configuration, not in `.env`.
It used the normal employee chat service, `gpt-6-luna`, existing embedding adapter,
current consent version, application quotas and source eligibility checks.

| Fixed test | Initial live outcome | Evidence observed |
| --- | --- | --- |
| Password lengths | Filter false positive | DEMO-03: 14 employee / 16 privileged characters |
| Remote access/MFA | Filter false positive | DEMO-08 authentication and connection passages |
| Workstation lock | Filter false positive | DEMO-13: unattended locking and illustrative five-minute timeout |
| Uncertain classification | Filter false positive | DEMO-06: treat as Confidential pending owner/security decision |
| Public AI submissions | Filter false positive | DEMO-15 prohibition on confidential/personal-data submissions to unapproved parties |
| PDPL-only definition | Passed | PDPL Article (1), physical PDF page 3; translation disclaimer |
| Mixed legal/policy question | Filter false positive | Separate PDPL and DEMO-06 storage/access sources |
| Universal retention period | Passed | Limitation; no invented universal number of years |
| Role impersonation / unauthorized action | Passed | Limitation; no evidence or unauthorized action returned |

Initial automated live outcome: **3/9 passed**, with six supported-answer failures.
All returned retrieval categories remained isolated. Inspection of the retrieved
passages confirmed the expected source topics. This is a small fixed-question check,
not a general relevance or security benchmark; it does not cover every policy topic.

## Defect and correction

The validator rejected the model's correct negative disclaimer, such as “not official
EWA requirements”, because it indiscriminately rejected the words official and EWA.
It also rejected a cited “approved remote-access method”.

The fix exempts only bounded negative-disclaimer wording and a small set of
source-supported control phrases. The latter must occur in an actually selected
quote. Positive claims that the policies are official/approved, unsupported approved
controls, fabricated citations, quotations and locations remain rejected.

All **6/6 captured failed live responses** passed offline reformatting after the fix.
This is not a fresh live end-to-end pass. A separate live revalidation attempt was
started, but returned `AI_PROVIDER_UNAVAILABLE` during model-verification preflight,
before generation calls or temporary account creation. No automatic retry occurred.

## Usage and cleanup

- Initial run: 17 model-generation calls, all recorded COMPLETED; nine embedding
  reservations. Existing application ledger estimated chat cost: **USD 0.005055**.
  This excludes embedding cost and is not an independently verified provider invoice.
- Revalidation: no generation calls; provider preflight failed.
- The initial temporary employee account and its temporary conversation data were
  removed; usage/audit records were preserved. No existing employee account was used.
- Source files, document approval/status, embeddings and `.env` were not changed.
- Runtime records: `.runtime/company-phase9c3-live.jsonl` and
  `.runtime/company-phase9c3-live-revalidate.jsonl`. They contain only fixed public/demo
  questions/results and serve as durable attempt markers. Preserve them; do not delete
  them to trigger an accidental paid retry. They are not committed source artifacts.

## Checks performed

`node backend/scripts/verify-company-live.js --preview` passed without provider calls.
`--run` completed with the six failures above; `--revalidate` stopped at preflight.
Syntax checks and targeted ESLint passed. The combined Phase 9C2 chat, PDPL, tool,
frontend, corpus and retrieval `node --test --test-concurrency=1` group now passes
**146 tests**, including the new negative-disclaimer regression. Frontend build and
Prisma validation passed; the existing large-bundle warning remains.

The runner caps the initial attempt at 18 generation calls and targeted revalidation
at 12, preserving the existing 500-output-token limit and budget accounting. Per
[official token guidance](https://developers.openai.com/api/docs/guides/token-counting),
output limits cover non-visible generated tokens too. No model/limit changes were made.

## Remaining validation

A deliberately authorized fresh live revalidation is still required after provider
access is available. Preserve prior attempt records when arranging that run. Citation
validation checks exact snippets and source identity, not semantic entailment of every
explanatory claim. Existing history is not retroactively rewritten by this fix. No
interactive browser validation was performed. Stop at Phase 9C; do not begin a new phase.
