# Knowledge base (RAG): Bahrain PDPL and company policies

## In short

The AI assistant can answer questions about two document collections:

1. **Bahrain PDPL**: an unofficial English translation of Bahrain's Personal Data Protection Law (public legislation).
2. **Company policies**: seven **fictional sample** policies used for demonstration only. They are clearly labeled `DEMONSTRATION / NOT OFFICIALLY APPROVED` and are **not** official EWA rules.

It uses **RAG (Retrieval-Augmented Generation)**: first search the approved
documents for relevant passages, then let the AI explain the answer **using only
those passages**, with exact quotes and source locations.

```text
Document → extract text → clean → split into chunks → embeddings (OpenAI)
   → stored in PostgreSQL + pgvector
Question → embedding → similarity + text search → best passages
   → AI writes a structured answer citing passage IDs
   → backend inserts the exact quotes and real locations → employee
```

## Source files

| Collection | Files | Size |
| --- | --- | --- |
| PDPL | `backend/data/knowledge-base/pdpl/bahrain_pdpl.pdf` (37 pages) | 122 chunks |
| Company policies | 7 DOCX files in `backend/data/knowledge-base/company-policies/` | 116 chunks |

`backend/data/knowledge-base/manifest.json` is the allow-list: only files listed
there, with their title, key, version, category and classification, can be
imported. PDPL is classified `PRODUCTION` (public law); the samples are
`DEMONSTRATION`. Confidential or real company documents are refused.

The PDPL PDF's fingerprint (SHA-256
`576cccf74a8f2561b6f25f536c6444684424abd3478420873607df5d183354c1`) is checked on
approval. The Arabic text is the authoritative law; this translation may not
include the latest amendments and is not legal advice.

## Stage 1: Ingestion (import text)

- Done only by an operator from the command line, never automatically and never through a web endpoint.
- PDF text is extracted with PDF.js; DOCX text is read directly from the document XML (no macros, links or embedded objects are run or fetched). Encrypted, macro-enabled or malformed files are rejected.
- Extraction runs in a separate worker with a 30-second limit and 256 MiB memory, without access to the app's secrets.
- Limits: 10 MiB file, 500 PDF pages, 2 million characters, 5,000 chunks.
- Text is split into chunks of about **1,600 characters** with up to 200 characters of overlap. Chunks keep the real page number (PDF) or heading (DOCX). For PDPL, chunks never cross an article boundary and keep the article label.
- New documents are saved as **DRAFT, inactive, not indexed**. Repeating an identical import changes nothing; changed content needs a higher version in the manifest.
- There is no OCR: scanned image-only PDFs are not supported.

## Stage 2: Indexing (create embeddings)

- Uses OpenAI `text-embedding-3-small` (or `-large`) at **1,536 dimensions**, matching the database column.
- Only chunk text is sent, never filenames, IDs or user data. Each input is at most 8,000 bytes, at most 16 per batch, 250,000 bytes per document by default.
- Before sending, the source file is re-read and compared with the database, so changed or unapproved content is never sent.
- All vectors for a document are replaced in one transaction. A failure keeps the old vectors.
- A 10-minute lease prevents two indexing runs at once.
- No retries; a failed request may still be billed. Embedding costs are **separate** from the chat budget.

## Stage 3: Approval and eligibility

| Collection | How it becomes searchable |
| --- | --- |
| PDPL | Operator approves it with the exact SHA-256 → `APPROVED`, active, `INDEXED` |
| Company samples | Stay DRAFT and inactive. A separate "demo activation" (bound to a reviewed content hash) makes them eligible, and they are searched **only** when `RAG_DEMONSTRATION_ENABLED=true`. The public site turns this on so the prototype can answer policy questions; every answer still starts with the demonstration warning. Activation itself works only in development/test. |

Search always filters on category, classification, approval, active state,
indexing state and matching embedding model, so drafts, failed indexes or
withdrawn documents can never be returned.

## Operator commands

Run from the repository root. `<ADMIN_UUID>` / admin email must be an active
administrator; it records who did it (it is not a login).

```bash
# PDPL
node backend/scripts/pdpl-corpus.js --preview
node backend/scripts/pdpl-corpus.js --ingest --actor <ADMIN_UUID>
node backend/scripts/pdpl-corpus.js --index --actor <ADMIN_UUID>      # paid embeddings
node backend/scripts/pdpl-corpus.js --approve --actor <ADMIN_UUID> --sha256 576cccf7...354c1

# Company samples
node backend/scripts/company-corpus.js --preview
node backend/scripts/company-corpus.js --ingest --actor-email admin@ewa.bh
node backend/scripts/company-corpus.js --index --actor-email admin@ewa.bh   # paid embeddings
RAG_DEMONSTRATION_ENABLED=true node backend/scripts/company-corpus.js --activate-demo --actor-email admin@ewa.bh --reviewed-sha256 <digest-from-preview>

# Generic tools
npm run knowledge:ingest -- --preview
npm run knowledge:index -- --preview
npm run knowledge:verify:embeddings   # one paid request with a synthetic sentence
```

Preview commands make no changes and no paid calls.

## Stage 4: Answering in chat

1. The model's first call, `route_question`, decides: GENERAL, COMPANY_POLICY, PDPL, BOTH or CLARIFY, and rewrites a follow-up into a complete standalone question. General questions do not use retrieval.
2. The backend embeds the question once per collection needed.
3. Search combines **vector similarity** with PostgreSQL **English text relevance**. It also prefers an explicitly mentioned PDPL article, the Definitions article for "what does X mean" questions, and adds the continuation of an article that runs onto the next page. Policy cover pages are skipped. Up to **5** PDPL passages and **3** policy passages are used.
4. Passages are given to the model as **untrusted data**, never as instructions, so text like "ignore your rules" inside a document has no effect. No further tools are allowed after retrieval.
5. The model must reply in a strict JSON format, choosing **citation and quote IDs** from the passages it was given. It cannot write its own quotes.
6. The backend builds the exact quotes (20–300 characters) from the stored text, adds the real titles, sections and pages, and checks every citation. Unknown or invented citations, unsupported claims, or claims that the sample policies are official make the answer fall back to a safe "I can't confirm this" message.
7. PDPL answers always show the unofficial-translation / Arabic-is-authoritative notice; policy answers start with the demonstration warning. Mixed answers label each source type separately.
8. Saved receipts keep only chunk IDs. If a source is later withdrawn, recovery warns that the answer's sources are no longer available.

## Direct search endpoint

Employees can also search without the chat:

1. `GET /api/knowledge/privacy`: notice and limits.
2. `POST /api/disclaimers/acknowledge` with `{ "context": "CHAT" }`.
3. `POST /api/knowledge/search` with the question, category, classification, approval status, notice version, acknowledgement ID, a new request ID and a limit (default 3, max 5).

It returns exact excerpts with their source details, or `NO_MATCHES`. Similarity
is a ranking number, not a probability (minimum 0.25).

Limits: 10 searches per minute and 1 at a time per employee; 30 embeddings per
employee and 1,000 overall per UTC day. Questions up to 1,000 characters; common
secrets and pasted emails/URLs are rejected. Questions and their vectors are not
stored; the audit record (`KNOWLEDGE_RETRIEVAL_REQUESTED`) holds only IDs and settings.

## Evaluation results

- **PDPL (live, 5 fixed questions):** answers for "personal data", "sensitive personal data" and Article 22 (automated decisions) cited the correct articles and pages; a question about invented 2035 changes and a role-impersonation attempt correctly got a limitation message.
- **Company policies (live, 9 fixed questions):** the first run passed 3/9 because the answer checker wrongly rejected correct "these are not official" disclaimers. The checker was fixed and all 6 captured failures pass it offline. A fresh live rerun is still pending (the provider was unavailable at the time).
- These are small fixed checks, not a full legal or relevance benchmark.

## Limitations

- The PDPL source is an unofficial translation and may be out of date; it does not replace the DPO or legal counsel.
- The company policies are fictional; real policy retrieval is intentionally not available.
- Citation checks prove the quote is real, not that every sentence of the explanation is perfectly correct.
- Routing and similarity search can still miss relevant passages.

## Code and tests

- `backend/src/rag/` (sources, extraction, chunking, embeddings, indexing, retrieval, PDPL and company answers)
- `backend/src/routes/knowledge.js`, `backend/src/ai/question-routing.js`
- Tests (synthetic embeddings; no cost): `npm run test:rag:ingestion`, `npm run test:rag:embeddings`, `npm run test:rag:indexing`, `npm run test:rag:retrieval`, `npm run test:rag:database`, `npm run test:vector`, plus `backend/tests/pdpl-*.js` and `company-*.js`
- The PDPL chat test needs the PDPL corpus ingested in the test database.
- Manual paid checks: `backend/scripts/verify-pdpl-live.js`, `backend/scripts/verify-company-live.js`. They write markers to `.runtime/` to prevent accidental paid reruns; do not delete those markers just to retry.
