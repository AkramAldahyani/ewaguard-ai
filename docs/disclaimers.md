# Sensitive-information notice

## In short

Before an employee shares certain content with EWAGuard AI, they must actively
accept a short warning: do not submit confidential company information,
passwords, credentials, secrets, restricted personal data, or material that must
go through another reporting channel.

The checkbox always starts **unchecked**. The server records only who accepted
which version, for what purpose and when. It never stores the content itself.

## Where it is required today

| Flow | Context | How long one acceptance is valid |
| --- | --- | --- |
| Email analysis (paste or `.eml`) | `EMAIL_ANALYSIS` | 15 minutes |
| AI assistant (chat privacy notice) | `CHAT` (with the chat notice version) | For the browser session; a new notice version needs a new acceptance |
| Community post submission | `COMMUNITY_POST` | 10 minutes |
| Community image upload | `COMMUNITY_POST`, plus `COMMUNITY_ATTACHMENT` and `FILE_ANALYSIS` records | Same as the post |
| Private analysis from chat | The analyzer's own context | 15 minutes |

URL and file analysis currently do **not** require an acknowledgement (the
related database columns were made optional). Community comments are published
directly without a separate acknowledgement; their text is screened by the server
instead (see [community](community.md)).

## How it works

1. The page shows the notice from `shared/disclaimer.js`, the single source of truth for the text and its version (currently `1.0`). Changing the wording means increasing the version.
2. The employee ticks the box and continues. The page calls:

   ```json
   POST /api/disclaimers/acknowledge
   { "context": "EMAIL_ANALYSIS" }
   ```

3. The server saves `{ user, context, version, time }` and returns an ID. If the same person accepted the same notice in the last five minutes, that record is reused instead of creating duplicates.
4. When the content is submitted, the backend looks up the acknowledgement itself and checks that it belongs to **this user**, has the **right context**, uses the **current version** and is **recent enough**. The browser's word is never trusted.

The endpoint accepts only `context`. Extra fields, a client-chosen version, or any
content are rejected. Only employees can acknowledge (administrators get 403). It
is limited to 30 requests per minute.

## Remembering acceptance in the browser

To avoid asking repeatedly during one sitting, the page remembers the
acceptance in `sessionStorage` for the current signed-in session only. It stores
just the notice version and a non-secret session marker, never content or tokens.
Logout or session expiry clears it. Each real submission still needs its own
fresh server-side acknowledgement.

## What it does not do

- It cannot prove the person read the notice, only that they actively ticked it.
- It cannot stop someone pasting secrets. Analyzers and chat add their own secret detectors and minimization, but those are not perfect either.

## Code and tests

- Text and version: `shared/disclaimer.js`
- Backend: `backend/src/disclaimers/disclaimer-service.js`, `backend/src/routes/disclaimers.js`
- Frontend: `frontend/src/features/disclaimer/`
- Tests: `npm run test:disclaimer`
