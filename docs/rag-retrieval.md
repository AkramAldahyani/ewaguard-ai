# Phase 9A3 — Secure retrieval

Adds reusable semantic search and a bounded employee REST endpoint to the existing
[ingestion](rag-ingestion.md) and [indexing](rag-indexing.md) foundation. It returns
source excerpts only. It does not generate an answer, connect retrieval to chat tools,
publish documents, or add a PDPL assistant, company-policy chatbot or administration UI.

## API contract

Authenticated employee sessions use the existing cookie, revocation, account status,
session-version, role and trusted-origin controls. Administrators do not gain a draft
preview through this endpoint; a separate reviewed admin workflow remains future work.

1. GET `/api/knowledge/privacy` supplies the versioned retrieval privacy notice,
   sensitive-information disclaimer and limits.
2. After active user acknowledgement, use the existing POST `/api/disclaimers/acknowledge`
   with `{ "context": "CHAT" }`. Its record must belong to the current employee, have
   the current disclaimer version, and be no older than 15 minutes.
3. POST `/api/knowledge/search` with JSON:

```json
{
  "question": "What should employees do with a suspicious email?",
  "category": "COMPANY_POLICY",
  "classification": "DEMONSTRATION",
  "approvalStatus": "NOT_OFFICIALLY_APPROVED",
  "privacyNoticeVersion": "rag-query-v1",
  "acknowledgementId": "<owned-acknowledgement-uuid>",
  "requestId": "<new-request-uuid>",
  "limit": 3
}
```

For legislation use category PDPL with classification PRODUCTION and approval status
APPROVED. Those documents must be approved and active. Since Phase 9C1, company samples
require classification DEMONSTRATION, approval status NOT_OFFICIALLY_APPROVED and the
server's development/test-only RAG_DEMONSTRATION_ENABLED flag. They remain DRAFT and
production-inactive; a separate hash-bound administrator review makes them demo-eligible.
See [company corpus controls](company-policy-corpus.md). Production company-policy
retrieval requires a later access/privacy design. Pending, rejected, archived,
unreviewed, unindexed, failed, model-mismatched and unclassified documents cannot be
requested by manipulating the payload. Unknown fields, query-string
parameters, arbitrary document IDs, pagination and client-selected similarity thresholds
are rejected. No document-list, download or modification endpoint is added.

Results contain status MATCHES or NO_MATCHES, category, classification and up to five
matches (three by default). Each match contains the exact stored excerpt, cosine
similarity, chunk ID and an allow-listed source projection: document ID/key/title,
filename, category, version, approval status, classification, stored physical page,
stored section heading and chunk position. Missing page/section values remain null.
Source filenames are labels, not download URLs. Raw vectors, storage paths, uploader
identities, approval identities and internal ingestion metadata are excluded.

NO_MATCHES means no eligible evidence met the search criteria; it is not a substantive
legal/policy answer. Similarity is a ranking measure, not probability or correctness.
The initial server threshold is 0.25 and needs corpus-specific quality evaluation.

## Retrieval and trust boundaries

`createRetrievalService` handles identity/acknowledgement, workload reservations and
query embedding. It reuses the 9A2 OpenAI adapter and OPENAI_EMBEDDING_MODEL. There is
no new API integration or provider fallback. Only the question is sent to OpenAI;
retrieved document text stays local in this phase. Question length is capped at 1,000
characters / 4,000 UTF-8 bytes. Existing secret/raw-analysis detectors reject common
credential and email/URL payloads. Detection is not a guarantee that arbitrary text
is non-confidential; the acknowledgement and appropriate reporting channel still matter.

The internal `hasRetrievableChunks` and `searchChunks` store functions are not public
authorization entry points. Call the service with trusted server session context,
never a client-supplied auth object. Search SQL is parameterized and filters category,
classification, explicit approval, activity, indexing status, model, dimension and
untrusted-reference provenance. Model/dimension metadata must match both the completed
document index and chunk vector. An eligible chunk is at most 1,600 characters.

For the small corpus, an exact cosine search materializes the eligible set before
ranking. This avoids approximate-index filtering recall gaps documented by
[pgvector](https://github.com/pgvector/pgvector#filtering). The existing HNSW index is
preserved. The search has a five-second SQL timeout; larger corpora require measured
query-plan/ANN tuning. This implementation is not a retrieval quality benchmark.

The session is checked before work and again after embedding and search. Source
publication filters are applied at search time, so a document withdrawn during the
network request is not returned. As with any response, a later revocation cannot
recall bytes already delivered; authorization is not a persistent entitlement.

`referenceContext` builds a structured `untrusted_reference_data` object containing
only result citations, excerpts and source projections. `REFERENCE_INSTRUCTIONS` is
separate static guidance for later answer generation. Source content is never assigned
a system/developer role, executed, or used to choose tools or alter authorization.
Prompt-like text remains inert data. This does not claim to eliminate prompt injection
in a future LLM integration: subsequent phases must keep the message trust boundary,
enforce tools independently, validate citations and render text without unsafe HTML.

## Privacy, quotas and failures

Questions and query vectors are not persisted, hashed into logs, or exposed in audit
records. Responses are private/no-store. Minimal audit reservations contain actor,
request ID, category/classification, model, privacy version and acknowledgement ID;
they have 90-day retention metadata. The existing retention process handles expiry.
The audit action KNOWLEDGE_RETRIEVAL_REQUESTED means a request was reserved, not that
retrieval succeeded. Raw provider errors and payloads are never returned.

Limits: 10 search attempts per minute per employee; one in-flight request per employee
and four overall per service process; 30 embedding reservations per employee per UTC
day and 1,000 globally per UTC day. Daily quotas are serialized in PostgreSQL across
processes. Per-minute/concurrency limits are process-local and require shared admission
controls for horizontal scaling. These are workload ceilings, not monetary quotas;
embedding costs are separate from the chat ledger.

An empty eligible corpus returns NO_MATCHES before any provider call/reservation.
Otherwise a user/request-ID pair is reserved before the call, including failed or
cancelled calls. Duplicate IDs return 409 and cannot trigger another provider call.
Results are not cached for replay; clients must not silently mint new request IDs to
retry. Provider failures produce a sanitized 503. SDK retries remain disabled, timeout
and client-disconnect signals are propagated, and failed calls may still be billed.

## Validation and corpus state

```powershell
npm.cmd run test:rag:retrieval
npm.cmd run test:rag:indexing
npm.cmd run test:rag:embeddings
npm.cmd run test:rag:ingestion
npm.cmd run test:rag:database
npm.cmd run test:vector
```

The retrieval suite uses a real local PostgreSQL/pgvector database and explicitly
injected synthetic embeddings. It verifies deterministic ranking and filtering,
source projections, untrusted content, authentication/acknowledgement, quota/replay,
concurrency, revocation and provider failures. It deletes only its synthetic fixtures.
These tests do not measure semantic relevance against the actual PDPL/demo corpus.

Historical 9A3 state: the local source documents were previewed but had not been imported,
indexed, approved or activated as part of 9A3. Therefore the real employee endpoint
returns no matches until an authorized operator completes ingestion/indexing and a
reviewed approval/publication workflow makes documents eligible. This phase does not
silently mark demonstration documents or legislation approved.
