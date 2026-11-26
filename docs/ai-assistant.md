# AI assistant (Ask EWAGuard AI)

## In short

**Ask EWAGuard AI** (`/assistant`, employees only) is a chat assistant powered by
the OpenAI Responses API. It can:

- answer general and cybersecurity questions in simple language;
- explain an employee's **own saved** analysis results;
- answer questions about **Bahrain PDPL** and the **sample company policies**, with quoted sources (see [knowledge base](knowledge-base.md));
- start a **private** email or URL analysis that the employee must approve (see [AI tools and approvals](ai-tools-and-approvals.md)).

It **cannot** scan files, browse the web, create or change incidents, change
risk levels, grant permissions or see other employees' data.

The browser never talks to OpenAI directly. All calls go through the backend,
which holds the API key.

## How one message is handled

```text
Employee message
  → signed in? employee? owns this conversation? accepted the current privacy notice?
  → message checked for secrets (passwords, keys, tokens, codes, URLs, email blocks)
  → budget reserved in the database
  → OpenAI call (with the last 8 messages and fixed instructions)
       → the model must first call route_question:
            GENERAL / COMPANY_POLICY / PDPL / BOTH / CLARIFY
       → for policy or PDPL: backend searches approved documents
       → model writes a structured answer citing only real passages
  → answer checked (format, secrets, safety claims, citations)
  → message pair saved; actual cost recorded
```

## Privacy notice

Before the first message, the employee must read the current privacy notice
(`chat-privacy-v8-concise`) and tick an **unchecked** box. It explains that
messages and recent context are sent to OpenAI, that relevant public PDPL text and
sample policy passages may be sent, and what must never be typed in chat. The
acceptance is remembered for the browser session only; a new notice version
requires a new acceptance.

## What is sent to OpenAI

**Sent:** the new message, up to the last 8 saved messages, server-owned
instructions, the fixed tool definitions, and minimized results of tools the
backend ran (for example a saved risk level and reason codes, or retrieved
document passages).

**Never sent:** raw email bodies or headers, raw files, private URLs, names or
identity fields, password inputs, generated passwords, scanner or provider raw
data, or anything from other employees.

Calls use `store: false` and SDK logging is off. This stops OpenAI keeping
application state; it is **not** a promise that the provider keeps no data.

## Secret and safety checks

- Messages are rejected if they look like they contain passwords, private keys, API keys, bearer/JWT tokens, 6-digit codes, URL credentials, URLs with query strings, or pasted email headers. Use the private analysis forms for emails and links instead.
- The AI's answers are checked for format, secrets, false safety claims ("this is safe") and contradictions with the saved risk.
- These checks are heuristics: they reduce risk but cannot catch everything. Employees must still not paste sensitive data.
- Prompt-injection protection is **structural**: the model only has read-only, owner-filtered tools and "pending approval" proposals. Even if tricked, it has no power to change data, permissions or risk.

## Spending limits

| Control | Limit |
| --- | --- |
| Total application budget | **$4** for the lifetime of the deployment (not reset daily or monthly) |
| Paid requests per employee | 20 per UTC day (every follow-up counts) |
| Turns running at the same time | 2 overall, 1 per conversation |
| Message length | 2,000 characters |
| Context | Last 8 messages |
| Answer length | 500 output tokens per request (including reasoning) |
| Timeout / automatic retries | 30 seconds / none |
| Tool rounds per message | 2, with at most 4 tool calls and 3 paid requests |
| General API rate | 60 requests per minute per employee |

How the budget works:

1. Before each paid request, the backend **reserves** the worst-case cost in the database (under a lock, so several servers cannot overspend).
2. After the response it records the **actual** cost from the reported token usage.
3. If the outcome is uncertain (timeout, network error, missing usage), the reservation is kept and marked `UNKNOWN`, and **all new AI requests stop** until an operator checks the provider's billing and fixes the record. Nothing is released automatically.

These are application estimates. Also disable automatic recharge in the OpenAI
account, use a dedicated key and keep a small reserve of credit.

## Model and configuration

| Setting | Notes |
| --- | --- |
| `OPENAI_API_KEY` | Server only. Without it, chat sending is disabled; everything else keeps working. |
| `OPENAI_MODEL` | Default `gpt-6-luna`. Only models with reviewed prices in `MODEL_PRICING` (`backend/src/ai/chat-policy.js`) are allowed. |

Price entries have an expiry date. After it, chat refuses new requests until the
prices are reviewed again. Model access is verified with a free read-only API call
(cached for five minutes).

## Conversations and history

- Conversations are private to their owner. There is **no administrator chat API**.
- History is paged 50 at a time. Titles use dates, not message content.
- Conversations are accessible for **30 days** from creation. Physical deletion is done by the retention worker (see [privacy and retention](privacy-and-retention.md)).
- Usage records are kept even when conversations are deleted, so deleting history never "refills" the budget.

### Safe retries

Each message has a client-generated UUID `requestId`. Sending the same ID again
returns the original answer at no cost. A failed or uncertain ID returns 409 and
never triggers another paid call. To check an uncertain message, use the recovery
endpoint below.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/chat/privacy` | Current notice and limits |
| POST | `/api/chat/conversations` | Start a conversation |
| GET | `/api/chat/conversations?before=<id>` | List my conversations |
| GET | `/api/chat/conversations/:id?before=<sequence>` | Messages, newest page first |
| POST | `/api/chat/conversations/:id/messages` | Send `{ content, requestId, privacyNoticeVersion }` (optional private `analysisInput`) |
| GET | `/api/chat/conversations/:id/requests/:requestId` | Recover the status and verified results of a request |
| POST | `/api/chat/conversations/:id/approvals/:approvalId/explanation` | Ask the AI to explain a completed approved analysis |

All require an employee session. Unknown fields (roles, model, tools, ownership,
token limits...) are rejected. Missing and foreign conversations both return 404.

## How answers are displayed

- **Verified results** (risk level, score, confidence, reasons, scanner coverage, guidance) come from the backend and are shown in their own cards. The browser never calculates risk.
- AI text is rendered with a small safe Markdown subset (headings, lists, bold, code, quotes, tables) built from plain React text. Raw HTML is shown as text. Only links to a short allow-list of public reference sites are clickable; analysis URLs stay inert.
- Policy and PDPL answers show their source cards (titles, sections, pages) and required notices. Full passages are collapsed under "details".

## The chat page

- The privacy notice appears alone until accepted; then the conversation, suggestions and composer appear.
- Typing and sending a first message creates the conversation automatically.
- Enter sends, Shift+Enter adds a line; it works correctly with input methods for other languages.
- **Private analysis → Email** uploads one `.eml` (up to 1 MiB) through the normal email analyzer; findings appear without an AI call, and **Explain findings in chat** sends only the saved analysis ID.
- **Private analysis → URL** opens a separate review dialog that needs explicit approval.
- History opens in a dialog on every screen size; the layout adapts to the mobile keyboard.

## Evaluation results

- A live evaluation of 27 fixed public questions routed **27/27** to the expected category, and **26/27** passed the answer and citation checks. The one failure (a correct "not official" disclaimer wrongly rejected) was fixed and its targeted recheck passed. The full set was not repeated afterwards.
- Routing and answer checking are probabilistic. Citation checks prove the quoted text is real, not that every explanation is perfectly correct.

## Code and tests

- Backend: `backend/src/ai/` (adapter, chat service, policy, routing, orchestration), `backend/src/routes/chat.js`
- Frontend: `frontend/src/features/chat/`
- Tests (OpenAI is mocked; no cost): `npm run test:chat`, `npm run test:chat:api`, `npm run test:tools`
- Manual paid checks (never part of automated tests): `npm run openai:verify:model` (free), `npm run openai:verify:live` (one paid call), `node backend/scripts/verify-chat-routing.js --run <name>` (live routing matrix; writes a report to `.runtime/`)
