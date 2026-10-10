import { ManagementError, STATUSES, TRANSITIONS, NOTE_NOTICE, invalid, uuid, fields, choice, timestamp, pagination, noteInput } from './management-policy.js';

const person = { id: true, firstName: true, lastName: true };
const summarySelect = { id: true, number: true, title: true, severity: true, riskScore: true,
  type: true, detectionSource: true, status: true, createdAt: true, updatedAt: true, resolvedAt: true, closedAt: true };
const adminSelect = { ...summarySelect, reporter: { select: person }, assignee: { select: person },
  department: { select: { id: true, name: true } } };
const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
const missing = () => { throw new ManagementError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.'); };
const conflict = () => { throw new ManagementError(409, 'INCIDENT_CONFLICT', 'The incident changed. Refresh it before trying again.'); };
const summary = ({ number, ...row }) => ({ ...row, reference: `INC-${row.createdAt.getUTCFullYear()}-${String(number).padStart(6, '0')}` });
const scope = (user, admin) => admin ? {} : { reporterId: user.id };
const pageResult = (items, page, pageSize) => ({ items: items.slice(0, pageSize), page, pageSize, hasMore: items.length > pageSize });
const pageArgs = ({ page, pageSize }) => ({ skip: (page - 1) * pageSize, take: pageSize + 1, orderBy });

// Route identity is supplied by authenticated middleware, never request input.
export function createIncidentManagement(database) {
  async function find(user, admin, id, select = { id: true }) {
    const row = await database.incident.findFirst({ where: { id: uuid(id), ...scope(user, admin) }, select });
    if (!row) missing();
    return row;
  }
  async function audit(tx, user, id, action, metadata = {}) {
    await tx.auditLog.create({ data: { actorId: user.id, action, resourceType: 'INCIDENT', resourceId: id,
      outcome: 'SUCCESS', metadata, retentionUntil: new Date(Date.now() + 90 * 86400_000) } });
  }
  return {
    async list(user, admin, query) {
      const paging = pagination(query, ['status', 'severity', 'type', 'reference', 'createdFrom', 'createdTo',
        ...(admin ? ['assigneeId', 'reporterId', 'departmentId'] : [])]);
      const where = scope(user, admin);
      if (query.status !== undefined) where.status = choice(query.status, STATUSES);
      if (query.severity !== undefined) where.severity = choice(query.severity, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
      if (query.type !== undefined) where.type = choice(query.type, ['PHISHING', 'MALWARE', 'CREDENTIAL_COMPROMISE', 'DATA_EXPOSURE', 'SUSPICIOUS_ACTIVITY', 'OTHER']);
      for (const key of ['reporterId', 'departmentId']) if (admin && query[key] !== undefined) where[key] = uuid(query[key]);
      if (admin && query.assigneeId !== undefined) where.assigneeId = query.assigneeId === 'unassigned' ? null : uuid(query.assigneeId);
      if (query.createdFrom !== undefined || query.createdTo !== undefined) {
        where.createdAt = { ...(query.createdFrom !== undefined ? { gte: timestamp(query.createdFrom) } : {}),
          ...(query.createdTo !== undefined ? { lte: timestamp(query.createdTo) } : {}) };
        if (where.createdAt.gte > where.createdAt.lte) invalid();
      }
      if (query.reference !== undefined) {
        if (typeof query.reference !== 'string' || !/^INC-\d{4}-\d{6,10}$/.test(query.reference)) invalid();
        const [, year, number] = query.reference.split('-');
        if (Number(number) < 1 || Number(number) > 2147483647 || Number(year) < 2000 || Number(year) > 9998) invalid();
        where.number = Number(number);
        where.AND = [{ createdAt: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${Number(year) + 1}-01-01T00:00:00Z`) } }];
      }
      const rows = await database.incident.findMany({ where, select: admin ? adminSelect : summarySelect, ...pageArgs(paging) });
      return pageResult(rows.map(summary), paging.page, paging.pageSize);
    },
    async detail(user, admin, id) {
      const row = await find(user, admin, id, admin ? { ...adminSelect, description: true, riskRuleVersion: true } : summarySelect);
      if (admin) await audit(database, user, row.id, 'INCIDENT_VIEWED');
      return { incident: summary(row), ...(admin ? { allowedTransitions: TRANSITIONS[row.status], noteNotice: NOTE_NOTICE } : {}) };
    },
    async assignees(query) {
      const paging = pagination(query);
      const rows = await database.user.findMany({ where: { status: 'ACTIVE', deactivatedAt: null,
        role: { name: 'IT_SECURITY_ADMIN' }, mfaEnabledAt: { not: null } }, select: person, ...pageArgs(paging) });
      return pageResult(rows, paging.page, paging.pageSize);
    },
    async history(user, admin, id, query) {
      const paging = pagination(query);
      await find(user, admin, id);
      const rows = await database.incidentEvent.findMany({ where: { incidentId: id,
        ...(admin ? {} : { type: { in: ['CREATED', 'STATUS_CHANGED'] } }) },
      select: { id: true, type: true, createdAt: true, details: true, ...(admin ? { actor: { select: person } } : {}) }, ...pageArgs(paging) });
      // Never return arbitrary historical JSON, including internal resolution text.
      const items = rows.map(({ details, ...row }) => ({ ...row, details: Object.fromEntries(
        ['status', 'fromStatus', 'toStatus'].filter((key) => STATUSES.includes(details?.[key])).map((key) => [key, details[key]])),
        ...(admin && row.type === 'ASSIGNED' ? { assignment: Object.fromEntries(['previousAssigneeId', 'assigneeId']
          .filter((key) => details?.[key] === null || (typeof details?.[key] === 'string' && /^[0-9a-f-]{36}$/i.test(details[key])))
          .map((key) => [key, details[key]])) } : {}),
      }));
      return pageResult(items, paging.page, paging.pageSize);
    },
    async notes(user, admin, id, query) {
      const paging = pagination(query);
      await find(user, admin, id);
      const rows = await database.incidentComment.findMany({ where: { incidentId: id, redactedAt: null,
        ...(admin ? {} : { visibility: 'REPORTER' }) }, select: { id: true, body: true, createdAt: true,
        ...(admin ? { visibility: true, author: { select: person } } : {}) }, ...pageArgs(paging) });
      if (admin) await audit(database, user, id, 'INCIDENT_NOTES_VIEWED');
      return pageResult(rows, paging.page, paging.pageSize);
    },
    async mutate(user, id, operation, input) {
      choice(operation, ['assignment', 'status', 'notes']);
      id = uuid(id);
      let note;
      if (operation === 'notes') note = noteInput(input);
      else if (operation === 'assignment') {
        fields(input, ['assigneeId', 'expectedUpdatedAt'], ['assigneeId', 'expectedUpdatedAt']);
        if (input.assigneeId !== null) uuid(input.assigneeId);
      } else {
        fields(input, ['status', 'expectedUpdatedAt'], ['status', 'expectedUpdatedAt']);
        choice(input.status, STATUSES);
      }
      const expected = timestamp(input.expectedUpdatedAt);
      return database.$transaction(async (tx) => {
        // Serialize managers across processes. Version checks prevent lost edits and duplicate retries.
        await tx.$queryRaw`SELECT id FROM incidents WHERE id = ${id}::uuid FOR UPDATE`;
        const row = await tx.incident.findUnique({ where: { id } });
        if (!row) missing();
        if (row.updatedAt.getTime() !== expected.getTime()) conflict();
        const updatedAt = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
        let change = { updatedAt }; let details; let eventType; let noteId;
        if (operation === 'assignment') {
          const assigneeId = input.assigneeId === null ? null : uuid(input.assigneeId);
          if (assigneeId) {
            const assignee = await tx.user.findFirst({ where: { id: assigneeId, status: 'ACTIVE', deactivatedAt: null,
              mfaEnabledAt: { not: null }, role: { name: 'IT_SECURITY_ADMIN' } }, select: { id: true } });
            if (!assignee) throw new ManagementError(400, 'INVALID_ASSIGNEE', 'Select an active security administrator with MFA enabled.');
          }
          if (row.assigneeId === assigneeId) return { incident: summary(await tx.incident.findUnique({ where: { id }, select: adminSelect })) };
          change.assigneeId = assigneeId; eventType = 'ASSIGNED';
          details = { previousAssigneeId: row.assigneeId, assigneeId };
        } else if (operation === 'status') {
          if (!TRANSITIONS[row.status].includes(input.status)) throw new ManagementError(409, 'INVALID_STATUS_TRANSITION', 'This status transition is not allowed.');
          change = { ...change, status: input.status,
            resolvedAt: ['RESOLVED', 'FALSE_POSITIVE'].includes(input.status) ? updatedAt : input.status === 'CLOSED' ? row.resolvedAt : null,
            closedAt: input.status === 'CLOSED' ? updatedAt : null };
          eventType = 'STATUS_CHANGED'; details = { fromStatus: row.status, toStatus: input.status };
        } else {
          const comment = await tx.incidentComment.create({ data: { incidentId: id, authorId: user.id, ...note } });
          noteId = comment.id;
          details = { noteId, visibility: note.visibility, noticeVersion: NOTE_NOTICE.version,
            acknowledgementContext: 'INCIDENT_NOTE', acknowledgedAt: updatedAt.toISOString() };
        }
        const updated = await tx.incident.update({ where: { id }, data: change, select: adminSelect });
        if (eventType) await tx.incidentEvent.create({ data: { incidentId: id, actorId: user.id, type: eventType, details } });
        await audit(tx, user, id, operation === 'notes' ? 'INCIDENT_NOTE_ADDED' : `INCIDENT_${eventType}`, details);
        return { incident: summary(updated), ...(noteId ? { noteId } : {}) };
      });
    },
  };
}
