# EWAGuard AI documentation

These guides explain how EWAGuard AI works, in plain language. Each guide covers
one part of the system: what it does, how it works step by step, the rules it
follows, where the code lives and how to test it.

## The one idea to remember

> **Security tools detect. The risk engine evaluates. AI explains and coordinates.**

The AI never decides on its own whether something is dangerous. Real security
checks collect evidence, a fixed scoring program turns that evidence into a risk
level, and the AI only explains the result in simple words.

## Suggested reading order

| # | Guide | What you will learn |
| --- | --- | --- |
| 1 | [Architecture](architecture.md) | The big picture: parts of the system and how a request flows through them |
| 2 | [Database](database.md) | What data is stored, how tables relate and what the database itself enforces |
| 3 | [Sign-in and access control](authentication-and-access.md) | Login, sessions, roles and administrator MFA |
| 4 | [User management](user-management.md) | How administrators create, edit, suspend and invite accounts |
| 5 | [Portals and dashboard](portals-and-dashboard.md) | The employee pages and the administrator dashboard |
| 6 | [Sensitive-information notice](disclaimers.md) | The warning employees must accept before sharing content |
| 7 | [Password security](password-security.md) | The local password checker and generator |
| 8 | [Email analyzer](email-analyzer.md) | How suspicious emails are checked |
| 9 | [URL analyzer](url-analyzer.md) | How suspicious links are checked without visiting them |
| 10 | [File analyzer](file-analyzer.md) | How uploaded files and SHA-256 hashes are checked |
| 11 | [Risk engine and guidance](risk-engine.md) | How evidence becomes a LOW / MEDIUM / HIGH / CRITICAL score and advice |
| 12 | [Incidents](incidents.md) | Automatic incident creation and how administrators investigate |
| 13 | [Notifications](notifications.md) | The notification bell and real-time updates |
| 14 | [AI assistant](ai-assistant.md) | The chat assistant, its privacy rules and its spending limits |
| 15 | [AI tools and approvals](ai-tools-and-approvals.md) | What the AI may call and how employees approve analyses |
| 16 | [Knowledge base (RAG)](knowledge-base.md) | How Bahrain PDPL and policy documents are searched and cited |
| 17 | [Training and quizzes](training-and-quizzes.md) | Courses, course quizzes, monthly quizzes and certificates |
| 18 | [Training courses](training-courses.md) | What the seven ready-made courses teach |
| 19 | [Monthly quiz answer key](monthly-cybersecurity-quizzes-2026-2027.md) | The twelve monthly quizzes (administrators only) |
| 20 | [Security community](community.md) | Posts, moderation, comments, images and reports |
| 21 | [Analytics](analytics.md) | Security and awareness statistics for administrators |
| 22 | [Privacy, retention and audit](privacy-and-retention.md) | What is kept, for how long, and what is logged |
| 23 | [Testing and QA](testing-and-qa.md) | How to run the tests safely and the manual browser checklist |

## Glossary

| Term | Meaning |
| --- | --- |
| **API** | The set of web addresses (endpoints) the frontend calls to read or change data. |
| **Audit log** | A permanent record of important actions, such as "admin X changed incident Y". |
| **bcrypt** | A slow, one-way method for storing passwords so the real password cannot be recovered. |
| **Cookie session** | After login the server gives the browser a cookie. JavaScript cannot read it; the browser sends it automatically. |
| **CSRF / trusted origin** | Protection that rejects requests coming from other websites. |
| **Embedding** | A list of numbers that represents the meaning of a piece of text, used to find similar text. |
| **Idempotent** | Sending the same request twice has the same effect as sending it once. Safe to retry. |
| **Incident** | A security case recorded for the security team to investigate. |
| **JWT** | A signed token that proves who is logged in. It is kept inside the session cookie. |
| **MFA / TOTP** | Multi-factor authentication. Administrators enter a 6-digit code from an authenticator app. |
| **pgvector** | A PostgreSQL extension that stores embeddings and finds similar ones. |
| **Prisma** | The library the backend uses to talk to PostgreSQL. |
| **RAG** | Retrieval-Augmented Generation: search approved documents first, then let the AI answer using only what was found. |
| **RBAC** | Role-based access control. What you can do depends on your role (EMPLOYEE or IT_SECURITY_ADMIN). |
| **Risk engine** | Fixed program code that turns evidence into a score from 0 to 100 and a level. |
| **SHA-256** | A fingerprint of a file. The same file always gives the same 64-character value. |
| **Socket.IO** | A live connection between browser and server used to push "something changed" signals. |
| **SSRF** | An attack where the server is tricked into contacting internal systems. The URL analyzer blocks it. |
| **YARA / ClamAV** | Local malware-scanning tools. ClamAV matches known malware; YARA matches suspicious patterns. |

## Other references

- The project rules for developers and coding agents are in [`AGENTS.md`](../AGENTS.md).
- The project overview, setup and screenshots are in the main [`README.md`](../README.md).
- The YARA rule set is described in [`backend/security/yara/README.md`](../backend/security/yara/README.md).
