# Controlled tools — Phase 8B1 through Phase 8B2B

**Current implementation:** [Phase 8B2A durable approvals and controlled execution](tool-approvals.md)
adds authenticated human approval endpoints and single-use email/URL execution.
Phase 8B2B connects those services to Responses and separately budgets every model
request. The sections marked historical below retain the completed 8B1 design;
the current 8B2 contracts supersede their deferred-action statements. The legacy
in-memory `prepareActionContract` remains a non-executable fixture; production
approval endpoints use PostgreSQL `ToolApproval` records instead.

## Current Responses execution policy (8B2B)

The official SDK adapter registers exactly the existing six tool names. The four
read-only functions retain their strict ID-only schemas and owner-filtered,
minimized projections. `analyze_email` and `analyze_url` have model-facing schemas
with **only `inputReference` (UUID)**. Their existing raw parameter schemas remain
backend-only for private submission and approval validation.

`tool-orchestration.js` validates function-call shape/IDs and the full batch's
allowlist and arguments before side effects. The existing tool service rechecks
active employee identity, conversation and record ownership on every read. It
returns no raw database objects or free-form evidence text. No paths, file scans,
incident actions, arbitrary network access or additional tool types are enabled.

The optional private `analysisInput` handoff is documented in [OpenAI chat](openai-chat.md).
Its parameters never enter provider context or chat history. An action must match
the current request reference and private tool name; it calls the existing durable
approval `prepare`, returns a structured pending confirmation and stops the loop.
Mixed batches prioritize the single pending action; reads in that batch do not run.
Multiple action proposals in one batch are rejected. Only the human decision API
can claim execution. Missing private input fails safely without a scan.

Tool outputs use matching Responses `call_id` references. Necessary response items
and encrypted reasoning are carried only in memory with `store: false`. Tool data
is evidence, never authorization or system instructions. Limits: two tool-call
rounds, four invocations, up to three model requests, 500 output tokens per request.
The last model request has tools disabled; any further requested call is rejected.
An unknown tool, invalid JSON, unauthorized ID or invalid response stops safely.

Every model request reserves and reconciles through the existing locked ledger.
Parent and follow-up rows retain charges separately; the root holds the global and
conversation slot across rounds. Completed analysis survives provider failure.
Safe references in usage metadata support recovery without repeating tools/scans.
The explicit approval explanation endpoint uses saved results with tools disabled;
no budget means deterministic risk/Incident Assistance without another paid call.

The Phase 8C frontend must display private review separately, collect explicit
confirmation and current privacy acknowledgement, preserve request IDs on retries,
and display authoritative `verifiedResults` independently of AI prose. Text output
guards are heuristic; they do not guarantee factuality. Existing approval crash
limitations (consumed EXECUTING cannot automatically retry) remain unchanged.
No frontend, RAG or incident creation work is included in 8B2B.

`npm run test:tools` now includes `tool-responses.test.js` alongside the original
registry, authorization and approval suites. The new suite uses synthetic local
fixtures and mocked SDK responses; external HTTP is forbidden. Full validation
is recorded in [OpenAI chat](openai-chat.md#phase-8b2b-validation-record-2026-10-09).

## Historical Phase 8B1 foundation (superseded availability statements)

This is an internal backend foundation. It introduces no HTTP execution endpoint,
no model-call loop, no OpenAI tool registration, no chat upload, no analysis action,
and no incident automation. The Phase 8A adapter still sends `tools: []` and
`tool_choice: none`. Existing analyzer routes and chat APIs are unchanged.

## Inspected interfaces and reuse

| Existing interface | Foundation use / execution boundary |
| --- | --- |
| `createAuthenticate` and current database user/role | Trusted backend identity comes from authenticated middleware; database role/status rechecked on every operation |
| `ownedSession` | Reuses owner, closure and expiry checks for the conversation |
| `verifyAcknowledgement` | Current disclaimer version/context/owner/15-minute validity; candidate lookup also rejects future timestamps |
| `parseEmailInput` / `EMAIL_LIMITS` | Validates pasted text locally without running detection or persistence |
| `normalizeUrl` | Reuses scheme, credentials, internal hostname/IP and obfuscated address rejection without DNS or network access |
| `submitEmailAnalysis` | Declared action target only; not called in this phase |
| `submitUrlAnalysis` / `createUrlAnalyzer` | Declared action target only; future execution must retain DNS public-address checks, pinned TLS and restricted reputation lookups |
| `submitFileAnalysis` | Not exposed: upload buffers/temp files are cleaned after analysis; there is no durable authorized upload handle |
| Prisma email/URL/file analysis delegates | Fixed, owner-filtered reads of completed, unexpired records |
| Risk persistence snapshot / final columns | Read existing score, level, confidence, version and reason codes; never run a second scoring implementation |
| `buildIncidentAssistance` | Existing pure deterministic guidance projected from validated stored risk; no incident creation |
| OpenAI adapter / usage ledger | Remain unchanged and disconnected from this foundation |

## Registry and schemas

`backend/src/ai/tools/tool-registry.js` contains six recursively immutable entries.
Each declares name, description, strict JSON schema, role, input/privacy rules,
acknowledgement context, fixed backend service, operational limits and output contract.
Names are matched against the explicit array, never dispatched through arbitrary
object properties, imports, SQL, shell commands or network destinations.

All parameters are required, flat string fields. Objects reject additional
properties. UUIDs are validated. The narrow schema validator deliberately supports
only the string/enum/UUID subset used by this registry; changing the schema language
requires corresponding validation and tests. JSON arguments are limited to 48 KiB.

| Tool | Parameters | Classification / availability |
| --- | --- | --- |
| `analyze_email` | `body`, `headers` (empty string when absent) | ACTION; validated contract preparation only; EMAIL_ANALYSIS acknowledgement |
| `analyze_url` | `url` | ACTION; validated contract preparation only; URL_ANALYSIS acknowledgement |
| `get_file_analysis` | `analysisId` | READ_ONLY; existing completed file result, never a rescan |
| `get_analysis_result` | `analyzerType`, `analysisId` | READ_ONLY; minimized result |
| `explain_risk` | `analyzerType`, `analysisId` | READ_ONLY; stored risk and fixed reason descriptions |
| `get_security_recommendations` | `analyzerType`, `analysisId` | READ_ONLY; deterministic assistance from stored risk |

`analyzerType` is exactly EMAIL, URL or FILE. `analyze_file` is intentionally not
registered: an existing analysis ID cannot authorize arbitrary file access or
reconstruct deleted content. Its supported replacement is `get_file_analysis`.
No local path, filename, buffer, URL download, password operation, shell, SQL,
account change, administrator action or incident tool exists.

Pasted email uses existing 24 KiB body / 8 KiB header byte limits and header
validation. URL length is at most 4,096 characters. Action proposals also reuse
the chat secret detector and reject URL queries/fragments. Detection is imperfect;
no automatic classifier can certify that text is free of confidential information.
Public-looking DNS names are not resolved during preparation: full DNS/rebinding
protections must run again inside the existing analyzer after future confirmation.

## Authorization and ownership

`createToolService({ database })` exposes internal `execute` and
`prepareActionContract` methods. Their trusted envelope is:

```js
{
  auth: req.auth, // supplied by createAuthenticate; NEVER from request/model JSON
  conversationId, // untrusted ID; independently owner-checked
  name,          // allowlisted
  argumentsJson  // untrusted strict JSON
}
```

This module does not authenticate a caller-supplied identity object. Future routes
must obtain `req.auth` exclusively from existing authentication middleware, apply
trusted-origin protection and route rate limits, and never spread an incoming body
over this envelope. There is no route exposing this envelope in 8B1.

Every operation checks valid unexpired auth, current database ACTIVE status,
non-deactivation and EMPLOYEE role. A role claim in the envelope is ignored.
Missing envelopes and malformed identity/expiry fields return the same safe 401.
Session expiry is rechecked after transaction admission and before releasing a
read result or pending contract, so waiting on the database cannot extend a session.
Administrators are denied, including MFA administrators. It then verifies an owned,
open, unexpired conversation. Analysis reads additionally constrain ID, owner,
COMPLETED status and expiry in the database query. Foreign and missing resources
have the same safe error. Model-supplied user IDs, final scores, roles, permission
overrides, acknowledgement IDs and confirmation flags are invalid parameters.

Operations use a bounded Prisma transaction (5 seconds), fixed PostgreSQL statement
timeout (2 seconds), connection wait (1 second), and four operation slots per service
instance. No mutation occurs inside this transaction. These are local foundation
limits, not a distributed action quota. Database/raw errors become generic
TOOL_UNAVAILABLE errors with no logging of payloads or database details.

## Human confirmation contract — execution deliberately deferred

8B1 defines and tests `tool-confirmation-v1`; implementing durable approval storage,
CSRF-protected confirmation endpoints and exactly-once action execution is reserved
for 8B2. `prepareActionContract` validates parameters, identity, conversation and a
fresh acknowledgement, then returns an immutable **contract draft**, not an approval.
Nothing is persisted and no analyzer runs. A PENDING draft does not grant authority.

The private `serverDraft` binds a server-generated UUID, employee, conversation,
tool, exact validated parameters, acknowledgement ID, creation time, five-minute
expiry, PENDING state and null confirmation time. It has `executionEnabled: false`.
`publicRequest` contains only the ID, tool, expiry, state and fixed summary. It
contains no raw parameters or employee identity. Never send `serverDraft` to the
model, log it, or treat a client-returned copy as trusted approval.

The future contract is:

1. Persist an authorized short-lived operation server-side. Protect raw parameters;
   prefer an employee-approved safe reference where possible.
2. Show the employee the exact operation/content and network/privacy implications.
   A summary alone is not informed approval. Require an active confirmation.
3. Accept only `{requestId, decision: "CONFIRM" | "REJECT"}` through a dedicated
   authenticated, CSRF-protected human endpoint, never through a registered AI tool.
4. Load the original server record; recheck user, conversation, expiry, current role,
   resource ownership, disclaimer and identical operation. Editing parameters
   invalidates approval and requires a new pending operation.
5. Atomically transition PENDING to CONFIRMED/REJECTED or EXPIRED. Reserve execution
   and consume once; retain an idempotent result. Handle crash/unknown execution
   conservatively. Model text cannot cause a state transition.
6. Reapply existing analyzer validation, SSRF/upload restrictions and quotas at
   execution time. Do not call submission services while bypassing their route-level
   authentication, acknowledgement, concurrency or provider-limit protections.

No confirmation transition exists now. Calling `execute` on either action rejects
with TOOL_EXECUTION_DEFERRED after validation/acknowledgement checks, regardless of
any separately created draft. New file analysis remains unavailable until a secure
separate upload/reference lifecycle is designed; no chat upload is added.

## Safe outputs and prompt injection

`analysis-tool-result-v1` returns an explicit UNTRUSTED_DATA envelope. It includes
analyzer type, analysis ID, stored final score/level/version/confidence, allowlisted
reason codes and fixed descriptions. Result tools add recognized indicator codes,
normalized scanner/provider statuses and deterministic assistance. Guidance is
regenerated by the existing pure assistance function; it does not reevaluate risk
or trust saved prose. Outputs are bounded to 16 KiB and recursively immutable.

Final relational columns and the saved risk snapshot must agree. Missing or
unsupported risk versions, invalid confidence, unknown/cross-analyzer reason codes,
incomplete or expired records fail closed. There is no fallback fabricated score.

Output excludes raw body/headers, filenames, file bytes, filesystem paths, URLs,
hostnames, tokens, hashes, identity fields, credentials, provider messages, database
records and saved recommendation prose. All descriptions/actions come from existing
versioned policy. Unrecognized indicators are omitted; unknown statuses become
UNAVAILABLE. No scanner is run by a result retrieval.

Treat output as evidence, not instructions. The marker alone cannot prevent model
prompt injection; projection and absent execution authority are the actual controls.
Future orchestration must preserve server-owned system instructions and serialize
results as bounded tool data, never system/developer messages. It must never grant
permissions based on model statements or tool-result text.

## Cost boundary and deferred 8B2 work

This phase makes **zero model calls** and allows **zero action executions**. It does
not change the configured model, $4 lifetime budget, two simultaneous AI requests,
20 daily attempts per employee, conservative reservations, fail-closed usage
reconciliation, output cap or no-retry policy. No billing/recharge settings change.

8B2 must define a bounded orchestration loop (proposed ceiling: two total model
requests per employee turn), reserve/check budget before **each** request, account
for all input/output/reasoning tokens and bounded tool results, and stop on quota,
timeout, unknown usage or an exhausted round limit. A second call cannot bypass the
Phase 8A ledger or trigger a model upgrade. This policy is documented, not enabled.

Also deferred: model-facing registration, approval persistence, confirmation UI/API,
action dispatch, shared action quotas and exactly-once execution. Phase 8C, RAG and
incident automation remain outside this subphase.

## Tests and verification

`npm run test:tools` covers registry/schema integrity, unknown tools, invalid/extra
arguments, secrets, SSRF spellings, arbitrary paths, authentication, roles/status,
conversation and analysis ownership, missing/expired/future/obsolete acknowledgements,
immutable exact-operation drafts, deferred execution, safe projections, provider
failure sanitization, concurrency, and no incident/usage/analysis creation.
Synthetic PostgreSQL fixtures are cleaned by their own IDs. No real employee/company
content or external provider call is used.

The 2026-10-09 review reused the existing committed 8B1 foundation and tightened
session-expiry handling. Added mocked checks for missing/malformed trusted sessions,
expiry during transaction admission/reads/acknowledgement lookup, and inconsistent
stored risk. Expanded database checks cover INVITED/deactivated accounts, role
changes after authentication, closed/expired conversations, and wrong-context
acknowledgements. No analyzer, chat adapter, dependency or migration was changed.

Validation on 2026-10-09: `npm test` passed 321 backend tests;
`node --test --test-concurrency=1 frontend/tests/*.mjs backend/tests/database.integration.js backend/tests/vector.integration.js`
passed 107 checks, including existing HNSW and database invariants. The new tool
suites contain 22 tests/subtests, including five added by this review. `npm run lint`,
`npm run build`, `npm run check:backend`, `npm run prisma:validate` and
`npm run db:status` passed; all four migrations remain applied. `npm audit`
reported zero vulnerabilities. `git diff --check` passed.
The existing frontend large-bundle warning remains. No migration or model call was
performed for this phase.
