// Uses the existing AuditLog table. Never accept request bodies or error text.
const outcomes = Object.freeze({
  LOGIN_FAILED: 'FAILURE',
  LOGIN_SUCCEEDED: 'SUCCESS',
  MFA_ENROLLMENT_STARTED: 'SUCCESS',
  MFA_CHALLENGE_STARTED: 'SUCCESS',
  MFA_ENROLLMENT_COMPLETED: 'SUCCESS',
  MFA_CHALLENGE_SUCCEEDED: 'SUCCESS',
  MFA_CHALLENGE_FAILED: 'FAILURE',
  MFA_START_FAILED: 'FAILURE',
  ADMIN_AUTHENTICATION_SUCCEEDED: 'SUCCESS',
  MFA_CANCELLED: 'SUCCESS',
  SESSION_REVOKED: 'SUCCESS',
  LOGOUT: 'SUCCESS',
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function authAudit(database, action, userId = null, { required = false } = {}) {
  if (!Object.hasOwn(outcomes, action)) throw new Error('Unsupported authentication audit event');
  const actorId = typeof userId === 'string' && uuid.test(userId) ? userId : null;
  try {
    await database.auditLog.create({
      data: {
        actorId,
        action,
        resourceType: 'AUTHENTICATION',
        resourceId: actorId,
        outcome: outcomes[action],
        metadata: {},
        retentionUntil: new Date(Date.now() + 90 * 86400000),
      },
    });
    return true;
  } catch {
    if (required) throw new Error('Required authentication audit unavailable');
    console.warn(JSON.stringify({ level: 'SECURITY', event: 'authentication_audit_unavailable', action }));
    return false;
  }
}
