# Phase 8A — Secure OpenAI integration and chat backend

Phase 8A supplies a REST backend for general cybersecurity guidance. The existing
assistant UI remains an explicitly labeled preview until Phase 8C. No analyzer,
RAG, incident automation, or model tool calling is connected to chat.

## Architecture and model

Employee → existing cookie/JWT authentication and employee RBAC → strict request
and privacy validation → PostgreSQL usage admission/reservation → dedicated
OpenAI adapter → usage reconciliation and response validation → atomic message
pair persistence → employee response.

`backend/src/ai/openai-adapter.js` is the only generation adapter. It uses the
official `openai` JavaScript SDK and Responses API, a fixed official API origin,
Standard (`service_tier: default`) processing, `store: false`, `tools: []`,
`tool_choice: none`, a 30-second abort deadline, and zero SDK retries. Client
disconnect aborts generation. Cancellation cannot guarantee cancellation of a
provider charge. No automatic fallback or model upgrade exists.

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
  "privacyNoticeVersion": "chat-privacy-v1"
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

## Privacy, system behavior and retention

Only actively submitted chat text and at most the last eight persisted USER or
ASSISTANT messages are transmitted, plus server-owned versioned instructions.
The current user message is additional to those eight. No identity fields,
email/URL/file analyses, attachments, company documents, incident evidence,
password-analysis input or local generated passwords enter the provider request.

Heuristic checks reject common secret assignments, private-key headers, recognizable
API keys, bearer/JWT tokens, six-digit codes, URL credentials and URLs containing
queries/fragments. History is checked again before transmission. These checks have
false positives and false negatives: they cannot recognize every secret, language,
obfuscation, confidential document or personal datum. Users must not paste sensitive
material. Model responses also pass shape, status, type, length and secret checks.

The centralized `ewaguard-guidance-v1` instruction requires defensive general advice,
uncertainty and IT/Security referral; it forbids invented scans, incident creation,
PDPL provisions and policy citations. Prompt rules cannot guarantee perfect
factuality or prevent every instruction disclosure. The decisive boundary is
structural: the model receives no secrets or internal access, tools are disabled,
and unexpected tool output is rejected. It cannot change authorization, call APIs,
execute commands or perform incident actions. Render responses as escaped text in
Phase 8C, never executable HTML.

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

The usage ledger contains only request/identity references, acknowledgement and
instruction versions, model/pricing metadata, token counts, status and money. Keep
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
| Employee attempts | 20 per UTC day, shared across processes/restarts |
| Active generation requests | 2 globally; 1 per conversation |
| Input | 2,000 JavaScript UTF-16 characters |
| Previous context | Last 8 messages |
| Output | 500 tokens total, including reasoning |
| General API burst limit | 60 requests/minute per employee per process |
| Provider timeout/retries | 30 seconds / 0 |

Every admitted attempt inserts a durable reservation under a shared PostgreSQL
transaction advisory lock. The reservation uses UTF-8 input bytes plus 4,096 tokens
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

Phase 8B may add an explicit allow-listed, schema-validated tool orchestrator with
server-side authorization and deterministic evidence/risk evaluation. No such tool
is enabled here. Phase 8C will connect the frontend and active privacy notice to
these endpoints. RAG and incident automation require separate phases.

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
