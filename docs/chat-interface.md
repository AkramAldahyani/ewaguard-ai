# Phase 8C — Employee AI chat

The protected employee `/assistant` route now uses the existing authenticated
EWAGuard backend. It displays validated AI answers and PostgreSQL conversation
history. Only `/design-system/chat` displays synthetic message/result examples.
There is no browser OpenAI client, API key, localStorage history or second database.

## Employee workflow

1. Sign in, open Ask EWAGuard AI, read the current backend privacy notice and actively acknowledge it.
2. Start a conversation or select previous history. Suggestions populate the composer without sending. The message limit is 2,000 characters.
3. Ask cybersecurity questions or refer to an existing owned analysis ID. AI advice and verified evidence are displayed separately.
4. Use **Private analysis** for new email/URL input. The existing server-backed Sensitive Information Notice must be acknowledged first.
5. Review exact input in a separate private dialog. Tick the unchecked review box and explicitly approve, or reject. No scan runs beforehand.
6. Retrieve saved results after a timeout. **Explain with AI** explicitly requests an optional explanation; it cannot rescan.

Files stay on the existing file analyzer page. Chat cannot upload/scan files,
create incidents, browse arbitrary URLs or retrieve policy/PDPL sources.

## Actual backend contracts

`chat-api.js` uses the shared cookie-authenticated `apiRequest`. Paths start with `/api`.

| Method/path | Request or response |
| --- | --- |
| GET `/chat/privacy` | `privacyNotice`, backend limits |
| POST `/chat/conversations` | `{}` → `conversation`, `privacyNotice` |
| GET `/chat/conversations?before=<id>` | `conversations`, `nextBefore` |
| GET `/chat/conversations/:id?before=<sequence>` | conversation, chronological messages, requests, nextBefore, privacyNotice |
| POST `/chat/conversations/:id/messages` | content, UUID requestId, privacyNoticeVersion, optional separate analysisInput |
| GET `/chat/conversations/:id/requests/:requestId` | safe status/metadata, verifiedResults, optional approval/result |
| GET `/tool-approvals/conversations/:id/requests/:approvalId/review` | pending approval and private parameters for human review only |
| GET `/tool-approvals/conversations/:id/requests/:approvalId` | current approval and optional completed result/resultUnavailable |
| POST `/tool-approvals/conversations/:id/requests/:approvalId/decision` | decision: CONFIRM or REJECT |
| POST `/chat/conversations/:id/approvals/:approvalId/explanation` | privacyNoticeVersion → completed result plus explanation or UNAVAILABLE |

Message responses contain persisted messages, toolMetadata, optional verifiedResults
and pendingConfirmation. History adds only requestId, status, userSequence and
safe toolMetadata from existing root usage receipts, so approvals/results can be
rediscovered. It excludes billing amounts, private input and provider payloads.
Ownership is checked first. No migration was needed.

## State and recovery

`chat-flow.js` holds presentation state in memory. PostgreSQL remains authoritative.
History is paginated; titles use dates instead of message content. Conversations
follow the backend's 30-day retention. Abort signals and operation epochs prevent
stale responses from changing another conversation. Logout/unmount clears state;
the shared session-expiry handling remains unchanged.

Every submission gets one UUID and a synchronous busy guard. The frontend never
automatically repeats paid requests or decisions. Uncertain submissions offer GET
receipt recovery and history refresh. Pending/executing receipts refresh every 15
seconds when idle. Richer evidence is retained when a risk-only projection arrives.

Approvals expire after five minutes. Browser time disables visibly expired approval,
but fresh server status is read before confirmation. The existing backend rechecks
identity, role, ownership, acknowledgement, expiration and exact operation, with
atomic once-only execution. Rejected/expired requests require a deliberate new
operation. Completed scans remain available after AI failure, with deterministic
risk and Incident Assistance. Explanation recovery never rescans.

## Privacy, evidence and budget

Private email bodies/headers and URLs travel only in analysisInput, never chat
content. The model receives an opaque reference. Private input lives transiently
in the dialog/request and encrypted backend approval, not chat history or browser
storage. Review parameters are discarded on close. Backend validation still rejects
secrets, credentials and unsupported URL query/fragment content.

ChatEvidence renders stored central risk level/score, confidence, reasons, indicators,
scanner/provider coverage and existing Incident Assistance. React does not calculate
risk. Missing/invalid risk stays unavailable. Messages and suspicious URLs render
as escaped text without HTML/Markdown execution or automatic links.

The $4 application budget, daily limits, concurrency and per-round reservation/
reconciliation remain unchanged: two tool rounds, four invocations, at most three
requests per message and 500 output tokens per request. No automatic retry/model
switch. Safe messages explain budget/daily/rate limits, timeouts, unavailable models
and tool limits. No remaining balance is invented. Application-side accounting
does not guarantee the external prepaid balance cannot be exceeded.

## Accessibility and responsive behavior

Desktop conversation navigation becomes a history dialog on smaller screens.
Long text wraps, cards stack and the composer sits below the scroll region. Native
dialogs provide focus containment and Escape behavior. Controls have labels and
visible focus, semantic articles, polite status announcements, alert errors and
non-color risk labels. Enter sends, Shift+Enter inserts a newline, and IME composition
does not submit. Reduced-motion styles are preserved. Mobile History has an explicit
accessible name. No fake streaming or scanner progress is shown.

## Validation and limitations

`npm run test:chat` runs synthetic state/API/render tests. The Responses integration
suite also exercises the production frontend flow/client against real Express,
login cookies, PostgreSQL and approvals with mocked SDK responses: acknowledgement,
history, private handoff, approval/rejection, results, explanation, recovery and logout.
All routine tests make zero paid calls.

Browser automation was unavailable: Edge and the in-app browser both returned
unavailable. Mobile/tablet/desktop appearance, actual focus/scroll and browser
console still require a manual browser pass. No new live OpenAI call was made for
Phase 8C; live function-calling compatibility remains unverified here to preserve credit.

Non-streaming responses expose no intermediate provider tool activity. History
returns at most 50 receipts per message page; very old failed requests without
messages may need their retained request ID for API recovery. Browser memory is
not securely erased. AI factuality validation is heuristic. The existing large
frontend bundle warning remains. RAG and incident creation remain out of scope.
