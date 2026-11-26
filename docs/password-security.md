# Password security

## In short

The **Password Security** page (`/password-security`, employees only) has two tools:

1. **Strength checker**: tells you how strong a password is and how to improve it.
2. **Password generator**: creates a strong random password.

Both run **entirely in your browser**. A password typed or generated here is
never sent to the server, never stored in the database, never logged, never sent
to OpenAI and never shown to administrators. This is a strict project rule.

## Strength checker

- Uses **zxcvbn**, a well-known open-source library, locally in the browser.
- Combines zxcvbn's 0–4 score, warnings and suggestions with the company policy check.
- The score is shown as Very weak → Very strong. The "time to guess" is described as an **estimate**, never a guarantee.
- Empty input is not analyzed.

Default policy (in `frontend/src/features/password/password-policy.js`):

| Rule | Default |
| --- | --- |
| Length | 14–128 characters |
| Must include | uppercase, lowercase, number, symbol |

The policy is one object, so an approved company policy can replace it without
changing the checking code.

## Password generator

- Uses the browser's **Web Crypto API** (`crypto.getRandomValues`), which is cryptographically secure. `Math.random()` is never used.
- Avoids "modulo bias" by rejecting random bytes that would make some characters more likely than others.
- Guarantees at least one character from each selected set, then shuffles securely (Fisher–Yates).
- Leaves out look-alike characters (for example `O` and `0`).
- Length can be set from 14 to 64.
- If secure randomness is unavailable, or the options cannot meet the policy, it shows an error instead of producing a weak password.
- The AI never generates passwords.

## Privacy details

- Values live only in the page's memory. Reset, leaving the page, logging out, refreshing or closing the tab clears them.
- No `localStorage`, `sessionStorage`, network request, analytics or logging is used by this module.
- Copy to clipboard happens only when the user clicks **Copy**, with a reminder to clear the clipboard afterwards.
- The page advises not to test a password you actually use.
- Browser extensions, a compromised device or clipboard history are outside the application's control.

Note: account passwords chosen during account setup or registration are a
different flow. They are sent to the server once, hashed with bcrypt and must
score at least 3 in zxcvbn (see [user management](user-management.md)).

## Code and tests

- `frontend/src/features/password/` (policy, analyzer, generator, page)
- `npm run test:password` checks strength results, policy rules, generator length and character sets, use of Web Crypto, failure without secure randomness, and that the module makes no network, storage or console calls.
