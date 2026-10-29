# Administrator user traceability

Incident lists/details use the existing reporter relationship for the associated
employee and a separate assignee relationship for the investigating administrator.
Timeline events and investigation notes identify their actor/author independently.
The account's current department is displayed when available, falling back to the
incident's recorded department.

Security Analytics joins the bounded recent analysis list to the existing userId
on Email, URL and File records. All four classifications retain ownership without
requiring an incident. Aggregate charts contain no user identities. Direct routes
derive identity from req.user; approved assistant tools use authenticated approval
ownership. Client/model identity fields cannot override these relationships.

The read-only /api/admin/audit endpoint and /admin/audit page expose paginated log
IDs, actor IDs, current account names/roles, actions, timestamps, outcomes and
related resource IDs. Raw audit metadata is not returned. Actor identity is never
inferred from the affected resource. Only existing, recognized automated-system
markers label a null actor as System; other missing actors are Unknown User.

All of these administrator endpoints retain server-side authentication, MFA and
role checks. Employee incident views remain owner-scoped and do not receive the
additional administrator identity projections.

No schema or retention changes are needed. Existing restrictive relationships
prevent deleting accounts while analysis/incident records reference them;
deactivated accounts remain identifiable. AuditLog uses SetNull on account
deletion, preserving the log but not a recoverable deleted actor ID. Such records
remain Unknown User. Names, roles and account departments are current values, not
historical snapshots. Existing employee identifiers are shown only when present;
the canonical User ID is the stored UUID. No User Details route exists in this
checkout, so identities do not link to a fabricated destination.
