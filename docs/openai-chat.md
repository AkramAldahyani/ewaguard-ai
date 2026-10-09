# Secure OpenAI chat — Phase 8A and Phase 8B2B

Phase 8B2B connects the existing registry and durable approvals to Responses
function calling. Phase 8C connects the employee interface to these APIs. RAG, incident
creation, new file scans and arbitrary external tools are not enabled.

## Architecture and model

Employee → existing cookie/JWT authentication and employee RBAC → strict request
and privacy validation → PostgreSQL usage admission/reservation → dedicated
OpenAI adapter → usage reconciliation and response validation → atomic message
pair persistence → employee response.

`backend/src/ai/openai-adapter.js` is the only generation adapter. It uses the
official `openai` JavaScript SDK and Responses API, a fixed official API origin,
Standard (`service_tier: default`) processing, `store: false`, six allowlisted
functions, a 30-second abort deadline, and zero SDK retries. Client
disconnect aborts generation. Cancellation cannot guarantee cancellation of a
provider charge. No automatic fallback or model upgrade exists.

`tool-orchestration.js` validates the entire function batch before execution. It
uses the existing read-tool service and approval service, never invokes model
functions directly. Each output uses the matching `call_id`. Prior response items,
including encrypted reasoning requested with `reasoning.encrypted_content`, remain
in bounded in-memory context for follow-ups. Provider response IDs and reasoning
are never stored in chat. Tools default to disabled in standalone adapter calls;
authenticated chat explicitly enables the fixed schemas. The final bounded round
and approval explanations set `tool_choice: none`.

`OPENAI_API_KEY` and `OPENAI_MODEL` are backend-only environment settings. The
existing root `.env` is loaded without overwriting injected settings or rewriting
the file. Never use `VITE_*` for secrets. Missing configuration disables sending,
not other application features or history. The default model is `gpt-6-luna`;
an explicitly configured different model is preserved but rejected until its
exact ID, capabilities and pricing are reviewed in `MODEL_PRICING`.

Official documentation checked 2026-10-08 lists Responses support and low reasoning
for [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).
[Standard pricing](https://developers.openai.com/api/docs/pricing) is $0.10 input
and $0.50 output per million tokens, with $0.125 cache-write input pricing.
The ledger conservatively prices every input token at $0.125/million and every
output token at $0.50/million, ignoring cache discounts. The reviewed configuration
expires on **2026-11-08** and then rejects new requests until deliberately reviewed.
Unknown pricing, returned model IDs or unexpected processing tiers fail closed.

The adapter verifies model access using the read-only Models API before generation
and caches success for five minutes. This checks account access, not remaining
credit or every Responses parameter. The single live Responses check validates the
actual combination; there is no paid startup probe.

## API contract

All routes below require an active EMPLOYEE session, including current database
status/role checks. MFA-authenticated administrators also receive 403. Browser
requests must satisfy the existing trusted-origin protection. Responses have
`Cache-Control: no-store`. The router parses bounded JSON only after authorization.

| Endpoint | Contract |
| --- | --- |
| `GET /api/chat/privacy` | Versioned notice and fixed limits |
| `POST /api/chat/conversations` | Empty JSON object; returns 201, conversation and notice |
| `GET /api/chat/conversations?before=<uuid>` | Up to 50 owned, unexpired sessions; opaque UUID ordering and nextBefore cursor |
| `GET /api/chat/conversations/:id?before=<sequence>` | Up to 50 messages in chronological sequence order; first page is latest 50 |
| `POST /api/chat/conversations/:id/messages` | Contract below; returns the persisted USER/ASSISTANT pair |

```json
{
  "content": "What is phishing?",
  "requestId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "privacyNoticeVersion": "chat-privacy-v2"
}
```

Before sending, the future client must display the current privacy notice and
obtain active acknowledgement. Sending its exact version attests acknowledgement;
the backend records user, version and timestamp on the usage entry. Do not preselect
an acknowledgement. The backend cannot prove a human read a notice.

`requestId` is a client-generated UUID **idempotency key**, not a message identity.
Keep the same key when checking/retrying an uncertain submission. A successful
replay returns the original pair and costs nothing. A reused key with a different
body still refers to the original operation. Failed, pending or ambiguous keys
return 409 and never cause another paid call. Get history before deliberately
starting another operation. Every stored message ID is server-generated.

Unknown fields (including roles, model, instructions, tools, ownership, evidence,
files and token limits) are rejected. Missing and foreign conversations both return
404. No administrator private-chat/history endpoint exists.

One optional field is supported for a **private backend handoff**:

```json
{
  "analysisInput": {
    "toolName": "analyze_email",
    "parameters": { "body": "Synthetic invitation.", "headers": "" }
  }
}
```

Include this alongside the normal three message fields, never inside `content`.
URL input uses `toolName: analyze_url` and `parameters: {url: ...}`. A current
analyzer-specific disclaimer acknowledgement is required before any paid request.
The backend locally validates input and sends only the tool name and the current
request UUID as `inputReference`. The model must return that exact reference and
matching tool. The reference is valid only within this message execution; it does
not authorize a scan or provide arbitrary access to other drafts.

When requested, the existing approval service encrypts and persists the exact
operation. Chat returns `pendingConfirmation` and `toolMetadata.approvalId`, saves
a fixed confirmation message, and stops without a follow-up model request.
Private parameters are discarded from request memory after processing and never
become chat messages. HTTP JSON is bounded to 128 KiB; underlying analyzer byte
limits still apply. If no proposal is produced, input is not persisted. Clients
must use a new deliberate submission if they want to propose it again.

Additional employee-only endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/chat/conversations/:id/requests/:requestId` | Recover request status, safe references, current authorized results and approval status after a timeout or later-round failure |
| `POST /api/chat/conversations/:id/approvals/:approvalId/explanation` | Body `{privacyNoticeVersion}`; explain a completed saved analysis with no tools enabled |

The explanation endpoint derives a stable server idempotency key per approval.
Completed explanations replay for free. Attempted failures never automatically
retry. If the budget/provider is unavailable, it returns the saved deterministic
risk and Incident Assistance with an unavailable explanation status. It never
invokes the analyzer. Confirmation remains the existing separate human decision
endpoint documented in [tool approvals](tool-approvals.md).

## Privacy, system behavior and retention

Actively submitted chat text and at most eight persisted USER/ASSISTANT messages
are transmitted, plus server-owned instructions, fixed schemas and minimized
authorized tool projections. The current message is additional to those eight.
Raw email bodies/headers, raw files, URL inputs, identity fields, company documents,
scanner/provider payloads, password inputs and generated passwords are excluded.

Heuristic checks reject common secret assignments, private-key headers, recognizable
API keys, bearer/JWT tokens, six-digit codes, URL credentials and URLs containing
queries/fragments. Chat also rejects URLs and recognizable email/header blocks;
use the private handoff. History is checked again before transmission. These checks have
false positives and false negatives: they cannot recognize every secret, language,
obfuscation, confidential document or personal datum. Users must not paste sensitive
material. Model responses also pass shape, status, type, length and secret checks.

The centralized `ewaguard-tools-v2` instruction requires defensive advice,
uncertainty and IT/Security referral; it forbids invented scans, incident creation,
PDPL provisions and policy citations. Prompt rules cannot guarantee perfect
factuality or prevent every instruction disclosure. The decisive boundary is
structural: only schema-validated owner-filtered reads and pending proposals are
available. The model cannot change authorization, stored risk, confirmation state,
or incident records. Final text passes shape, secret, safety-claim and basic risk
contradiction checks. These are conservative heuristics, not semantic proof of
factuality. `verifiedResults` is the authoritative risk/assistance output; Phase 8C
renders its fields separately and renders model text as escaped prose.

Reuse `ChatSession` and `ChatMessage`: ownership, expiry and unique sequence are
already present. Successful message pairs and their completed ledger state commit
atomically. Failed requests do not leave partial history. Minimum history includes
content, role, server identity, sequence and timestamps; titles are left empty.
No system instructions, provider payloads or raw errors are persisted in history.

Sessions expire 30 days after creation, without sliding renewal. Expired history
is inaccessible immediately. The backend attempts cleanup at startup and hourly;
`npm run chat:purge` also runs cleanup for scheduled maintenance. Physical deletion
can lag expiry while the backend is down, cleanup fails, or a RESERVED request
requires review. Monitor `chat_retention_failed`. Session deletion cascades messages;
usage rows survive with null foreign keys so deletion never restores budget.
Database backups must follow the organization's retention policy as well.

The usage ledger contains request/identity references, acknowledgement and
instruction versions, model/pricing metadata, token counts, status, money and safe
tool references. Additive migration `20261009000200_tool_round_usage` adds nullable
`parentRequestId` and `toolMetadata` JSON. No existing data, index or approval
encryption was replaced. Keep
it for this fixed lifetime budget. Do not clear it during chat-history cleanup.
No employee content, model responses, passwords, cookies, authorization headers,
API keys or provider error payloads are logged. SDK logging is explicitly off.
`store: false` disables Responses application-state storage; it does **not** promise
zero provider retention. Review [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)
before using organizational data.

## Spending and concurrency

Hard ceilings live in `chat-policy.js`, outside employee control:

| Control | Limit |
| --- | --- |
| Lifetime application budget | $4; not reset daily/monthly |
| Employee paid attempts | 20 per UTC day, including every follow-up and explanation attempt |
| Active turns | 2 globally; 1 per conversation, held across all rounds |
| Input | 2,000 JavaScript UTF-16 characters |
| Previous context | Last 8 messages |
| Output | 500 tokens total, including reasoning |
| General API burst limit | 60 requests/minute per employee per process |
| Provider timeout/retries | 30 seconds / 0 |
| Tool-call rounds | At most 2 per employee message |
| Tool invocations | At most 4 total; an oversized batch is rejected before execution |
| Paid model requests per turn | At most 3: initial, tool follow-up, final response; pending confirmation stops immediately |

Every paid request, including tool follow-ups, inserts a separate durable reservation
under the existing shared PostgreSQL transaction advisory lock. Follow-up entries
carry the root `parentRequestId`; their costs are always included in global sums.
The root remains RESERVED as the turn/conversation slot until the final outcome.
Children count toward daily limits but do not consume extra turn slots. Admissions
across backend instances cannot evade either reservations or limits.

The reservation uses UTF-8 bytes of instructions, full bounded context and tool
schemas plus 4,096 tokens
for framing overhead and the full output cap. Integer microdollars are rounded up.
Admission sums reconciled costs **and all in-flight reservations**, checks the daily
quota and slots, then releases the database lock before the provider request.
The completed usage reconciles both input and total output tokens (including
reasoning); cached-input savings are intentionally ignored. Known usage is charged
even when response validation/history storage fails. Database failure before
admission means no paid call. Reconciliation failure leaves a reservation intact.

Missing/malformed usage, unexpected model/tier, over-bound token usage, timeouts,
provider exceptions or network failures retain the reservation and mark UNKNOWN.
All future admissions stop. A RESERVED entry older than 60 seconds also stops
admission, covering process crashes. No timer silently releases uncertain funds.
Even a likely unbilled rejection is conservatively held pending review.

Recovery is an operator task, not a chat/admin API: inspect provider billing, match
the request time/model to metadata, verify no call remains in flight, and reconcile
the row's `chargedMicros` before setting FAILED (or restore missing reconciliation
from verified usage). Never simply delete usage or release reservations after a
timeout. Unknown usage cannot be safely resolved from an employee retry.

**These are application estimates, not a guarantee the OpenAI account cannot be
charged more than $5.** Price changes, other projects/keys, taxes, provider accounting
and calls outside this backend are outside this ledger. Keep approximately $1 of
the purchased credits as reserve, **disable automatic recharge** in OpenAI billing,
use a dedicated project/key and review the provider's billing dashboard. The single
verification call is conservatively charged to the same $4 application ledger.

## Errors and validation

Safe stable codes distinguish missing configuration, invalid/unpriced model,
provider auth, insufficient credits, rate limits, timeout, network failure,
invalid response, daily quota, budget exhaustion, uncertain usage and conflicts.
Unexpected storage errors use the existing generic 500 handler, with no payload or
stack disclosure. No automatic retry is enabled at any layer.

`npm run test:chat:api` uses only synthetic fixtures, real local PostgreSQL and
mocked provider calls ($0). Tests cover auth/ownership, suspended users, roles,
privacy, acknowledgement, history bounds, idempotency, token accounting, daily and
concurrent budget enforcement, global/conversation slots, ambiguous failures,
atomic storage rollback, expiry, logging and adapter limits/cancellations.
Existing auth/MFA, analyzers, risk, assistance, portal, password and pgvector tests
remain separate regression coverage.

`npm run openai:verify:model` performs only a free read-only model-access check.
`npm run openai:verify:live` is manual and must never enter automated test scripts.
It makes at most one generation attempt, after model access verification, using
the synthetic phishing prompt, low reasoning and a 128-token output cap. It uses
the same budget service, removes synthetic history/account afterward and preserves
the ledger charge. A Git-ignored `.runtime` marker and permanent request ID prevent
accidental reruns. Do not remove these to retry without new authorization.

## Future boundary

Phase 8B2B completes backend function orchestration and approval continuation.
Phase 8C connects the frontend, active privacy notice, private handoff, exact
operation review, confirmation choices, authoritative results and recovery UI.
RAG and incident automation require separate phases. No live paid request was
made for Phase 8B2B; normal tests mock the official SDK transport.

## Phase 8A validation record (2026-10-08)

- `npm test`: 299 backend tests passed, including 22 new chat/adapter tests and subtests.
- `node --test frontend/tests/*.mjs backend/tests/database.integration.js backend/tests/vector.integration.js`:
  107 passed, including HNSW preservation. Parallel Vite test servers emitted port
  warnings; `node --test --test-concurrency=1 frontend/tests/*.mjs` passed all 74
  frontend checks without those warnings.
- `npm run lint`, `npm run build`, `npm run check:backend`, explicit new-module
  syntax checks and `git diff --check` passed. Build retains its existing large-chunk warning.
- Prisma format, validate, generate, additive migrate deploy and migration status
  passed. No database reset or vector/index modification was performed.
- `npm audit`: zero vulnerabilities (registry access required network permission).
- Actual backend startup/HTTP smoke: health 200; anonymous chat privacy access 401.
- Read-only model access: configured `gpt-6-luna`, HTTP 200.
- **Exactly one paid live request**: Responses API succeeded with a validated
  response, 301 input tokens and 53 output tokens. Conservative rounded ledger
  estimate: **$0.000065**, reconciled from a $0.000775 reservation. No provider or
  billing error occurred. Synthetic account/history was removed; the charge and
  rerun marker were retained. No response content or API key was printed.

## Phase 8B2B validation record (2026-10-09)

- `npm test`: 368 backend tests/subtests passed, including 28 new Responses
  checks and the unchanged durable-approval, analyzer, risk, assistance, auth/MFA
  regressions. Backend suites run sequentially because independent tests exercise
  the same application-wide ledger and intentionally create blocking reservations.
- `node --test --test-concurrency=1 frontend/tests/*.mjs backend/tests/database.integration.js backend/tests/vector.integration.js`:
  107 passed, including portal rendering and the preserved HNSW index.
- `npm run lint`, `npm run build`, `npm run check:backend`, explicit new-module
  syntax checks and `git diff --check` passed.
- Prisma format, validation, additive migration deployment, client generation and
  migration status passed; all six migrations are applied. No reset was performed.
- `npm audit`: zero vulnerabilities. The existing frontend large-chunk warning
  remains. No frontend implementation changed.
- Local HTTP integration used the actual Express routes, authentication,
  PostgreSQL ledger and approval storage with mocked SDK responses. No live paid
  OpenAI generation or model verification was performed in this phase.
- Live function-calling compatibility remains unverified to preserve API credit.
  AI prose validation remains heuristic; authoritative risk is always backend data.

## Phase 8C integration and validation (2026-10-09)

The employee `/assistant` route uses the existing backend; see
[employee workflow and API contracts](chat-interface.md). It provides persisted
conversation history, active versioned privacy acknowledgement, private email/URL
handoff, exact-input review, explicit approval/rejection, backend risk/assistance
cards and GET-only recovery. Explanation is an explicit separately budgeted action.
The frontend does not change RBAC, MFA, approval execution or the $4 ledger policy.

History now projects safe root request references from existing AiUsage records.
No database schema, migration or HNSW index changed. No browser storage is used.
Browser epoch/abort guards protect conversation switching and logout. No direct
OpenAI browser request, autoapproval, automatic retry, incident creation or RAG
was added. Text stays escaped and suspicious URLs remain nonclickable.

Validation executed:
- `npm test`: 369 backend checks passed, including auth/RBAC/MFA, disclaimers,
  analyzers, risk, assistance, adapter, tool registry, approvals and orchestration.
- Sequential frontend/database/vector suites: 139 checks passed, including HNSW.
- 32 new frontend flow/API/render tests and one integrated frontend-client/HTTP
  lifecycle test; existing chat history tests now verify safe request metadata.
- `npm run test:tools`: 70 passed. A pre-existing approval-expiry test fixture was
  fixed to use one clock sample, preserving the exact five-minute SQL constraint.
- Lint, frontend build, backend checks, route syntax, Prisma validation, migration
  status (all six applied), audit (zero vulnerabilities) and diff check passed.
- `npm run dev` started both Vite and the API. Integration tests exercised real
  local HTTP login/logout, PostgreSQL and analyzer/approval services with mocked
  Responses SDK output, including pending operations, rejection and result recovery.

No live OpenAI calls were made for Phase 8C. Browser automation returned unavailable
for both Edge and the in-app browser. Visual responsive/focus/scroll/console checks
and live function-calling compatibility remain unverified. The existing large
frontend bundle warning remains. Phase 9 was not started.
