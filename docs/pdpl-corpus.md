# Phase 9B1 — Bahrain PDPL corpus

Scope: source preparation, explicit ingestion, indexing and approval only. No assistant tool,
answer generation, company-policy ingestion, UI or startup indexing is introduced.

The reviewed artifact is `backend/data/knowledge-base/pdpl/bahrain_pdpl.pdf` (37 physical
PDF pages), SHA-256 `576cccf74a8f2561b6f25f536c6444684424abd3478420873607df5d183354c1`.
The project owner identifies it as an **unofficial English translation**. That designation
is operator metadata, not a quotation extracted from the PDF. Arabic legislation is the
authoritative reference; this corpus does not establish the latest amendments or implementing
decisions and is not legal advice. Consult the DPO/legal counsel where appropriate.

## Controlled operation

Run from repository root; the existing configuration loads `.env` without logging secrets.
Use an explicitly designated active IT/security administrator UUID for attribution. A UUID
is not web authentication: this is a local operator command requiring filesystem/database
access. No HTTP write route is exposed.

```powershell
node backend/scripts/pdpl-corpus.js --preview
node backend/scripts/pdpl-corpus.js --ingest --actor ADMIN_UUID
node backend/scripts/pdpl-corpus.js --index --actor ADMIN_UUID
node backend/scripts/pdpl-corpus.js --approve --actor ADMIN_UUID --sha256 576cccf74a8f2561b6f25f536c6444684424abd3478420873607df5d183354c1
```

Preview reads local text and database metadata; no external API call or database write.
Ingestion stores an inactive DRAFT. Indexing sends only the reviewed public PDF chunks to
the existing configured OpenAI embedding adapter; it does not approve the document.
Approval checks exact source, chunk metadata, completed index and all vectors in one locked
transaction, then records approval and an audit event. It refuses an existing active alternative
version. Repeated ingestion, indexing and approval are idempotent. No command selects demo policies.

Changing this PDF requires explicit review of the fingerprint-bound source profile and a new
manifest version when already ingested. Existing company-policy fingerprints are unchanged.
No migration is needed: source metadata uses the existing JSON fields and approval columns.

## References and limitations

Standalone numbered article headings and the observed inline Article 22 title set article
context. Body cross-references do not. Context carries across contiguous physical pages, clears
after missing pages and at section/part boundaries. Promulgation articles remain separately
labelled. Chunks never cross a physical page or article boundary; no printed-page labels,
paragraph numbers, quotations or legal interpretations are invented. Unlabelled content has
a null section. Translation metadata remains untrusted reference metadata, not system instructions.

Approval means permission to retrieve this translation, not certification of legal authority,
currency or translation accuracy. The assistant integration and presentation of this notice are
Phase 9B2. Existing generic retrieval returns the verified page/section; full translation
metadata is stored on the document for that integration.

Tests: `node --test backend/tests/pdpl-corpus.test.js backend/tests/pdpl-corpus.integration.js`.
Database integration uses synthetic users/vectors and rolls all fixture writes back; it does
not claim a live OpenAI embedding result.

Embedding interface reused from Phase 9A, checked against
[official OpenAI API documentation](https://developers.openai.com/api/reference/typescript/resources/embeddings/methods/create).
