# Phase 9C1 - Demonstration policy corpus

This subphase prepares the company corpus and secure retrieval eligibility. Company
policy assistant tools and generated answers are documented in [Phase 9C2](company-policy-assistant.md); end-to-end semantic
question evaluation remains Phase 9C3. Existing PDPL integration is preserved.

## Sources and metadata

The seven existing DOCX files are under `backend/data/knowledge-base/company-policies/`
(not a `demo/` subdirectory). The existing manifest explicitly classifies them as
DEMONSTRATION. Files were not moved or edited. Extraction uses the existing isolated
Node pipeline. It preserves literal policy IDs, source titles, version/date text,
status, ownership and numbered section headings. DOCX page numbers remain null.
Source version/date text and the integer database revision are separate fields.

Only explicitly marked fictional samples can enter this workflow. Sources carry
`DEMONSTRATION / NOT OFFICIALLY APPROVED` and are not official EWA requirements.
Retrieved content remains untrusted reference data, never system instructions.

## Controlled local operator workflow

Run from the repository root with the existing database and embedding configuration:

```powershell
node backend/scripts/company-corpus.js --preview
node backend/scripts/company-corpus.js --ingest --actor-email admin@ewa.bh
node backend/scripts/company-corpus.js --index --actor-email admin@ewa.bh
$env:RAG_DEMONSTRATION_ENABLED='true'
node backend/scripts/company-corpus.js --activate-demo --actor-email admin@ewa.bh --reviewed-sha256 <digest-from-reviewed-preview>
```

The CLI requires local operator access and resolves the attributed account to an
active administrator. An email is not an HTTP authentication mechanism. No new public
modification endpoint, startup ingestion or question-time reindexing was added.
Review the preview before activation; a changed corpus invalidates its review digest.
Indexing calls OpenAI only for these explicitly demonstration-classified sources.

`RAG_DEMONSTRATION_ENABLED` defaults to false and cannot be enabled in production.
The flag above affects only that PowerShell process and children. Application retrieval
requires its own explicit development/test configuration; `.env` was not changed.

Demo activation does not approve or publish documents: database status remains DRAFT,
active remains false, and approval identity/time remain null. Separate review metadata
binds eligibility to the exact content hash and ingestion fingerprint. Activation
checks extracted text, chunk metadata, completed vectors and the current local source.
Search independently enforces category, classification, review, index and model filters.
Clients cannot supply the internal demo-eligibility permission.

For an updated sample, change the manifest to a higher integer revision, preview and
review again, then ingest/index/activate. Same-version conflicts are rejected. Activation
atomically archives an older eligible sample with the same document key and policy ID.
Repeated unchanged operations do not duplicate documents or regenerate embeddings.
Approved real policies cannot be replaced through this demonstration workflow. A future
approved-policy workflow must implement its own authorization, approval and external-API
privacy controls; production policy retrieval is deliberately unavailable here.

## Actual validation (23 October 2026)

- All seven real DOCX sources ingested and indexed: 116 chunks, 39,675 UTF-8 input bytes,
  7,232 reported embedding tokens using `text-embedding-3-small`, 1,536 dimensions.
- Repeated ingestion, indexing and activation returned UNCHANGED for all seven.
  Read-only audit checks found one indexing attempt per document.
- All seven were demo-eligible with the internal permission and ineligible without it;
  all remained DRAFT, inactive and without official approval.
- 39 company/retrieval/PDPL chat tests passed, including real PostgreSQL/pgvector tests
  with synthetic providers. These cover metadata, authorization, mode gating,
  category isolation, withdrawal, version replacement and missing evidence.
- Another 44 ingestion, embedding, indexing and PDPL corpus regression tests passed.
- Targeted ESLint and Prisma validation passed. No schema migration or dependency added.

Commands for the two test groups:

```powershell
node --test --test-concurrency=1 backend/tests/company-corpus.test.js backend/tests/company-corpus.integration.js backend/tests/rag-retrieval.test.js backend/tests/rag-retrieval.integration.js backend/tests/pdpl-chat.test.js backend/tests/pdpl-chat.integration.js
node --test --test-concurrency=1 backend/tests/rag-ingestion.test.js backend/tests/rag-ingestion.integration.js backend/tests/rag-embeddings.test.js backend/tests/rag-indexing.integration.js backend/tests/pdpl-corpus.test.js backend/tests/pdpl-corpus.integration.js
npm.cmd run prisma:validate
```

Live semantic relevance and assistant answers for company-policy questions have not
been validated in this subphase. Synthetic test vectors are not claimed as relevance
results. The company-policy chat tool was added separately in 9C2; no administration UI was added.
