# Phase 9A2 — Embeddings and indexing

Adds OpenAI embedding generation and atomic pgvector replacement to the
[9A1 ingestion foundation](rag-ingestion.md). No search endpoint, chatbot integration,
document approval, publication, or administration UI is added.

## Configuration and commands

Uses the existing backend OPENAI_API_KEY and SDK, with the same fixed API origin,
disabled logging, sanitized provider errors and zero automatic retries as the chat
adapter. Embedding model/limits are separate from chat model pricing and usage.

```dotenv
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
RAG_EMBEDDING_MAX_DOCUMENT_BYTES=250000
```

Allowed models: text-embedding-3-small and text-embedding-3-large. Both are requested
with dimensions: 1536 and encoding_format: float to match the existing column and
cosine HNSW index. No schema migration or new dependency is needed. Request options
follow the [official OpenAI embeddings reference](https://developers.openai.com/api/reference/typescript/resources/embeddings/methods/create).

```powershell
# Read-only preview (default); no OpenAI calls.
npm.cmd run knowledge:index -- --preview

# First ingest documents if absent, using the existing 9A1 command.
npm.cmd run knowledge:ingest -- --apply --actor <active-admin-uuid>

# Paid embedding requests for eligible manifest documents needing indexing.
npm.cmd run knowledge:index -- --apply --actor <active-admin-uuid>

# Select one document and explicitly regenerate even an unchanged index.
npm.cmd run knowledge:index -- --apply --actor <active-admin-uuid> --document bahrain-pdpl --force

# One paid request with only a synthetic sentence; no corpus/database access.
npm.cmd run knowledge:verify:embeddings
```

The actor ID attributes a trusted local operator action; it is not authentication.
Protect filesystem/database access. No HTTP endpoint or AI tool invokes these commands.
Preview reports NOT_INGESTED for absent documents. It describes stored state and input
size, not whether the configured model matches an existing index; apply checks that.

## Privacy and limits

Only validated local manifest entries for public PDPL legislation or demonstration
company policies can be indexed. Each explicit operation re-extracts the source and
compares its hash, ingestion fingerprint, category, classification, source reference,
title and chunk text against the database before external transmission. Production or
confidential company policies are refused. Labels rely on trusted operator review;
they are not an automatic confidentiality detector. Rejected/archived documents are
ineligible. Approval/publication is independent of indexing public/demo material.

Only chunk text is sent: no actor identity, filenames, metadata, original file bytes
or database IDs. Provider payloads, vectors and text are not logged. Content remains
untrusted reference data; it is never executed or inserted into system instructions.

Each input is limited to 8,000 UTF-8 bytes, a conservative byte-level BPE token bound
below the documented model limit, not an exact token count. Batches contain at most
16 inputs. Default document bound: 250,000 bytes (configurable between 8,000 and
2,000,000). The CLI preflights a 1,000,000-byte run ceiling. These are workload limits,
not a monetary/daily account quota. Explicit repeated/forced runs can incur charges.
The chat spending ledger does not include embeddings. Minimal audit metadata records
provider-reported tokens from completed batches.

Requests time out after 30 seconds; jobs have a five-minute deadline. Retries are
disabled. Failed/timed-out requests may still be billed. No fallback vectors are
generated. Responses must have the expected model, item count, unique indices, valid
usage, and finite nonzero 1536-dimensional vectors.

## Index lifecycle

Reusable functions: createEmbeddingAdapter, previewIndex and indexSource. An active
administrator is checked before work, before each provider batch and before commit.
Current source eligibility is checked before each batch. Changes after a request
starts cannot recall text already sent; they prevent later batches and/or commit.

Short row-locking transactions claim a ten-minute lease in existing ingestion metadata.
Transactions are not held open during network calls. Simultaneous work returns
INDEXING_BUSY. An explicit rerun can recover an expired lease after a crash. Stale
workers cannot commit over a replacement run. Malformed running leases fail closed
and require operator investigation. No automatic retry, background poller, startup
indexing or question-triggered indexing is added.

Index fingerprints include source fingerprint, model and dimensions. An unchanged
complete index returns UNCHANGED without provider calls or duplicate chunks. Missing
vectors or model changes trigger replacement; --force explicitly regenerates vectors.
Updated documents use 9A1 new-version ingestion.

Every batch must validate before vector changes are committed. One transaction updates
all chunk vectors, model metadata, INDEXED state and the success audit event. IDs,
source metadata, approval and activity are preserved. Failure leaves old vectors intact
and records ERROR. Retrieval must exclude PENDING/ERROR indexes. Database outages can
leave PENDING until lease recovery; failure marking is best-effort and sanitized.

externalProcessingAttempted records an attempt; externalProcessingPerformed becomes
true on successful indexing. A false/missing success flag does not prove that no
transmission occurred: failures carry billingMayBeIncomplete and may have sent/billed
inputs. Failure audits contain codes, run IDs and known completed-batch token totals.

Indexing does not approve or activate documents. [Phase 9A3 retrieval](rag-retrieval.md)
filters category, classification, APPROVED, active, INDEXED and matching embedding
model/dimensions, and exposes references only as untrusted data.

## Tests

```powershell
npm.cmd run test:rag:embeddings
npm.cmd run test:rag:indexing
npm.cmd run test:rag:ingestion
npm.cmd run test:rag:database
npm.cmd run test:vector
```

Adapter unit tests inject provider responses. PostgreSQL tests use synthetic documents
and vectors, exercise real transaction rollback, and delete only their own fixture
users/documents/audits. Coverage includes duplicates, model changes, partial failures,
audit rollback, concurrent leases, stale workers and privacy checks. They do not
establish retrieval quality. The separate smoke command verifies real API access.
