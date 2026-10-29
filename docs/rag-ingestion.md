# Phase 9A1 — Local knowledge document ingestion

This phase prepares draft documents and chunks. It does **not** generate embeddings,
perform semantic retrieval, answer legal/policy questions, or publish documents.
Nothing is ingested at application startup or when an employee asks a question.

## Operator commands

From the repository root:

```powershell
npm.cmd run prisma:generate
npm.cmd run db:migrate
npm.cmd run knowledge:ingest -- --preview
npm.cmd run knowledge:ingest -- --apply --actor <active-administrator-uuid>
```

Preview is the default and needs no database connection. It reports only identifiers,
counts and extraction limitations, not extracted text. Apply requires local filesystem
and database access and verifies that the supplied actor is an active, undeleted
IT_SECURITY_ADMIN. The actor ID is audit attribution, **not authentication**: this is
an operator CLI, never an employee-facing endpoint. Do not expose it through HTTP,
an AI tool, or an untrusted job runner. Existing session/MFA controls remain unchanged.

The allow-list is `backend/data/knowledge-base/manifest.json`. The seven demonstration
policies remain in `company-policies/`; the public PDF remains in `pdpl/`. No move is
required. The manifest supplies operator-declared titles, keys, integer versions,
category and classification. A manifest version is the ingestion revision, not a
claim about a printed legal or policy edition. Source filenames are relative local
references, not fabricated publication URLs. Review source authenticity separately.

All imported documents are DRAFT, inactive and NOT_INDEXED, with null embeddings.
Classification is independent of approval: public legislation uses PRODUCTION;
the sample company policies use DEMONSTRATION. Existing records migrate to UNSPECIFIED.
The current manifest validator refuses production/confidential company documents.
Ingestion makes no external API calls and grants no permission for future transmission.

## Extraction and provenance

The existing file signature/archive inspector is reused. PDF text is extracted with
PDF.js; DOCX body XML is read using bounded yauzl streams and strict saxes parsing.
Only the main document part is processed. External links, embedded objects, field
instructions, macros and scripts are not executed or fetched. DTD/entity declarations,
password-protected PDFs, encrypted archives, unsafe paths, duplicate ZIP entries, macros and malformed XML
are rejected. File access resolves canonical paths within the local knowledge root.
The root must remain writable only by trusted operators (path checks are not a
defense against an operator racing filesystem replacements).

Limits: 10 MiB input; 200 archive entries; 50 MiB declared archive expansion;
8 MiB main XML; 500 PDF pages; 2 million extracted characters; 5,000 chunks.
The existing archive compression-ratio limit also applies. Extraction runs in a
disposable worker without inherited application secrets, with a 30-second timeout
and a 256 MiB V8 heap limit. The worker
is a resource boundary, not an operating-system sandbox or malware scanner. Native
allocations are not covered by the V8 limit. Parser diagnostics are discarded to
avoid recording source text. Uploaded/untrusted documents need a separate reviewed
intake workflow; no new upload endpoint is provided.

PDF page numbers are physical 1-based pages from the parser, not printed labels.
No legal section or article number is inferred. DOCX preserves paragraphs, explicit
Heading1–Heading9/Title or outline-level headings, table-cell text in document order,
and Unicode. Its pages are null because pagination requires layout rendering.
Deleted revisions and field instructions are omitted; headers, footers, footnotes,
comments, images and embedded content are not extracted. Custom heading styles
without an explicit outline level are ordinary paragraphs. Table geometry, list
numbering and complex PDF reading order are not guaranteed. There is no OCR;
empty PDF pages are recorded, and entirely textless documents fail explicitly.

Chunks target 1,600 characters with up to 200 characters of overlap, favoring paragraph
or word boundaries. Overlap stays within a known page/section. Character limits are
not token estimates; Phase 9A2 must enforce model token and vector-dimension limits.
Chunk metadata retains actual page/heading values, source block indices and offsets
within normalized group text. Document IDs and chunk IDs come from the database.
Text is reference data marked UNTRUSTED, never interpreted as system instructions.
Phase 9A3 must enforce the prompt/message trust boundary when retrieval is integrated.

## Persistence and repeat runs

The existing KnowledgeDocument/DocumentChunk models are reused. A small additive
migration adds filename, classification and ingestion metadata; it leaves pgvector
and its index unchanged. Fingerprints cover source bytes, manifest metadata and
pipeline version. Repeating identical ingestion returns UNCHANGED. Changing bytes
or metadata under the same document key/version fails with VERSION_CONFLICT; increment
the manifest version to create a new inactive draft. Previously approved records
are never silently replaced or deactivated. A later publication workflow must manage
active-version selection. Extraction is repeated for validation on explicit CLI runs;
database document/chunk rows and success audit events are not duplicated.

A transaction and per-document PostgreSQL advisory lock cover creation of the document,
all chunks and its required audit event. Each document is atomic; a batch stops on the
first failure, preserving earlier successful documents. Fix the failure and rerun.
No raw document text is placed in audit logs. Provider indexing and re-indexing are
described in [Phase 9A2](rag-indexing.md).

## Validation

```powershell
npm.cmd run test:rag:ingestion
npm.cmd run test:rag:database
npm.cmd run test:vector
```

Unit tests use real-format synthetic PDF/DOCX bytes. The opt-in database suite requires
the local `ewaguard_ai` development database and seeded roles; its synthetic database
records are rolled back and its temporary files are removed. It checks draft metadata,
unembedded chunks, administrator restrictions, duplicate ingestion, version conflicts
and audit creation. Live local-source preview is separate from synthetic tests.

PDF extraction options follow the [PDF.js API documentation](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).
