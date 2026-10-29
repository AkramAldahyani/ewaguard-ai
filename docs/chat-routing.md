# Context-aware chat routing and presentation

The first existing Responses call now requires either `route_question` or an existing
analysis tool. There is no separate paid classifier call. The configured model remains
`gpt-6-luna`. General answers and clarifications return in that first call; grounded
answers normally use a routing call, one embedding per requested source category,
and one answer call. Existing spending, rate, concurrency and tool limits still apply.

## Causes addressed

- Optional tool selection allowed workplace-permission questions to bypass retrieval.
  Keyword guards and latest-message-only queries lost implicit intent and follow-ups.
- Earlier system instructions told employees to restate follow-ups and conflicted with
  the new conversational routing behavior.
- Vector similarity alone sometimes ranked legal penalties/scope above consent or
  individual-rights provisions. Policy cover pages consumed useful result slots.
- Response guards mistook educational password descriptions and negative approval
  disclaimers for secrets or authority claims. Exact-only inline-label syntax also
  discarded valid source/quote references. The three-quote limit was too restrictive
  for a short answer covering several rules or both source categories.
- The existing Markdown renderer had incomplete list/inline handling. Full retrieved
  passages and notices duplicated the answer and made the chat unnecessarily long.

## Routing contract

`route_question` receives the existing last eight conversation messages. Its strict
arguments select GENERAL, COMPANY_POLICY, PDPL, BOTH or CLARIFY. General answers are
included in the decision. Retrieval decisions contain a short standalone question
resolved from context and an INCLUDE/OMIT flag for separately labeled general advice.
The selected category and guidance flag are saved; the rewritten query is not saved
in routing metadata or retrieval audit logs. Ordinary private chat retention remains.

The model cannot select a user, approval, classification, document ID or permission.
The backend runs the existing authenticated source services with fixed category and
publication filters. Demo policy access still requires the development/test gate and
explicit demonstration mode. Legal evidence and sample company rules remain separate.
Legacy search tools remain supported for compatibility, but are absent from the live
initial tool list. Analyzer ownership, private input references and human confirmation
are unchanged.

The v7 privacy notice discloses context-assisted search-question formulation and
requires fresh acknowledgement. General questions do not generate embeddings.
Unresolved ambiguity prompts clarification. Follow-ups retrieve fresh evidence rather
than trusting a prior assistant answer as a source.

## Grounding and display

Chat retrieval combines vector similarity with PostgreSQL English text relevance on
eligible passages. It retains the vector similarity floor, PDPL article continuation
handling and explicit-article/definition preferences. This adds no external call,
dependency, migration or index rebuild. Non-English queries retain vector retrieval.
Policy chat excludes cover pages without section metadata. PDPL chat uses the
existing five-result retrieval ceiling so related sensitive-data provisions do not
crowd the general processing provision out of the answer context; company chat
remains bounded to three passages.

Retrieved evidence stays in untrusted function outputs. After retrieval no additional
tools are allowed. The model returns strict structured JSON. The final response
schema enumerates only source/quote pairs present in current evidence, with citation
selection before prose. Its actual size is included in the usage reservation. This
uses nested `anyOf` as supported by the [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
Up to six selected
source/quote pairs are checked against current eligible text, grouped by source and
rendered with backend-supplied titles and locations. Verified `[POLICY1:Q1]` variants
normalize to `[POLICY1]`; unknown or unselected references fail closed. Revalidation
after generation and receipt recovery still protects withdrawn sources.

General guidance has its own field and label. Missing/irrelevant source evidence does
not fall through to an ungrounded rule. Partial relevant material may support a bounded
explanation that explicitly says which requested permissions remain unestablished.
Demonstration and unofficial-translation notices remain visible in the answer.

The existing React renderer supports headings, paragraphs, nested/multiline lists,
numbered steps, bold/italic text, escaped literal evidence and citation labels. It
never renders raw HTML. HTTPS links to explicitly allowlisted public reference sites
are active; arbitrary analysis URLs remain inert. Full source evidence and recovery
controls collapse under an accessible details element after successful retrieval;
withdrawal/unavailability warnings remain expanded.

## Validation

Automated tests use synthetic providers and real local PostgreSQL/pgvector for source,
authorization, consent, withdrawal, recovery and quota checks. The routing tests cover
general, implicit policy, legal, mixed, context-dependent, invalid and ambiguous
decisions. Renderer tests cover spacing, nested lists, citations, escaped text and
unsafe links. Existing analysis tool, confirmation and risk checks are retained.

`node backend/scripts/verify-chat-routing.js --run <unique-run-name>` explicitly runs
27 public example turns against the configured live model and local demonstration
corpus. It has a 60-response-call ceiling, refuses repeated run names, creates and
removes synthetic users, and preserves real usage charges/audits. It writes an ignored
`.runtime/chat-routing-v7-<name>.json` report containing only these public evaluation
questions, responses and public/fictional evidence. Do not run it concurrently with
database tests that intentionally manipulate the shared budget or concurrency slots.
An optional final argument filters the fixed public cases by question substring,
for example `--run permission "coffee shop"`, for a focused recheck after a fix.

## Limits

Semantic routing and explanation entailment are probabilistic. Citation checks prove
source identity and exact supporting snippets, not complete semantic correctness.
The corpus remains a finite 2018 unofficial English legal translation and seven
fictional policies. Unsupported questions still need clarification or IT/DPO review.
No official EWA policy authority or exhaustive legal coverage is claimed. Provider
outages remain explicit errors, without automatic retries or a more expensive model.
The 500-output-token limit remains unchanged.

## Executed regression checks — 24 October 2026

The final combined backend/frontend suite passed **201 tests, zero failures**. It included
chat HTTP/ledger boundaries, company/PDPL HTTP integrations, retrieval access and
ranking, tool authorization/confirmation/orchestration, source formatting and chat
rendering/conversation behavior. Targeted ESLint and the scoped Git whitespace check
passed. The frontend production build passed with its existing large-bundle warning.
No schema changes or migrations were needed.

Earlier live evaluations exposed the validation and retrieval defects documented
above; their failed cases became regression tests. Intermittent provider-unavailable
responses also occurred and were kept separate from routing/grounding outcomes.
The final full live run (`constrained`) routed all **27/27** turns to the expected
categories; **26/27** also passed the answer/citation acceptance check. Its remaining
failure was a negative official-permission disclaimer rejected by the authority guard.
After fixing and regression-testing that case, the targeted live recheck (`permission`)
passed **1/1**. The full live matrix was not repeated after that final narrow guard fix.
These checks verify routing, category selection and accepted citations, not exhaustive
legal correctness or guaranteed behavior for every future wording.
Browser visual inspection could not be completed because Computer Use could not
verify Chrome's current URL; browser interaction stopped. Rendering assertions and
build results must not be described as a completed visual browser check.
