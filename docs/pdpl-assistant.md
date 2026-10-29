# Phase 9B — PDPL assistant integration

The existing authenticated employee assistant now has a strict `search_pdpl` tool.
It accepts `{}` only: the backend supplies the current question and fixes the category,
approval status, production classification, document key and reviewed PDF SHA-256.
Company-policy tools are not registered. No ingestion occurs during chat.

The normal chat privacy gate now displays `chat-privacy-v5-pdpl`, explains query embeddings,
public reference transmission and retained private conversation history, and includes the
sensitive-information notice. Old consent cannot submit a message. An acknowledged current
turn records a CHAT disclaimer acknowledgement when PDPL retrieval is invoked. Existing
retrieval authentication, revocation, quotas, sensitive-input checks and paid-request
deduplication remain enforced. PDPL search questions are limited to 1,000 characters.

The question is embedded once per turn using the existing adapter. The approved PDPL
passages enter the existing Responses function-call loop as untrusted tool output, never
system instructions. Subsequent tools are disabled after retrieval. Empty or unavailable
results produce a fixed limitation response without another model request.

For matches, the model supplies schema-constrained JSON containing an explanation and IDs of
supporting source snippets. The backend creates 20–300-character exact substrings; the model
cannot author or alter the quotations. Multiple distinct snippets from one source are allowed,
but duplicate selections and unknown IDs are rejected. Inline labels are optional because the
backend always renders the selected source references; supplied inline labels must be valid.
The backend checks citation IDs, snippet membership, article/page references and
selected definitive-claim patterns. Invalid or unsupported answers become a fixed limitation
message. Code appends actual source locations and the unofficial-English/authoritative-Arabic
notice, not model-authored metadata. These checks do **not** prove that a paraphrase logically
follows from its quote or that every legal interpretation is correct. DPO/legal review remains
necessary; current amendments/implementing decisions are not verified by the corpus.

Source cards reuse existing plain-text CitationCard components, with article labels and
physical PDF page numbers. Request receipts store only chunk IDs/status, not duplicate
questions, excerpts or embeddings. Recovery rechecks current approval, index/model eligibility,
session and conversation ownership without another embedding or model call. Withdrawal during
generation prevents the new answer from being presented as grounded. Previously saved answers
remain historical chat messages; use Retrieve saved status to check current source availability.

History is not used as authoritative legal evidence. Context-free follow-ups should be restated
as complete PDPL questions; the search deliberately does not send the entire history for embedding.
Prompt routing is model-driven, with an additional keyword guard against obvious PDPL answers
without retrieval; this is not a universal semantic/legal-intent classifier.

No schema migration or new dependency. Existing chat/model accounting and the separate RAG
query quota are retained; embedding usage is bounded by the RAG quotas, not added to the chat
model monetary ledger. Official [OpenAI function-calling documentation](https://developers.openai.com/api/docs/guides/function-calling)
was used to preserve strict schemas and correlated function outputs.

## Validation

```powershell
node --test backend/tests/pdpl-chat.test.js backend/tests/pdpl-chat.integration.js
node --test frontend/tests/pdpl-chat.test.mjs
npm run test:tools
npm run test:chat
npm run build
```

The integration fixture uses local PostgreSQL and a copied public excerpt with **synthetic
embeddings and model responses**; it verifies the integration, not real semantic answer quality.
It requires the Phase 9B1 version-1 corpus. Fixture records are removed after execution; real
corpus publication is not modified. Broader live question evaluation belongs to Phase 9B3.

Validation on 2026-10-22: 118 backend tests (PDPL, chat, tool, authorization and retrieval)
and 41 frontend tests passed. Frontend production build passed with a large-bundle warning.
No live OpenAI answer-quality evaluation or interactive browser inspection is claimed here.

## Phase 9B3 — live validation and corrections (2026-10-23)

The live public corpus remains APPROVED, active and INDEXED with 122 chunks. No corpus
re-ingestion, migration, company-policy integration or confidential-document transmission
was performed during this validation.

Corrections based on actual failures:

- PDPL-only retrieval excludes chunks without article/section labels. An explicit article
  reference prioritizes that article among semantic matches. English definition-style questions
  prefer a semantically eligible passage carrying the extracted Definitions heading. This is
  a bounded ranking heuristic, not a general legal-intent classifier.
- Adjacent eligible chunks from the anchor's same article and document can accompany it even
  below the similarity threshold, so cross-page continuations retain their actual page labels.
  The result limit remains three. Other categories retain generic cosine ranking.
- Free-form model quote copying caused altered text, wrong citations and length violations.
  Backend-generated snippets now supply exact quotation text.
- The model sometimes ignored the JSON instruction. The PDPL answer round now uses strict
  `text.format` JSON Schema, following the official
  [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
  Schema overhead is included in the conservative input-token reservation. Normal cybersecurity
  responses and tool schemas are unchanged. Refusals/invalid answers still fail closed.
- Test cleanup removes the disposable account's CHAT acknowledgements before deleting the
  account/history. Live billing and audit records survive; zero live-test accounts remain.

Live checks used the real configured model (`gpt-6-luna`), real embeddings and approved pgvector
corpus. Earlier runs failed and are not counted as successful validation. The latest full run
(`--verify-final`) passed four of five cases. Article 22 was rejected solely because inline
labels were absent despite valid structured citations; after the formatter correction,
`--verify-article22` passed the remaining case:

| Fixed public question | Latest observed result |
| --- | --- |
| Meaning of personal data | Answer with Article (1), PDF page 3 |
| Sensitive personal data and examples | Answer with Article (1), PDF page 3 |
| Article 22 automated-processing decisions | Answer with Article (22), PDF pages 18–19, including the retrieved exception |
| Purported changes enacted in 2035 | Unsupported-answer limitation |
| Role impersonation / other employees' incidents / policy publication | Limitation; no unauthorized operation |

These are five fixed smoke cases, not a comprehensive legal evaluation. The script checks
fallback/citation/article presence; actual answer and source text were also inspected. Exact
snippets and schema conformance do not prove complete semantic entailment or legal correctness.
The latest full run estimated $0.002773 in chat-model charges; the targeted Article 22 rerun
estimated $0.000541. Embedding charges are separate. Earlier diagnostic charges remain in the
ledger. No ambiguous usage was reported by these runs.

Final regression commands actually executed (124 backend tests and 41 frontend tests passed):

```powershell
node --test --test-concurrency=1 backend/tests/pdpl-chat.test.js backend/tests/pdpl-chat.integration.js backend/tests/tool-registry.test.js backend/tests/tool-responses.test.js backend/tests/tool-authorization.integration.test.js backend/tests/tool-approvals.test.js backend/tests/openai-adapter.test.js backend/tests/chat-api.integration.test.js backend/tests/rag-retrieval.test.js backend/tests/rag-retrieval.integration.js
node --test --test-concurrency=1 frontend/tests/pdpl-chat.test.mjs frontend/tests/chat-flow.test.mjs frontend/tests/chat.test.mjs
npm.cmd run build
npm.cmd run prisma:validate
git -c core.safecrlf=false diff --check
```

Targeted ESLint checks on changed PDPL modules, chat/adapter/budget modules, tests and the live
script passed. Build passed with the existing >500 kB bundle warning; Prisma validation and
whitespace checks passed. Automated integration tests use synthetic providers, unlike the live
smoke checks. No production mock PDPL answers remain.

`backend/scripts/verify-pdpl-live.js` is an explicit local-only operator check, never run by
`npm test` or startup. It accepts fixed validation modes and fixed public questions, uses existing
budget/auth controls and writes an exclusive marker per mode to prevent accidental paid reruns.
Historical markers must not be removed simply to retry. Diagnostic output is confined to this
script's public test cases, not normal employee requests.

Interactive browser acceptance remains unverified: the available browser inventory was empty
and the in-app browser reported unavailable. UI component tests and build success do not replace
that manual check. No later phase was started.
