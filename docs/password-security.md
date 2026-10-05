# Phase 5A — Password security

The employee-only `/password-security` route provides local password-strength
analysis and secure password generation. It uses the existing authenticated
employee route guard. There is no password API, database model, audit event,
telemetry event, or administrator view.

## Analysis architecture

`password-policy.js` is the single policy source. Development defaults require
14–128 characters with uppercase, lowercase, number, and symbol characters.
`evaluatePolicy` accepts an alternate policy object so later approved company
policy integration can replace these values without duplicating validation logic.

`analyzePassword` runs zxcvbn locally and combines its 0–4 score, approximate
slow-hash resistance, warning, and suggestions with the deterministic policy
result. The UI maps scores to Very weak through Very strong and always describes
guessing time as an estimate rather than a guarantee. Empty input is not analyzed.

## Generation architecture

`password-generator.js` uses `crypto.getRandomValues`. It performs rejection
sampling before mapping bytes to characters, avoiding modulo bias, and uses the
same source for a Fisher–Yates shuffle. One character from each enabled set is
included before filling the remainder. Ambiguous letters and digits are omitted.
Generation fails closed if Web Crypto is unavailable, options omit a required
policy set, or the requested length is invalid. `Math.random` is never used.

The current controls expose a 14–64 character range while the policy accepts up
to 128. All four character-set options are configurable; disabling an
organization-required set produces a clear error instead of a noncompliant value.

## Privacy boundary

Analyzed and generated values live only in React component state for the mounted
page. Reset clears both values and visibility state. Route change, logout, refresh,
or tab closure destroys the mounted state. There is no automatic persistence;
localStorage and sessionStorage are not used. The module contains no fetch,
logging, analytics, error-reporting, OpenAI, or backend integration. Clipboard use
occurs only after the employee selects Copy and includes guidance to clear the
clipboard after saving the password.

The UI advises against testing a password already used for a real account. Browser
extensions, device compromise, operating-system clipboard history, and memory
forensics are outside this application boundary, so the application does not claim
secure erasure of immutable JavaScript strings.

## Tests

`npm run test:password` verifies weak/strong differentiation, policy evaluation,
policy replacement, generated length and required sets, Web Crypto use, failed
generation without secure randomness, and absence of observable network, storage,
or console side effects. It also statically rejects weak-randomness, transport,
storage, and logging APIs in the password module source.
