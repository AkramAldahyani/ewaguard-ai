import {
  ManagementError,
  STATUSES,
  OPEN_STATUSES,
  CLOSED_STATUSES,
  TRANSITIONS,
  NOTE_NOTICE,
  invalid,
  uuid,
  fields,
  choice,
  timestamp,
  pagination,
  noteInput,
  searchInput,
} from './management-policy.js';
import { projectIncidentDetail } from './incident-detail.js';
import { persistIncidentNotifications } from '../notifications/notification-service.js';
import { identitySelect, actorKind } from '../users/user-identity.js';

const person = { id: true, firstName: true, lastName: true };
const summarySelect = {
  id: true,
  number: true,
  title: true,
  severity: true,
  riskScore: true,
  type: true,
  detectionSource: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
};
const adminSelect = {
  ...summarySelect,
  reporterId: true,
  assigneeId: true,
  reporter: { select: identitySelect },
  assignee: { select: identitySelect },
  department: { select: { id: true, name: true } },
};
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
const missing = () => {
  throw new ManagementError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
};
const conflict = () => {
  throw new ManagementError(409, 'INCIDENT_CONFLICT', 'The incident changed. Refresh it before trying again.');
};
const summary = ({ number, ...row }) => ({
  ...row,
  reference: `INC-${row.createdAt.getUTCFullYear()}-${String(number).padStart(6, '0')}`,
});
const scope = (user, admin) => (admin ? {} : { reporterId: user.id });
const pageResult = (items, page, pageSize, total) => ({
  items: items.slice(0, pageSize),
  page,
  pageSize,
  hasMore: items.length > pageSize,
  ...(total === undefined ? {} : { total }),
});
// Only active administrators with enrolled MFA may own an incident.
const eligibleAssignee = (id) => ({
  id,
  status: 'ACTIVE',
  deactivatedAt: null,
  mfaEnabledAt: { not: null },
  role: { name: 'IT_SECURITY_ADMIN' },
});
const pageArgs = ({ page, pageSize }) => ({ skip: (page - 1) * pageSize, take: pageSize + 1, orderBy });

// Route identity is supplied by authenticated middleware, never request input.
export function createIncidentManagement(database) {
  async function find(user, admin, id, select = { id: true }) {
    const row = await database.incident.findFirst({ where: { id: uuid(id), ...scope(user, admin) }, select });
    if (!row) missing();
    return row;
  }
  async function audit(tx, user, id, action, metadata = {}) {
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action,
        resourceType: 'INCIDENT',
        resourceId: id,
        outcome: 'SUCCESS',
        metadata,
        retentionUntil: new Date(Date.now() + 90 * 86400_000),
      },
    });
  }
  return {
    async list(user, admin, query) {
      const paging = pagination(query, [
        'status',
        'severity',
        'type',
        'reference',
        'createdFrom',
        'createdTo',
        'source',
        'sort',
        'view',
        ...(admin ? ['search', 'assigneeId', 'reporterId', 'departmentId'] : []),
      ]);
      const where = { ...scope(user, admin), AND: [] };
      if (query.view !== undefined) {
        // Queue views are deterministic slices of the lifecycle, never client-side filtering.
        const view = choice(query.view, ['open', 'closed', 'all', ...(admin ? ['unassigned', 'mine'] : [])]);
        if (view === 'closed') where.AND.push({ status: { in: CLOSED_STATUSES } });
        else if (view !== 'all') where.AND.push({ status: { in: OPEN_STATUSES } });
        if (view === 'unassigned') where.AND.push({ assigneeId: null });
        if (view === 'mine') where.AND.push({ assigneeId: user.id });
      }
      if (admin && query.search !== undefined) {
        const search = searchInput(query.search);
        const contains = { contains: search, mode: 'insensitive' };
        const number = /^(?:INC-\d{4}-)?0*(\d{1,9})$/i.exec(search)?.[1];
        where.AND.push({
          OR: [
            { title: contains },
            ...(number && Number(number) > 0 ? [{ number: Number(number) }] : []),
            { reporter: { firstName: contains } },
            { reporter: { lastName: contains } },
          ],
        });
      }
      if (query.source !== undefined)
        where.detectionSource = choice(query.source, [
          'EMAIL_ANALYSIS',
          'URL_ANALYSIS',
          'FILE_ANALYSIS',
          'INCIDENT_ASSISTANCE',
          'MANUAL_REPORT',
        ]);
      const sort =
        query.sort === undefined
          ? 'created_desc'
          : choice(query.sort, ['created_desc', 'created_asc', 'updated_desc', 'severity_desc', 'priority']);
      const sorting = {
        created_desc: orderBy,
        created_asc: [{ createdAt: 'asc' }, { id: 'asc' }],
        updated_desc: [{ updatedAt: 'desc' }, { id: 'desc' }],
        severity_desc: [{ severity: 'desc' }, ...orderBy],
        // Triage order: most severe first, earlier lifecycle stage next, then the longest-waiting report.
        priority: [{ severity: 'desc' }, { status: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      };
      if (query.status !== undefined) where.status = choice(query.status, STATUSES);
      if (query.severity !== undefined) where.severity = choice(query.severity, SEVERITIES);
      if (query.type !== undefined)
        where.type = choice(query.type, [
          'PHISHING',
          'MALWARE',
          'CREDENTIAL_COMPROMISE',
          'DATA_EXPOSURE',
          'SUSPICIOUS_ACTIVITY',
          'OTHER',
        ]);
      for (const key of ['reporterId', 'departmentId'])
        if (admin && query[key] !== undefined) where[key] = uuid(query[key]);
      if (admin && query.assigneeId !== undefined)
        where.assigneeId = query.assigneeId === 'unassigned' ? null : uuid(query.assigneeId);
      if (query.createdFrom !== undefined || query.createdTo !== undefined) {
        where.createdAt = {
          ...(query.createdFrom !== undefined ? { gte: timestamp(query.createdFrom) } : {}),
          ...(query.createdTo !== undefined ? { lte: timestamp(query.createdTo) } : {}),
        };
        if (where.createdAt.gte > where.createdAt.lte) invalid();
      }
      if (query.reference !== undefined) {
        if (typeof query.reference !== 'string' || !/^INC-\d{4}-\d{6,10}$/.test(query.reference)) invalid();
        const [, year, number] = query.reference.split('-');
        if (Number(number) < 1 || Number(number) > 2147483647 || Number(year) < 2000 || Number(year) > 9998) invalid();
        where.number = Number(number);
        where.AND.push({
          createdAt: {
            gte: new Date(`${year}-01-01T00:00:00Z`),
            lt: new Date(`${Number(year) + 1}-01-01T00:00:00Z`),
          },
        });
      }
      const [rows, total] = await Promise.all([
        database.incident.findMany({
          where,
          select: admin ? adminSelect : summarySelect,
          ...pageArgs(paging),
          orderBy: sorting[sort],
        }),
        database.incident.count({ where }),
      ]);
      return pageResult(rows.map(summary), paging.page, paging.pageSize, total);
    },
    // Aggregate counts only: no titles, identities or evidence leave this endpoint.
    async summary(user, admin) {
      const own = scope(user, admin);
      const open = { ...own, status: { in: OPEN_STATUSES } };
      const [bySeverity, byStatus, unassigned, mine] = await Promise.all([
        database.incident.groupBy({ by: ['severity'], where: open, _count: { _all: true } }),
        database.incident.groupBy({ by: ['status'], where: own, _count: { _all: true } }),
        admin ? database.incident.count({ where: { ...open, assigneeId: null } }) : null,
        admin ? database.incident.count({ where: { ...open, assigneeId: user.id } }) : null,
      ]);
      const counts = (rows, key, keys) =>
        Object.fromEntries(keys.map((name) => [name, rows.find((row) => row[key] === name)?._count._all ?? 0]));
      const status = counts(byStatus, 'status', STATUSES);
      const sum = (keys) => keys.reduce((total, key) => total + status[key], 0);
      return {
        open: sum(OPEN_STATUSES),
        closed: sum(CLOSED_STATUSES),
        total: sum(STATUSES),
        status,
        openBySeverity: counts(bySeverity, 'severity', SEVERITIES),
        ...(admin ? { unassigned, mine } : {}),
      };
    },
    async detail(user, admin, id) {
      const row = await find(user, admin, id, {
        ...(admin ? { ...adminSelect, description: true } : summarySelect),
        riskRuleVersion: true,
        sourceKey: true,
        escalationMetadata: true,
        evidence: { take: 1, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { snapshot: true } },
      });
      if (admin) await audit(database, user, row.id, 'INCIDENT_VIEWED');
      const assessment = projectIncidentDetail(row, admin);
      const exposed = admin ? { ...adminSelect, description: true, riskRuleVersion: true } : summarySelect;
      const safe = Object.fromEntries(Object.keys(exposed).map((key) => [key, row[key]]));
      return {
        incident: { ...summary(safe), assessment },
        ...(admin ? { allowedTransitions: TRANSITIONS[row.status], noteNotice: NOTE_NOTICE } : {}),
      };
    },
    async assignees(query) {
      const paging = pagination(query);
      const rows = await database.user.findMany({
        where: {
          status: 'ACTIVE',
          deactivatedAt: null,
          role: { name: 'IT_SECURITY_ADMIN' },
          mfaEnabledAt: { not: null },
        },
        select: person,
        ...pageArgs(paging),
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      });
      return pageResult(rows, paging.page, paging.pageSize);
    },
    async history(user, admin, id, query) {
      const paging = pagination(query);
      id = (await find(user, admin, id)).id;
      const rows = await database.incidentEvent.findMany({
        where: {
          incidentId: id,
          ...(admin ? {} : { type: { in: ['CREATED', 'STATUS_CHANGED', 'SEVERITY_CHANGED'] } }),
        },
        select: {
          id: true,
          type: true,
          createdAt: true,
          details: true,
          ...(admin ? { actorId: true, actor: { select: identitySelect } } : {}),
        },
        ...pageArgs(paging),
      });
      // Never return arbitrary historical JSON, including internal resolution text.
      const items = rows.map(({ details, ...row }) => ({
        ...row,
        ...(admin ? { actorKind: actorKind(row.actorId, details?.source) } : {}),
        details: Object.fromEntries(
          [
            ...['status', 'fromStatus', 'toStatus'].filter((key) => STATUSES.includes(details?.[key])),
            ...['fromSeverity', 'toSeverity'].filter((key) => SEVERITIES.includes(details?.[key])),
          ].map((key) => [key, details[key]]),
        ),
        ...(details?.exposure === 'CREDENTIALS_SUBMITTED' ? { exposure: 'CREDENTIALS_SUBMITTED' } : {}),
        ...(admin && row.type === 'ASSIGNED'
          ? {
              assignment: Object.fromEntries(
                ['previousAssigneeId', 'assigneeId']
                  .filter(
                    (key) =>
                      details?.[key] === null ||
                      (typeof details?.[key] === 'string' && /^[0-9a-f-]{36}$/i.test(details[key])),
                  )
                  .map((key) => [key, details[key]]),
              ),
            }
          : {}),
      }));
      return pageResult(items, paging.page, paging.pageSize);
    },
    async notes(user, admin, id, query) {
      const paging = pagination(query);
      id = (await find(user, admin, id)).id;
      const rows = await database.incidentComment.findMany({
        where: { incidentId: id, redactedAt: null, ...(admin ? {} : { visibility: 'REPORTER' }) },
        select: {
          id: true,
          body: true,
          createdAt: true,
          ...(admin ? { visibility: true, authorId: true, author: { select: identitySelect } } : {}),
        },
        ...pageArgs(paging),
      });
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
        let change = { updatedAt };
        let details;
        let eventType;
        let noteId;
        let claimed = false;
        if (operation === 'assignment') {
          const assigneeId = input.assigneeId === null ? null : uuid(input.assigneeId);
          if (assigneeId) {
            const assignee = await tx.user.findFirst({ where: eligibleAssignee(assigneeId), select: { id: true } });
            if (!assignee)
              throw new ManagementError(
                400,
                'INVALID_ASSIGNEE',
                'Select an active security administrator with MFA enabled.',
              );
          }
          if (row.assigneeId === assigneeId)
            return { incident: summary(await tx.incident.findUnique({ where: { id }, select: adminSelect })) };
          change.assigneeId = assigneeId;
          eventType = 'ASSIGNED';
          details = { previousAssigneeId: row.assigneeId, assigneeId };
        } else if (operation === 'status') {
          if (!TRANSITIONS[row.status].includes(input.status))
            throw new ManagementError(409, 'INVALID_STATUS_TRANSITION', 'This status transition is not allowed.');
          change = {
            ...change,
            status: input.status,
            resolvedAt: ['RESOLVED', 'FALSE_POSITIVE'].includes(input.status)
              ? updatedAt
              : input.status === 'CLOSED'
                ? row.resolvedAt
                : null,
            closedAt: input.status === 'CLOSED' ? updatedAt : null,
          };
          eventType = 'STATUS_CHANGED';
          details = { fromStatus: row.status, toStatus: input.status };
          // An investigation always has an owner: starting one on an unassigned incident assigns the acting
          // administrator, provided they are themselves an eligible assignee.
          if (
            input.status === 'UNDER_INVESTIGATION' &&
            !row.assigneeId &&
            (await tx.user.findFirst({ where: eligibleAssignee(user.id), select: { id: true } }))
          ) {
            change.assigneeId = user.id;
            claimed = true;
          }
        } else {
          const comment = await tx.incidentComment.create({ data: { incidentId: id, authorId: user.id, ...note } });
          noteId = comment.id;
          details = {
            noteId,
            visibility: note.visibility,
            noticeVersion: NOTE_NOTICE.version,
            acknowledgementContext: 'INCIDENT_NOTE',
            acknowledgedAt: updatedAt.toISOString(),
          };
        }
        const updated = await tx.incident.update({ where: { id }, data: change, select: adminSelect });
        if (eventType)
          await tx.incidentEvent.create({ data: { incidentId: id, actorId: user.id, type: eventType, details } });
        if (claimed) {
          const assignment = { previousAssigneeId: null, assigneeId: user.id };
          await tx.incidentEvent.create({
            data: { incidentId: id, actorId: user.id, type: 'ASSIGNED', details: assignment },
          });
          await audit(tx, user, id, 'INCIDENT_ASSIGNED', { ...assignment, reason: 'INVESTIGATION_STARTED' });
        }
        await audit(tx, user, id, operation === 'notes' ? 'INCIDENT_NOTE_ADDED' : `INCIDENT_${eventType}`, details);
        const kind =
          operation === 'assignment'
            ? 'INCIDENT_ASSIGNED'
            : operation === 'status'
              ? 'STATUS_CHANGED'
              : note.visibility === 'REPORTER'
                ? 'EMPLOYEE_UPDATE'
                : 'INVESTIGATION_UPDATED';
        await persistIncidentNotifications(tx, { ...row, ...change }, kind, `change:${id}:${updatedAt.toISOString()}`);
        return { incident: summary(updated), ...(noteId ? { noteId } : {}) };
      });
    },
  };
}
