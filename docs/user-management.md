# User management

## In short

Administrators manage accounts at **Users** (`/admin/users`). They can search the
directory, view a person's profile, add employees, edit details, change status or
role, delete (soft-delete) accounts, and share sign-up invite links. Everything is
backed by real database records; nothing is mocked.

## Who can do what

- Only an `IT_SECURITY_ADMIN` with completed MFA can use these features.
- **Any change** (create, edit, status, role, delete) also requires that the administrator signed in **within the last 5 minutes**. If not, the API returns `USER_REAUTH_REQUIRED`; sign out and sign in again with MFA.
- An administrator **cannot** disable, delete or change the role of their own account.
- The last active, MFA-enrolled administrator cannot be removed or demoted, so the system can never be left without an administrator. A database lock makes this safe even if two administrators act at the same time.

## Account lifecycle

```text
INVITED (setup pending) ──setup completed──► ACTIVE ◄──► SUSPENDED
                                               │  ▲
                                               ▼  │
                                          DEACTIVATED
Any state ──delete──► DELETED (soft delete, kept for history)
```

- New employees start as **INVITED**. Even if "Active" is chosen, the account stays INVITED until the person sets a password.
- **Suspend / deactivate** blocks sign-in immediately and ends existing sessions.
- **Delete** is a soft delete: sign-in is disabled; password, MFA and setup data are erased; but the person's identity and all their incidents, analyses, training, certificates, posts and audit records are **kept**. Deleted accounts cannot be reactivated, and their email/employee ID cannot be reused.
- New accounts can only be created with the EMPLOYEE role. Promotion to administrator is a separate action, requires a fully set-up active account, ends the person's sessions and forces MFA enrollment at next sign-in. Role changes wipe old MFA material.

## Editing safely

Every change must include `expectedUpdatedAt`, copied from the latest account data.
If someone else changed the account in the meantime, the API returns **409
`USER_CONFLICT`** and the interface offers to reload. This prevents two
administrators from silently overwriting each other.

## The directory and profiles

- **Directory**: search by name, email, employee ID or exact user ID; filter by department, role and status; sort by name, created date or last login; 20 per page (max 100). Deleted accounts are hidden unless the `DELETED` status filter is chosen.
- **Summary cards** count total, active, inactive, invited, suspended, deleted and administrator accounts (independent of the filters).
- **Profile panel** (`GET /api/admin/users/:id/profile`) shows identity, status, last login, MFA/setup state, numbers of email/URL/file analyses, incident counts with the five latest, training progress, monthly quiz participation, certificates and recent sign-in events.
- The profile **never** includes password hashes, tokens, MFA secrets, chat messages, analysis contents, incident descriptions, quiz answers or audit details.

## Setting up a new employee's password

There is no email delivery. Two ways exist to let a new person set their password:

### 1. Setup link (demonstration mode only)

1. In `.env` set `NODE_ENV=development` and `DEMO_ACCOUNT_SETUP_ENABLED=true`, then restart the backend. (Production refuses to start with this enabled.)
2. As an MFA-signed-in administrator, add the user with status "Setup pending" and click **Copy Setup Link**.
3. Verify the person's identity and hand them the link directly. Open it in a separate or private browser.
4. The person chooses a strong password, then signs in normally.

How the link is protected:

- The token is 256 random bits, valid for **24 hours**, usable **once**. Only its SHA-256 hash is stored.
- It travels in the URL **fragment** (`/account-setup#token=...`), which browsers do not send to servers, and the page removes it from the address bar immediately.
- Generating a new link invalidates the old one. Changing the email, suspending, deactivating or deleting the account cancels it.
- Validation and setup share a limit of 20 attempts per 15 minutes per IP and always give the same generic "invalid link" message.
- Passwords must be 12+ characters, at most 72 bytes (bcrypt's limit) and score at least 3 ("Strong") in zxcvbn. Setup does **not** sign the person in; they sign in afterwards.

### 2. Invite links (self-registration)

From **User Management → Invite Link**, an administrator (recent MFA sign-in) can
create a shareable link. Anyone holding it can create **one EMPLOYEE account** at
`/register#token=...`.

- Settings: expiry (1 hour to 7 days), use limit (1–200), department, optional email-domain restriction. Links can be revoked.
- Only a hash of the token is stored and the link is shown once.
- Registration uses the same password rules, does not sign the person in, is rate-limited and is audited (`REGISTRATION_INVITE_CREATED`, `REGISTRATION_INVITE_REVOKED`, `USER_SELF_REGISTERED`).
- **Trade-off:** the link does not prove who the person is. Share it only with intended people and prefer short expiry, a low use limit and a domain restriction.
- Set `REGISTRATION_INVITES_ENABLED=false` to turn the feature off.

## Who did what (traceability)

- Incidents show the **reporter** (employee) and the **assignee** (investigating administrator) separately. Timeline events and notes show their own actor.
- Security analytics lists recent analyses with the owning user.
- The **Audit Logs** page (`/admin/audit`) lists log IDs, actor names and roles, actions, times, outcomes and related record IDs. Raw audit metadata is never shown. A missing actor is shown as **System** only for known automated actions; otherwise **Unknown User**.
- Names and departments shown are **current** values, not historical snapshots.

## API summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/admin/users` | Directory (filters, sorting, pages) |
| GET | `/api/admin/users/summary` | Counts |
| GET | `/api/admin/users/options` | Departments, roles, statuses for forms |
| GET | `/api/admin/users/:id` | Safe account details |
| GET | `/api/admin/users/:id/profile` | Profile summary |
| POST | `/api/admin/users` | Create employee |
| POST | `/api/admin/users/:id/update` | Edit name, email, employee ID, department |
| POST | `/api/admin/users/:id/status` | Activate, suspend, deactivate |
| POST | `/api/admin/users/:id/role` | Change role |
| POST | `/api/admin/users/:id/setup` | New setup link |
| POST | `/api/admin/users/:id/delete` | Soft delete (requires typing the employee ID to confirm) |
| GET/POST | `/api/admin/invites`, `/api/admin/invites/:id/revoke` | Invite links |

Limits: 120 reads and 30 writes per minute per administrator. All responses are `no-store`.

## Audit events

`USER_CREATED`, `USER_UPDATED`, `USER_ACTIVATED`, `USER_DEACTIVATED`,
`USER_SUSPENDED`, `USER_ROLE_CHANGED`, `USER_SETUP_ISSUED`, `USER_SETUP_COMPLETED`,
`USER_DELETION_REQUESTED`, `USER_DELETED`. Each is saved in the same transaction
as the change, so if the audit write fails, the change is cancelled too. Only
IDs, field names and status/role values are recorded, never passwords, tokens or
email addresses.

## Code

- Backend: `backend/src/users/`, `backend/src/routes/admin-users.js`, `backend/src/routes/auth.js`
- Frontend: `frontend/src/features/users/`, `frontend/src/features/setup/`

## Tests

```bash
npm run test:users       # backend API and rules
npm run test:users:ui    # User Management screens
npm run test:setup:ui    # account setup page
```

These suites run one test at a time with a 768 MB memory cap, because an earlier
test assertion once used about 10 GB of memory. They use the real database; read
[testing](testing-and-qa.md) first.
