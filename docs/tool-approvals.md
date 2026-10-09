# Phase 8B2A — Durable approvals and controlled analyzer execution

Phase 8B2 is split into two implementation subphases. **8B2A and 8B2B are implemented.**
8B2B reuses the unchanged encrypted approval state machine for Responses function
calling and adds separately budgeted model rounds and saved-result explanation.
Phase 8C UI, RAG, incident creation and chat file uploads are not included.

## Architecture

`routes/tool-approvals.js` exposes employee-only REST operations. The authenticated
middleware supplies identity; model/client user IDs are not accepted. The registry
continues to define the two supported action schemas. `tool-access.js` shares
current database role/status, conversation ownership and acknowledgement checks
with the existing read-only tool service. No arbitrary dispatch is introduced.

`approval-service.js` binds a PostgreSQL `ToolApproval` to one employee, conversation,
tool, original acknowledgement and exact validated parameters. Five pending records
per employee are permitted. A server-generated approval ID is separate from the
employee-provided idempotency `requestId`; reusing a request ID with a different
operation returns 409. Replays never renew expiry or create a second scan.

Both normal analyzer submissions and approved executions reuse the same analyzers,
Risk Engine and Incident Assistance. The persistence portion of each existing
submission service was extracted so the analysis and approval receipt can commit
in one transaction after detection completes. Detection logic is unchanged.

## REST contract

All paths below start with
`/api/tool-approvals/conversations/:conversationId/requests`.
Requests require the existing employee cookie and trusted Origin. JSON mutations
reject extra fields, unsupported tools and client-controlled authorization.

| Method/path | Payload | Result |
| --- | --- | --- |
| POST base | `{requestId, toolName, parameters}` | 201 pending approval; 200 identical replay |
| GET `/:id` | None | Sanitized approval status and, when completed, sanitized analysis result |
| GET `/:id/review` | None | Exact parameters for the owning employee's private review while pending |
| POST `/:id/decision` | `{decision: "CONFIRM"}` | Run the bound operation once; replay its saved result |
| POST `/:id/decision` | `{decision: "REJECT"}` | Reject and erase encrypted parameters; same rejection is idempotent |

`toolName` is exactly `analyze_email` or `analyze_url`.
Email parameters are `{body, headers}`; absent headers must be the empty string.
URL parameters are `{url}`. Existing strict tool validation, secret checks, byte
limits and local SSRF protection apply. URL queries/fragments remain disallowed
in this workflow; existing standalone URL analysis retains its established rules.
Confirmation accepts no replacement parameters, identity, acknowledgement, score
or approval flags. To edit an operation, reject it and prepare a new request ID.

The response `approval` contains only `id`, `toolName`, `status`, `expiresAt` and
nullable `analysisId`. Completed results use `analysis-tool-result-v1`. If source
retention has removed/expired the analysis, the receipt remains consumed and
`resultUnavailable: true` is returned. A missing or inaccessible approval is 404.
Expired confirmation is 410. Consumed, rejected or uncertain execution is 409.

The review endpoint is **human-only and must never be registered as an AI tool**.
Phase 8C must show the exact private review parameters and network/privacy effects,
then require a deliberate employee choice. A model sentence is never confirmation.
All responses use `Cache-Control: no-store`; no frontend UI was added here.

## State, concurrency and failure handling

```
PENDING -> REJECTED
PENDING -> EXPIRED
PENDING -> EXECUTING -> COMPLETED
                     -> FAILED
```

Approvals expire exactly five minutes after creation. A fixed PostgreSQL advisory
lock serializes state transitions and persistent approval admission across backend
instances. A conditional update checks PENDING, owner and unexpired time; the claim
commits before invoking the analyzer. No database transaction spans network I/O.
The service rechecks auth/session expiry, current database role/status,
conversation ownership, the original acknowledgement and exact schema immediately
before invocation. URL DNS/public-address checks and pinned TLS still run inside
the existing URL analyzer.

Both analyzer paths share per-app gates: 30 email requests/minute, 10 URL
requests/minute per employee, and four active operations per analyzer. Approvals
also enforce a persistent four-EXECUTING cap per tool and a persistent per-employee
execution rate. The existing direct-route limiters are process-local, not a new
distributed quota claim. An approval request disconnect does not release its scan
slot. General approval API requests are limited to 60/minute per employee.

Concurrent confirm/confirm and confirm/reject requests cannot both claim PENDING.
COMPLETED confirmations return the existing result; FAILED cannot be retried.
A process crash can leave EXECUTING. It remains consumed and counts against the
approval execution cap: operators must reconcile it rather than automatically
retrying a possibly performed network operation. This is **at-most-once invocation**,
not a claim of exactly-once external provider delivery. There is no recovery/admin
endpoint or automatic retry in this subphase.

After analysis, result persistence and COMPLETED receipt commit atomically. Failed
transactions cannot leave a partial analysis linked to a successful receipt.
Results remain stored if the employee disconnects or loses access before receiving
the response. Future AI explanations must operate on those saved results and must
never cause a second analysis after an explanation failure.

## Privacy and keys

Raw parameters are encrypted with AES-256-GCM and a dedicated
`TOOL_APPROVAL_ENCRYPTION_KEY`. HKDF derives separate encryption and HMAC keys.
Authenticated associated data binds identity, conversation, tool, acknowledgement,
parameter digest, approval ID and timestamps. Canonical parameters receive a keyed
digest for exact-operation idempotency without storing a guessable plaintext hash.
Changing ciphertext, bound metadata or digest causes a safe failure before analysis.

The key must be 32 random bytes encoded as 64 hex characters, distinct from JWT and
MFA keys. Missing configuration fails closed for new approvals; ordinary analyzers
and chat continue working. For local setup, run:

```powershell
node backend/scripts/configure-tool-approval-key.js
```

This initializes only an absent/empty value in the ignored local `.env`, never prints
the key, and never overwrites an existing key. Restart the backend to load it.
Production must inject the key through secret management. Key replacement makes
pending requests unreadable; wait for expiry/cleanup before rotation. Encrypted
payloads in database backups remain subject to the backup retention/key policy.

Ciphertext is cleared on claim, rejection and expiration. Startup and minute-based
cleanup clear expired pending payloads; reads/decisions also enforce expiry even
if cleanup has not run. Metadata follows the parent conversation's deletion
lifecycle. No raw email or URL is added to chat messages, audit logs, model context
or response metadata. Private review is the sole raw-parameter response.

## 8B2B handoff and explanation

The approval service itself makes zero model calls. Chat uses six fixed function
schemas and leaves the $4 budget, two concurrent turns, configured model and
no-fallback policy intact. Every follow-up counts toward the 20-request daily cap.

The message API accepts optional `analysisInput: {toolName, parameters}` separately
from employee chat `content`. Local validation and current acknowledgement checks
precede generation. Only the current request UUID (`inputReference`) and tool name
reach OpenAI. Model action schemas accept exactly that UUID, never raw email/URL
parameters. The backend binds it to this execution's private input and calls the
existing `prepare` method. Pending confirmation stops the loop immediately, without
running analysis or paying for a restatement. Five-minute expiry is unchanged.

The employee reviews through the existing human-only review route, then chooses
CONFIRM or REJECT. After COMPLETED, the optional explicit continuation is:
`POST /api/chat/conversations/:id/approvals/:approvalId/explanation` with
`{privacyNoticeVersion: "chat-privacy-v2"}`. It retrieves the saved sanitized result,
disables tools, reserves budget, and explains it once. A stable approval-derived
request ID prevents duplicate paid explanations and history on browser retries.
If no budget is available or generation fails, deterministic risk and assistance
remain in the response. The analyzer is never called by continuation.

`GET /api/chat/conversations/:id/requests/:requestId` recovers safe tool references
and pending/completed approvals, including a receipt committed before chat history
failed. Existing `GET /requests/:id` remains the source of completed approval
results. Neither recovery endpoint exposes private review parameters to OpenAI.

Use the official [Responses function-calling contract](https://developers.openai.com/api/docs/guides/function-calling)
for function-call items and matching outputs. Current limits are two **tool-call
rounds**, four invocations and at most three paid requests (initial, follow-up,
final), each capped at 500 output tokens including reasoning. This implements the
8B2B requirement and supersedes the older proposed two-total-request limit. See
[multi-round budgeting and privacy](openai-chat.md). Phase 8C remains unimplemented.

## Validation

The tool/approval suites contain 41 passing checks, including encryption binding, authorization,
review privacy, preparation/confirmation replay, role/status and acknowledgement
rechecks, expiry, rejection, cross-instance concurrency, shared route limits,
interrupted execution, atomic persistence rollback, result preservation and zero model/incident side effects.
`npm test` passed 340 backend checks. Frontend/database/vector regression command
passed 107 checks, including the SQL-managed HNSW index. Full validation results
also include successful lint, frontend build, backend syntax checks, Prisma format,
validation, client generation and migration deployment/status (all five applied).
`npm audit` reported zero vulnerabilities. `git diff --check` passed. The existing
frontend large-bundle warning remains. The local encryption key was initialized
without printing it; running backend processes must restart to load the new setting.
