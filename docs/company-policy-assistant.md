# Phase 9C2 - Demonstration company-policy assistant

Extends the [9C1 corpus](company-policy-corpus.md) and existing PDPL tool-calling flow.
The current routing and presentation implementation supersedes the original routing
details below; see [Context-aware chat routing](chat-routing.md).
No ingestion, reindexing, database migration, dependency or administration UI is added.
The seven indexed sample policies remain NOT OFFICIALLY APPROVED, not EWA requirements.

## Request and source boundaries

- `search_company_policy` is a strict, empty-argument, chat-context-only tool. The
  backend supplies the current question and authenticated employee conversation.
  Model arguments cannot choose an identity, query, classification or approval status.
- Existing session checks, consent, account status, ownership, quotas, cancellation
  and embedding privacy checks apply. Direct generic tool execution is rejected.
- The chat privacy notice is now `chat-privacy-v6-company-policy`; employees must
  actively acknowledge it. It discloses question embeddings and transmission of
  relevant fictional sample passages for explanation. Real confidential policies
  are not eligible and must not be submitted in chat.
- Company retrieval/recovery requires development/test mode and explicit server
  `RAG_DEMONSTRATION_ENABLED=true`. Default remains false; `.env` was not changed.
  Disabled mode returns an explicit limitation and no policy excerpts/embedding call.
- PDPL uses its existing approved legal-source adapter. Recognized policy-only and
  PDPL-only questions are routed to the corresponding source even if the model picks
  the wrong knowledge tool. Mixed questions retrieve both separately. Routing uses
  conservative keyword guards plus model tool selection, not a guaranteed intent
  classifier; unclear follow-ups should restate the complete question.
- Mixed questions use two independently quota-accounted embeddings. The policy
  request ID is deterministically namespaced from the chat request ID, preventing
  collision with PDPL and avoiding a new ID on automatic retry.

After any knowledge retrieval no additional model-requested tools can execute.
Mixed retrieval is a fixed server operation, not a decision from retrieved text.
References remain untrusted function-output data. The existing Responses adapter,
disabled parallel calls, encrypted reasoning handling, store:false and no automatic
retries are preserved. Schema use follows [official function-calling guidance](https://developers.openai.com/api/docs/guides/function-calling).

## Answers and citations

Company and mixed answers use a strict JSON response with at most three citation
selections. The model selects a citation ID and quote ID; backend code regenerates
the exact quote from currently eligible source text and supplies real policy IDs,
titles, source version/date, revision and section metadata. Unavailable DOCX pages
remain unavailable. The company format cannot modify the existing PDPL-only format.

Answers start with the demonstration warning. Mixed answers require citations from
both categories, label each source category separately and include the unofficial
English translation/legal-advice notice. Unsupported answers, fabricated citations,
model-written quotations/locations and detected authority claims fall back to a
limitation. If either requested category is unavailable, no combined answer is given.

Source eligibility is rechecked after generation and on receipt recovery. Archived,
replaced or withdrawn sources cannot silently be replaced with different passages.
Receipts persist only tool name, status and chunk IDs, not full retrieved documents.
Existing private chat history still contains prior answer text: recovery warns when
its sources are unavailable; it does not erase or retroactively rewrite history.

Frontend source cards reuse the existing citation component, escape source text and
display NOT OFFICIALLY APPROVED. No raw HTML, downloadable document library or new
administration interface is exposed.

## Validation

Focused automated checks use real local PostgreSQL/pgvector and synthetic providers,
not paid OpenAI requests. They cover representative question contracts, citations,
mixed-source isolation, consent, ownership, admin denial, disabled mode, missing
evidence, withdrawal during generation, free replay/recovery and UI escaping.
The existing corpus lifecycle suite covers higher-version replacement.

Final validation on 23 October 2026: the combined groups below passed all 145 tests.
Targeted ESLint, syntax checks, scoped whitespace checks, frontend build and Prisma
validation passed. The build retained its large-bundle warning. No live OpenAI
requests or browser-interaction validation were performed in this subphase.

```powershell
node --test --test-concurrency=1 backend/tests/company-chat.test.js backend/tests/company-chat.integration.js backend/tests/pdpl-chat.test.js backend/tests/pdpl-chat.integration.js backend/tests/tool-registry.test.js backend/tests/tool-responses.test.js backend/tests/openai-adapter.test.js frontend/tests/company-chat.test.mjs frontend/tests/pdpl-chat.test.mjs frontend/tests/chat.test.mjs frontend/tests/chat-flow.test.mjs
node --test --test-concurrency=1 backend/tests/company-corpus.test.js backend/tests/company-corpus.integration.js backend/tests/rag-retrieval.test.js backend/tests/rag-retrieval.integration.js
npm.cmd run build
npm.cmd run prisma:validate
```

## Remaining limitations

See the [Phase 9C3 live-validation report](company-policy-live-validation.md) for the
initial live results, narrow validator correction and blocked fresh revalidation.
Tests with synthetic vectors/provider answers do not establish real question quality.
Citation checks prove source identity and exact snippets, not that every explanation
is semantically entailed. Prompt-injection defenses are layered, not a guarantee.
Conservative formatting guards may reject otherwise reasonable explanations. The
existing 500-token generation limit remains unchanged and needs live mixed-answer
evaluation. Official production company-policy retrieval remains intentionally absent.
