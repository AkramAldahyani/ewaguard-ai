# EWAGuard AI investigation checkpoint

Investigation date: 14 November 2026. **IN PROGRESS — not a completed whole-application audit.**

## Evidence rules

- Current working-tree source is the authority, including pre-existing uncommitted edits.
- IMPLEMENTED means a traced execution path; VERIFIED requires actual execution, with its scope stated.
- PARTIAL means a demonstrated implementation gap; MOCK means simulated functionality; PLANNED means requirements without implementation; UNCERTAIN means investigation has not established the answer.
- Discovery of a filename, route, database model or test does not establish complete implementation.
- Do not read real `.env` values or reproduce personal information, credentials or confidential policy content.
- Only documentation in `docs/viva/` may be created. No application fixes, dependency changes, database writes, migrations, paid requests or external scans.

## Coverage and next actions

- [x] Read the supplied request and repository instructions.
- [x] Inventory tracked/nonignored repository files; note existing dirty working tree.
- [x] Inspect package manifests, application router registration and frontend route composition.
- [x] Search for named proposal/master-prompt/assessment DOCX files within the repository. None of the three named files appeared; company-policy DOCX files are different documents.
- [x] Discover route modules, Prisma model names, existing documentation topics, tests and additional feature families.
- [x] Create feature inventory before writing narrative reports.
- [x] Deep-read deterministic risk engine, policy, evidence adapters, persistence and incident creation/exposure services.
- [ ] Finish complete relevant-repository inspection before calling any report definitive.
- [ ] Authentication/MFA/user management: trace UI, API, token/session handling, enrollment/recovery and all ownership checks.
- [ ] AI: trace message persistence, routing, OpenAI requests, complete registry, approval state machine and output validation.
- [ ] Email: fully inspect parser, privacy, indicators, submission and uploaded-message boundaries.
- [ ] URL: fully inspect normalization, DNS/TLS, public-IP checks, provider request construction and privacy.
- [ ] File/hash: inspect signatures, containers, scanner execution, limits, cleanup and provider disclosure.
- [ ] Password: inspect local page, scoring, policy, randomness and privacy tests.
- [x] Trace URL UI/API/persistence to risk, automatic incident/exposure transaction and notification transport; inspect core schema constraints and two supporting migrations.
- [x] Run the inspected local risk-engine test file: 13 passed, zero failed/skipped. Database/socket/browser integration remains unverified.
- [ ] Incident management/assistance: all transitions, notes, assignments, visibility, replay and retry behavior.
- [ ] RAG: ingestion/extraction/chunking/embedding/retrieval/approval/grounding/citations; distinguish scripts from UI.
- [ ] Training/course quiz/monthly quiz/certificate: all state transitions, eligibility, scoring, publication and assignment rules.
- [ ] Community: posts, images, comments/replies, moderation, reports, likes, saves, deletion and media retention.
- [ ] Dashboard/analytics/audit/profile/disclaimer/retention: data sources, filters, aggregation and permissions.
- [ ] Every Prisma model and migration: fields, constraints, relations, lifecycle; produce complete ERD.
- [ ] Every registered API endpoint: expand dynamic route loops; document parameters, response and service/database trace.
- [ ] Deployment/configuration: inspect hidden/ignored deployment candidates safely; extract variable names only; identify runtime prerequisites.
- [ ] Read relevant existing documentation and reconcile claims against current source.
- [ ] Inspect safe tests before running; preserve command output and accurately distinguish fixtures from real integrations.
- [ ] Complete all 20 end-to-end scenarios and 10 implementation-based diagrams.
- [ ] Create final study guide, 100+ answered questions, demo guide, quick revision and traceability matrix.
- [ ] Final source-reference, consistency, secret-disclosure and documentation-only change checks.

## Resume instructions

Read this checklist, `FEATURE_INVENTORY.md`, and the partial technical report first. Preserve completed explanations, check whether referenced source changed, then continue unchecked items. Do not infer missing behavior from models or earlier design documents. Record additional actual test runs separately. Do not mark the six requested deliverables complete until their substantive requirements are met.

## Saved checkpoint contents

- `EWAGUARD_FULL_TECHNICAL_REPORT.md`: partial report with overview, traced subsystem architecture, deep risk/scoring examples, automatic incidents, explicit exposure, notifications, subsystem API/ERD and verification limitations.
- `RISK_POLICY_TABLES.md`: all indicator mappings and weights plus caps/thresholds/limits extracted from the actual policy module.
- `FEATURE_INVENTORY.md`: repository-wide discovery map; update UNCERTAIN statuses only when a path has been sufficiently traced.
- `VALIDATION_LOG.md`: actual test command/result and checks performed for this documentation checkpoint.

Remaining requested deliverables are not yet created: `EWAGUARD_VIVA_STUDY_GUIDE.md`, `EWAGUARD_100_VIVA_QUESTIONS.md`, `EWAGUARD_DEMONSTRATION_GUIDE.md`, `EWAGUARD_QUICK_REVISION.md`, `EWAGUARD_REQUIREMENTS_TRACEABILITY.md`.

## Specific follow-up findings to investigate

- App CORS allowed methods list omits PUT/DELETE while community declares those methods; inspect deployment origins and client behavior before concluding impact.
- URL submission has no active disclaimer gate in the inspected page/route and acknowledgement is nullable; compare all disclaimer contexts with AGENTS.md requirements, without silently fixing them.
- Incident creation does not populate model fields `aiSummary`/`mitreTechniqueIds`; inspect other writers before declaring these whole-application features absent.
- AccountSetupPage and IncidentAwarenessPage are not standalone routes in inspected App.jsx; trace other imports/embeddings before declaring them unreachable.
- Notification receipts use “alerted” language; distinguish eligible-recipient persistence, socket delivery, unread state and human response.
- Legacy AnalysisPages.jsx contains disabled placeholders but is not the active analyzer route; do not confuse it with current implementation.
- Reference DOCX files were not found inside the repository. Do not invent their requirements or university marks.
- Server startup triggers cleanup/retention workers. Do not start it as a supposedly read-only validation action.
