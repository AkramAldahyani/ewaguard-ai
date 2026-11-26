# AI tools and human approvals

## In short

The AI assistant can only use a small, fixed list of **tools** (functions). Most
of them only **read** the employee's own saved results. The two tools that would
start a new analysis never run by themselves: they create a **pending request**
that the employee must review and approve with a button. A sentence from the AI
is never treated as approval.

## The tools

| Tool | Type | What it does |
| --- | --- | --- |
| `route_question` | Routing | First step of every turn: classify the question as GENERAL, COMPANY_POLICY, PDPL, BOTH or CLARIFY |
| `get_analysis_result` | Read only | Return a minimized saved email/URL/file result |
| `get_file_analysis` | Read only | Return a saved file result (never rescans) |
| `explain_risk` | Read only | Return the saved risk and fixed reason descriptions |
| `get_security_recommendations` | Read only | Return the fixed guidance for the saved risk |
| `analyze_email` | Action (needs approval) | Propose analyzing privately submitted email text |
| `analyze_url` | Action (needs approval) | Propose analyzing a privately submitted URL |
| `search_pdpl`, `search_company_policy` | Legacy read only | Kept for compatibility; live turns use `route_question` instead |

There is **no** tool for file uploads, local paths, shell commands, SQL, web
browsing, passwords, account changes, administrator actions or incidents.

## Safety rules for every tool call

1. The tool name must be on the fixed list (no dynamic lookup).
2. Arguments must match a strict schema: only expected fields, correct types, UUIDs validated, at most 48 KiB.
3. The **whole batch** of calls is validated before anything runs.
4. Identity comes only from the signed-in session. Model-supplied user IDs, roles, scores or "confirmed" flags are rejected.
5. Every read checks again: active account, employee role, the employee owns the conversation, and the record is theirs, completed and not expired.
6. Results are small, fixed projections marked as **untrusted data**: risk level, score, reason codes, scanner statuses and fixed guidance. They never include raw content, filenames, URLs, hashes, identity data or provider messages.
7. The last model request in a turn has tools turned off.

Even if a malicious email or document says "ignore your instructions", the model
has no tool that could cause harm.

## Private analysis from chat

Email text and URLs are **never** put into chat messages or sent to OpenAI.

```text
1. Employee fills in the private Email or URL form in chat
   (sensitive-information notice accepted)
2. The browser sends the input in a separate field, analysisInput,
   alongside the chat message
3. The backend validates it and gives the model only an opaque
   inputReference (a UUID), never the content
4. The model can propose analyze_email / analyze_url with that reference
5. The backend saves an encrypted pending approval and stops the turn
6. The employee opens the review dialog, sees the exact input,
   ticks an unchecked box and clicks Approve (or Reject)
7. The analysis runs once through the normal analyzer, risk engine
   and incident engine
8. The employee can ask "Explain with AI"; only the saved result is used
```

## Approval states

```text
PENDING ──reject──► REJECTED
PENDING ──5 minutes──► EXPIRED
PENDING ──confirm──► EXECUTING ──► COMPLETED
                               └─► FAILED
```

- An approval is valid for **5 minutes**. Each employee can have at most 5 pending.
- Confirming re-checks identity, role, conversation ownership, the original acknowledgement and the exact saved input.
- A database lock ensures two clicks (or two servers) cannot both run it. The run is **at most once**: a crash during `EXECUTING` leaves it consumed for an operator to check, rather than risking a second scan.
- Results and the "completed" receipt are saved together. Asking again returns the saved result; it never rescans.
- To change the input, reject it and submit a new one.

## Encryption of pending input

- Pending email/URL input is encrypted with AES-256-GCM using `TOOL_APPROVAL_ENCRYPTION_KEY` (64 hex characters, separate from other keys). The encryption is bound to the user, conversation, tool and approval ID, so it cannot be moved to another request.
- A keyed fingerprint detects an attempt to reuse a request ID with different input (409).
- The ciphertext is erased when the request is executed, rejected or expires.
- Create the local key once with `node backend/scripts/configure-tool-approval-key.js` (it never prints or overwrites the key), then restart the backend. In production, inject it from a secret manager. Replacing the key makes current pending requests unreadable.
- Without the key, new approvals are refused; normal analyzers and chat still work.

## Limits

- Shared with the analyzer pages: 30 email and 10 URL analyses per minute per employee, 4 running per analyzer.
- Approvals also have a persistent cap of 4 running per tool and a per-employee execution rate.
- Approval API: 60 requests per minute per employee.

## API

All under `/api/tool-approvals/conversations/:conversationId/requests`, employee only:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/` | Create a pending approval `{ requestId, toolName, parameters }` |
| GET | `/:id` | Status and, when completed, the minimized result |
| GET | `/:id/review` | The exact private input, for the employee's own review only (never an AI tool) |
| POST | `/:id/decision` | `{ "decision": "CONFIRM" }` or `{ "decision": "REJECT" }` |

Responses: 404 not found or not yours, 410 expired, 409 already used, rejected or uncertain.

## Explaining a completed analysis

`POST /api/chat/conversations/:id/approvals/:approvalId/explanation` explains the
saved result once, with tools turned off. Repeat calls return the same explanation
for free. If the budget or provider is unavailable, the response still contains
the saved risk and guidance, with the explanation marked unavailable.

## Code and tests

- `backend/src/ai/tools/` (registry, validation, access, approvals, encryption, results)
- `backend/src/ai/tool-orchestration.js`, `backend/src/routes/tool-approvals.js`
- Tests: `npm run test:tools` (registry, authorization, approvals, Responses flow; external HTTP is blocked)
