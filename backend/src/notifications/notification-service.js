import { ManagementError, fields, uuid, invalid } from '../incidents/management-policy.js';

const messages = Object.freeze({
  INCIDENT_CREATED: ['New incident', 'A new incident requires security review.'],
  INCIDENT_ASSIGNED: ['Incident assigned', 'An incident has been assigned to you.'],
  STATUS_CHANGED: ['Incident status changed', 'An incident status has changed.'],
  EMPLOYEE_UPDATE: ['Security team update', 'A security team update is available for your incident.'],
  INVESTIGATION_UPDATED: ['Investigation updated', 'An incident investigation has been updated.'],
});
const admin = 'IT_SECURITY_ADMIN';

// Called only inside the incident transaction. No socket or external I/O here.
export async function persistIncidentNotifications(tx, incident, kind, eventKey) {
  if (!Object.hasOwn(messages, kind)) throw new Error('Unsupported notification event');
  const expiresAt = new Date(Date.now() + 90 * 86400_000);
  async function insert(recipientId, audience, notificationKind = kind) {
    const [title, message] = messages[notificationKind];
    await tx.notification.createMany({ data: [{ recipientId, audience, incidentId: incident.id,
      eventKey, kind: notificationKind, severity: incident.severity,
      type: notificationKind === 'INCIDENT_CREATED' ? 'INCIDENT_ALERT' : 'INCIDENT_UPDATE',
      title, message, expiresAt }], skipDuplicates: true });
  }
  if (kind === 'INCIDENT_ASSIGNED') {
    if (incident.assigneeId) await insert(incident.assigneeId, admin);
  }
  if (['STATUS_CHANGED', 'EMPLOYEE_UPDATE'].includes(kind)) {
    const owner = await tx.user.findUnique({ where: { id: incident.reporterId }, select: { role: { select: { name: true } } } });
    if (owner?.role.name === 'EMPLOYEE') await insert(incident.reporterId, 'EMPLOYEE');
  }
  // Read administrator recipients in bounded batches, including offline accounts.
  let cursor;
  for (;;) {
    const recipients = await tx.user.findMany({ where: { status: 'ACTIVE', deactivatedAt: null,
      role: { name: admin }, mfaEnabledAt: { not: null } }, select: { id: true }, orderBy: { id: 'asc' },
    take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    for (const recipient of recipients) await insert(recipient.id, admin,
      ['EMPLOYEE_UPDATE', 'INCIDENT_ASSIGNED'].includes(kind) ? 'INVESTIGATION_UPDATED' : kind);
    if (recipients.length < 200) break;
    cursor = recipients.at(-1).id;
  }
}

export function notificationScope(user) {
  return { recipientId: user.id, audience: user.role, kind: { in: user.role === 'EMPLOYEE' ? ['STATUS_CHANGED', 'EMPLOYEE_UPDATE'] : Object.keys(messages) },
    expiresAt: { gt: new Date() }, incident: user.role === 'EMPLOYEE' ? { reporterId: user.id } : { isNot: null } };
}
const select = { id: true, kind: true, severity: true, readAt: true, createdAt: true,
  incident: { select: { id: true, number: true, createdAt: true } } };
function project(row) {
  const [title, message] = messages[row.kind];
  return { id: row.id, kind: row.kind, title, message, severity: row.severity,
    urgent: row.severity === 'CRITICAL', readAt: row.readAt, createdAt: row.createdAt,
    incidentId: row.incident.id,
    reference: `INC-${row.incident.createdAt.getUTCFullYear()}-${String(row.incident.number).padStart(6, '0')}` };
}
export function createNotificationService(database) {
  return {
    async list(user, query) {
      fields(query, ['limit', 'before', 'unread']);
      const limit = query.limit === undefined ? 20 : Number(query.limit);
      if ((query.limit !== undefined && (typeof query.limit !== 'string' || !/^\d{1,3}$/.test(query.limit))) || !Number.isInteger(limit) || limit < 1 || limit > 100) invalid();
      if (query.unread !== undefined && !['true', 'false'].includes(query.unread)) invalid();
      const where = notificationScope(user);
      if (query.unread === 'true') where.readAt = null;
      if (query.before !== undefined) {
        if (typeof query.before !== 'string' || query.before.length > 200) invalid();
        let cursor;
        try { cursor = JSON.parse(Buffer.from(query.before, 'base64url').toString()); } catch { invalid(); }
        fields(cursor, ['time', 'id'], ['time', 'id']); uuid(cursor.id);
        if (typeof cursor.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.time) || !Number.isFinite(Date.parse(cursor.time))) invalid();
        const time = new Date(cursor.time);
        where.OR = [{ createdAt: { lt: time } }, { createdAt: time, id: { lt: cursor.id } }];
      }
      const rows = await database.notification.findMany({ where, select, take: limit + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      const items = rows.slice(0, limit); const last = items.at(-1);
      return { items: items.map(project), nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ time: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null };
    },
    async unread(user) {
      return { unreadCount: await database.notification.count({ where: { ...notificationScope(user), readAt: null } }) };
    },
    async markRead(user, id) {
      id = uuid(id);
      return database.$transaction(async (tx) => {
        const where = { ...notificationScope(user), id };
        if (!await tx.notification.findFirst({ where, select: { id: true } })) throw new ManagementError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
        const changed = await tx.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
        if (changed.count) await tx.auditLog.create({ data: { actorId: user.id, action: 'NOTIFICATION_READ',
          resourceType: 'NOTIFICATION', resourceId: id, outcome: 'SUCCESS', metadata: {}, retentionUntil: new Date(Date.now() + 90 * 86400_000) } });
        return { notification: project(await tx.notification.findFirst({ where, select })) };
      });
    },
  };
}
