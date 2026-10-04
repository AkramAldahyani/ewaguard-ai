# Phase 4B — AI chat interface

The employee-only `/assistant` route uses the existing AuthProvider, route guards
and application shell. No backend, schema, dependencies or authentication changes
were required. Administrators retain their separate workspace.

## Frontend architecture

`features/chat/AssistantPage.jsx` coordinates a reducer, composer, conversation
scroll region and new-conversation confirmation. Suggestions populate the composer
without sending. Enter sends; Shift+Enter inserts a newline. Modifier shortcuts and
IME composition do not submit. Messages are capped at 2,000 characters and 20
employee turns per preview conversation.

`chat-state.js` contains a transport-free state machine: idle, loading and error.
Sending adds a local employee message, then a 600 ms timer adds a fixed notice that
no analysis occurred. Explicit preview controls can simulate an error. Retry adds
the fixed response without duplicating the employee message. Request identifiers
reject stale results; reset/unmount cancels the timer. New conversation confirms
before clearing both messages and draft.

State exists only in the mounted page. Leaving, logging out or refreshing clears
it; there is no chat API, storage, logging or database history. This is not secure
memory erasure and does not protect against browser extensions or a compromised
device. Do not enter sensitive content.

## Reusable presentation components

- EmployeeMessage and AIMessage: escaped text; AIMessage accepts structured children.
- SecurityNotice: informational/privacy guidance.
- ToolRunningState: supplied activity label with accessible status.
- ChatError: safe error text, optional retry and dismiss callbacks.
- AnalysisResultBlock: analysisType, riskScore (0–100), severity (LOW/MEDIUM/HIGH/
  CRITICAL), string arrays for indicators/evidence/recommendedActions, evidenceNote
  and source text. Missing severity is not silently classified as LOW.
- CitationCard: sourceType, title, reference and excerpt; no invented references
  or active links.
- IncidentEscalationBanner: incidentId, severity, status and nextActions; no creation
  request. Missing confirmation is not represented as a created incident.

Integration-ready components default to preview labels. Future integrations must
validate and authorize backend data before explicitly disabling those labels.
Message/source content is plain text, not HTML or rendered Markdown.

Synthetic severity treatments and unconnected source/escalation layouts are isolated
at employee-only `/design-system/chat`. They are not added to conversations.

## Accessibility and boundaries

The composer has an explicit label, character count, keyboard instructions and
privacy description. Loading/errors use status/alert semantics. Messages use a
polite log, with a keyboard-focusable history region. Auto-scroll follows the latest
message unless the reader scrolls up; a jump-to-latest action is available.
Suggestions and retry return focus to the composer. Reset uses the existing native
dialog and restores composer focus after closing. Grids stack on smaller screens;
long message text wraps, and loading animation respects reduced motion.

Analysis buttons are disabled and no upload input exists. OpenAI, tools, risk scoring,
incidents and RAG remain unimplemented. The notice is not the Phase 5B acknowledgement
control.

## Validation

`npm run test:chat` checks reducer boundaries, retry/reset/stale events, keyboard
decisions and server-rendered component escaping/missing evidence.
`npm run test:portal` checks route rendering, safe profile fields, role boundaries,
assistant controls and showcase access. These are not browser-interaction tests.

Browser automation was unavailable: responsive appearance, actual focus/scroll,
keyboard interaction and browser console still require a manual browser pass.
