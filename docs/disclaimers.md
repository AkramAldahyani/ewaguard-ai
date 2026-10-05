# Phase 5B — Sensitive-information disclaimer

EWAGuard AI requires an explicit, context-specific acknowledgement before an
employee reaches supported content-submission flows. Phase 5B activates this gate
on the email and file analysis previews. It records awareness metadata only; the
analyzers and uploads remain unavailable.

## Authoritative definition and version

`shared/disclaimer.js` is the single source of truth for version `1.0`, concise
warning text, confirmation text, prohibited-content categories, and allowed context
values. Both the browser component and backend import it. A material wording change
must increment the version. The API never accepts a client-selected version.

The existing Prisma `DisclaimerContext` enum already covers email, URL, file, chat,
community post, and community attachment flows, so Phase 5B requires no schema or
migration. Screenshot-specific processing does not exist yet; its future phase must
choose an existing equivalent context or add a reviewed migration before use.

## API and flow

`POST /api/disclaimers/acknowledge` accepts exactly:

```json
{ "context": "EMAIL_ANALYSIS" }
```

It requires the existing authenticated `EMPLOYEE` role and trusted browser origin.
Anonymous requests receive 401 and administrators receive 403. Unknown contexts,
extra content, and client-provided versions receive 400. Successful responses expose
only acknowledgement ID, authoritative context/version, timestamp, and reuse state.

The service reuses a matching user/context/version acknowledgement created in the
previous five minutes. This limits accidental duplicate rows from repeated clicks
without permanently granting one acknowledgement across every submission context.
The endpoint is also limited to 30 requests per minute per client.

## Future submission enforcement

`verifyAcknowledgement` accepts a specific acknowledgement ID and verifies its
authenticated user, required context, current server version, and optional maximum
age. Analyzer and attachment endpoints must call this helper before accepting
protected content; frontend state alone never authorizes submission. An ID from
another user, another context, an older version, or outside a configured validity
window does not pass.

## Privacy boundary

The database row contains only UUID, user ID, context, version, and timestamp. The
endpoint rejects extra request fields and never accepts filenames, email bodies,
files, URLs, screenshots, credentials, or arbitrary text. Full audit integration is
deferred to Phase 15. Existing operational security logs record authorization denial
metadata only and never acknowledgement content.

The reusable UI checkbox starts unchecked and Continue remains disabled until an
employee selects it. A successful server response reveals the still-disabled feature
preview. Navigating away remounts the gate in its unchecked state.
