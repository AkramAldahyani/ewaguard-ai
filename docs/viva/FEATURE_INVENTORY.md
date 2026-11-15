# EWAGuard AI feature discovery inventory

Date: 14 November 2026. **Repository-wide discovery inventory; deep implementation assessment incomplete.**

The following table separates observed wiring from proof of end-to-end behavior. `UNCERTAIN` generally means not yet traced sufficiently, not that the feature is absent. Backend mounts are from `backend/src/app.js`; frontend routes are from `frontend/src/App.jsx`. Services/tests named below are investigation targets unless explicitly traced in the technical report.

| Feature family and discovered subfeatures | Frontend entry / backend evidence | Current assessment |
|---|---|---|
| Login, logout, current identity, MFA challenge | `pages/LoginPage.jsx`; `routes/auth.js`; `auth/*` | UNCERTAIN end-to-end; routes registered |
| Protected routes, employee/admin separation | `components/auth/ProtectedRoute.jsx`; `middleware/authenticate.js`, `authorize.js` | Route composition inspected; middleware detail pending |
| User directory, departments, setup links, account setup, account changes | `features/users/*`, `features/setup/*`; `routes/admin-users.js`, `users/*` | UNCERTAIN; admin/setup routers mounted; setup UI reachability must be traced |
| Profile | `pages/employee/WorkspacePages.jsx`, route `/profile` | UNCERTAIN; mounted |
| Employee home/security tips | `pages/HomePage.jsx`, `components/employee/*`, `data/security-tips.js` | UNCERTAIN content/data behavior |
| Assistant, conversations, messages, request recovery, approval explanations | `features/chat/*`; `routes/chat.js`, `ai/chat-service.js` | UNCERTAIN; endpoints wired |
| AI question routing and bounded tool rounds | `ai/question-routing.js`, `tool-orchestration.js`, `tool-round-budget.js` | UNCERTAIN; inspect runtime callers |
| Tool approvals, confirmation, encrypted payloads, access and result projection | `routes/tool-approvals.js`, `ai/tools/*` | UNCERTAIN; router mounted |
| Email text/headers and EML analysis | `features/email/*`; `routes/email-analysis.js`, `analyzers/email/*` | UNCERTAIN full analyzer; risk input contract traced |
| URL local, DNS/TLS and reputation analysis | `features/url/*`; `routes/url-analysis.js`, `analyzers/url/*` | UNCERTAIN full analyzer; risk input contract traced |
| File upload/static scanning and hash-only lookup | `features/file/*`; `routes/file-analysis.js`, `analyzers/file/*` | UNCERTAIN scanner operation; risk input contract traced |
| Local password checking/generation | `features/password/*` | UNCERTAIN pending privacy/randomness inspection; no password router mounted in `app.js` |
| Sensitive submission notice and acknowledgements | `features/disclaimer/*`, `shared/disclaimer.js`, `routes/disclaimers.js` | UNCERTAIN enforcement by context; optional-acknowledgement migrations discovered |
| Deterministic risk evaluation, confidence/coverage, versioning | `risk/risk-engine.js`, `risk-policy.js`, `evidence-adapters.js`, `risk-persistence.js` | VERIFIED within 13 passing local risk tests; provider/database runtime not implied |
| Automatic incident creation, deduplication, recovery | `incidents/incident-engine.js`, `escalation-policy.js`, `routes/analysis-escalations.js` | IMPLEMENTED service path; database runtime unverified |
| Explicit credential-exposure report and incident reopening | `components/ExposureReport.jsx`; `reportCredentialExposure` in incident engine | IMPLEMENTED UI/API/service path; pure score escalation VERIFIED, database writes unverified |
| Incident assistance, receipt and replay | `components/IncidentAssistance.jsx`, `IncidentReceipt.jsx`, `AnalysisReplay.jsx`; `assistance/*` | UNCERTAIN complete flow |
| Employee incident history; admin list/detail, assignment, status and notes | `features/incidents/*`; `routes/incidents.js`, `incidents/incident-management.js` | UNCERTAIN complete management path |
| Persistent notifications, unread/read state, Socket.IO | `features/notifications/*`; `notifications/*`, `routes/notifications.js` | IMPLEMENTED persistence/scope/polling/invalidation/client-recovery path traced; runtime unverified |
| PDPL and company-policy answers | `rag/pdpl-*`, `rag/company-*`, `rag/answer-presentation.js`; assistant UI | UNCERTAIN; distinguish approved corpus from general knowledge |
| Knowledge ingestion, extraction, indexing, retrieval and corpus activation | `routes/knowledge.js`, `rag/*`, `scripts/*knowledge*`, `scripts/*corpus*` | UNCERTAIN; API mounted, no knowledge page in inspected `App.jsx` |
| Training list/detail, assignments, progress, lesson blocks and admin editing | `features/training/*`; `routes/training.js`, `training/training-service.js` | UNCERTAIN full state machine |
| Course quiz/questions/scoring/attempts and admin quiz panel | `features/training/*Quiz*`; `training/course-quiz-service.js` | UNCERTAIN |
| Monthly quizzes, historical feedback, assignments, provisioning | `features/monthly-quizzes/*`; `routes/monthly-quizzes.js`, `training/monthly-*` | UNCERTAIN |
| Training corpus: phishing, safe browsing, data privacy, physical security, incident reporting, remote work, responsible AI | `training/content/*`, `training/course-provisioning.js` | Source content discovered; actual publication/database population unverified |
| Certificate list/detail/PDF and admin verification route | `features/certificates/*`; `certificates/*`, `routes/certificates.js` | UNCERTAIN eligibility and access |
| Employee community feed/composer/categories/search/moderation | `features/community/*`; `community/community-service.js`, `moderation-service.js` | UNCERTAIN complete lifecycle |
| Community images, processing, access, storage and cleanup | `community/media-*`, `image-processing.js`; `routes/community-media.js` | UNCERTAIN full security pipeline |
| Community likes, saves, own-post deletion | `CommunityEngagement.jsx`, `DeleteOwnPost.jsx`; `routes/community.js` | Additional discovered features; UNCERTAIN |
| Comments/replies and comment moderation | `CommunityComments.jsx`, `AdminCommentPanel.jsx`; `community/comment-*` | Additional discovered features; UNCERTAIN |
| Community reports and admin report handling | `CommunityReport.jsx`, `AdminReportsPanel.jsx`; `community/report-service.js` | Additional discovered features; UNCERTAIN |
| Admin dashboard, security/incident/awareness analytics | `features/dashboard/*`, `features/analytics/*`; `dashboard/*`, `analytics/*` | UNCERTAIN aggregation and runtime data |
| Incident-linked awareness | `features/incident-awareness/*`; `routes/incident-awareness.js`, `awareness/incident-awareness-service.js` | Backend mounted; no standalone `App.jsx` route; inspect embedding/import before claiming UI availability |
| Audit search/filtering and privacy retention | `features/audit/*`; `routes/audit.js`, `privacy/*`, maintenance scripts | UNCERTAIN scope/retention behavior |
| Health and role workspace probes | `/api/health`, `/api/employee/workspace`, `/api/admin/workspace` in `app.js` | IMPLEMENTED route registration; not runtime-tested |
| UI showcase and legacy analysis placeholders | `/design-system/chat`; `pages/employee/AnalysisPages.jsx` | Showcase mounted; legacy page file is not the active analyzer route in inspected `App.jsx`; do not classify live analyzers as MOCK based on this file |

## Initial inventory boundaries

The named proposal, master prompt and thesis-assessment files were not found in the repository file inventory. No Docker/Compose file appeared in the initial nonignored filename search; this is not yet proof that deployment configuration is absent from every ignored/external location. Prisma models include supporting entities beyond the original specification, such as `ToolApproval`, `AiUsage`, `RevokedSession`, `CommunityReport`, `CommunityPostLike` and `CommunityPostSave`. Model presence alone is not implementation evidence.

Existing tests use many `.integration.test.js` filenames; their names do not mean they have been run, nor that they use live infrastructure. Test setup must be inspected first. Existing documentation describes many phases but remains secondary to the current dirty working tree.
