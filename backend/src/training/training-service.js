import { courseInput, expected, fail, fields, identifier, pageInput, searchText, topics } from './training-policy.js';

const person = { id: true, firstName: true, lastName: true };
const summary = { id: true, title: true, description: true, topic: true, version: true, estimatedMinutes: true,
  status: true, requiresQuiz: true, createdAt: true, updatedAt: true, publishedAt: true };
const progressSelect = { status: true, progressPercent: true, completedSectionKeys: true, startedAt: true,
  lastActivityAt: true, materialCompletedAt: true, completedAt: true };
const assignmentSelect = { id: true, createdAt: true, dueAt: true, revokedAt: true, progress: { select: progressSelect } };
const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
const missing = () => fail('Training record not found.', 404, 'TRAINING_NOT_FOUND');
const conflict = (message) => fail(message, 409, 'TRAINING_CONFLICT');
const eligible = { status: 'ACTIVE', deactivatedAt: null, role: { name: 'EMPLOYEE' } };
const page = (items, paging) => ({ items: items.slice(0, paging.pageSize), page: paging.page, pageSize: paging.pageSize, hasMore: items.length > paging.pageSize });
const args = (paging) => ({ skip: paging.skip, take: paging.pageSize + 1, orderBy });
async function audit(tx, user, id, action, metadata = {}) {
  await tx.auditLog.create({ data: { actorId: user.id, action, resourceType: 'TRAINING', resourceId: id,
    outcome: 'SUCCESS', metadata, retentionUntil: new Date(Date.now() + 90 * 86400000) } });
}
async function lockProgram(tx, id) {
  await tx.$queryRaw`SELECT id FROM training_programs WHERE id = ${identifier(id)}::uuid FOR UPDATE`;
  const row = await tx.trainingProgram.findUnique({ where: { id } });
  if (!row) missing();
  return row;
}
function filters(query) {
  const where = {};
  if (query.status !== undefined) {
    if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(query.status)) fail();
    where.status = query.status;
  }
  if (query.topic !== undefined) { if (!topics.includes(query.topic)) fail(); where.topic = query.topic; }
  const search = searchText(query.search);
  if (search) where.OR = ['title', 'description'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } }));
  return where;
}
export function createTrainingService(database) {
  return {
    async programs(query) {
      const paging = pageInput(query, ['status', 'topic', 'search', 'sort']);
      if (query.sort !== undefined && !['created_desc', 'title_asc'].includes(query.sort)) fail();
      const rows = await database.trainingProgram.findMany({ where: filters(query), select: summary, ...args(paging),
        ...(query.sort === 'title_asc' ? { orderBy: [{ title: 'asc' }, { id: 'asc' }] } : {}) });
      return page(rows, paging);
    },
    async detail(id) {
      const program = await database.trainingProgram.findUnique({ where: { id: identifier(id) }, select: { ...summary,
        learningObjectives: true, content: true, reviewedAt: true, createdBy: { select: person }, reviewedBy: { select: person } } });
      if (!program) missing();
      return { program };
    },
    async create(user, body) {
      const data = courseInput(body);
      return database.$transaction(async (tx) => {
        const program = await tx.trainingProgram.create({ data: { ...data, createdById: user.id, origin: 'HUMAN' }, select: summary });
        await audit(tx, user, program.id, 'TRAINING_CREATED');
        return { program };
      });
    },
    async change(user, id, operation, body) {
      const data = operation === 'edit' ? courseInput(body, true) : null;
      if (!data) fields(body, ['expectedUpdatedAt'], ['expectedUpdatedAt']);
      return database.$transaction(async (tx) => {
        const current = await lockProgram(tx, id);
        expected(body, current);
        if (current.status === 'ARCHIVED' || (operation !== 'archive' && current.status !== 'DRAFT')) conflict('Only draft programs can be edited, reviewed or published.');
        const update = { updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) };
        if (operation === 'edit') Object.assign(update, data, { version: current.version + 1, reviewedAt: null, reviewedById: null });
        else if (operation === 'review') {
          courseInput(Object.fromEntries(['title', 'description', 'topic', 'learningObjectives', 'estimatedMinutes', 'content', 'requiresQuiz'].map((key) => [key, current[key]])));
          Object.assign(update, { reviewedAt: new Date(), reviewedById: user.id });
        } else if (operation === 'publish') {
          if (!current.reviewedAt || !current.reviewedById) conflict('An administrator must review the current draft before publishing.');
          Object.assign(update, { status: 'PUBLISHED', publishedAt: new Date() });
        } else if (operation === 'archive') update.status = 'ARCHIVED';
        else fail();
        const program = await tx.trainingProgram.update({ where: { id: current.id }, data: update, select: summary });
        await audit(tx, user, current.id, `TRAINING_${operation.toUpperCase()}`, { version: program.version });
        return { program };
      });
    },
    async employees(query) {
      const paging = pageInput(query, ['search']); const search = searchText(query.search);
      const rows = await database.user.findMany({ where: { ...eligible, ...(search ? { OR: ['firstName', 'lastName', 'employeeIdentifier'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } })) } : {}) },
        select: { ...person, employeeIdentifier: true }, ...args(paging) });
      return page(rows, paging);
    },
    async assign(user, id, body) {
      fields(body, ['employeeId'], ['employeeId']); const employeeId = identifier(body.employeeId);
      return database.$transaction(async (tx) => {
        const program = await lockProgram(tx, id);
        if (program.status !== 'PUBLISHED') conflict('Only published programs can be assigned.');
        if (!await tx.user.findFirst({ where: { id: employeeId, ...eligible }, select: { id: true } })) fail('Select an active employee.');
        const previous = await tx.trainingAssignment.findUnique({ where: { trainingId_employeeId: { trainingId: program.id, employeeId } }, select: assignmentSelect });
        if (previous) {
          if (previous.revokedAt) conflict('This historical assignment was revoked.');
          return { assignment: previous, alreadyAssigned: true };
        }
        const assignment = await tx.trainingAssignment.create({ data: { trainingId: program.id, employeeId, assignedById: user.id, progress: { create: {} } }, select: assignmentSelect });
        await audit(tx, user, program.id, 'TRAINING_ASSIGNED', { assignmentId: assignment.id, employeeId });
        return { assignment, alreadyAssigned: false };
      });
    },
    async assignments(id, query) {
      const paging = pageInput(query, ['status']); identifier(id);
      if (!await database.trainingProgram.findUnique({ where: { id }, select: { id: true } })) missing();
      if (query.status !== undefined && !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(query.status)) fail();
      const rows = await database.trainingAssignment.findMany({ where: { trainingId: id, ...(query.status ? { progress: { status: query.status } } : {}) },
        select: { ...assignmentSelect, employee: { select: person } }, ...args(paging) });
      return page(rows, paging);
    },
    async mine(user, query) {
      const paging = pageInput(query, ['status']);
      if (query.status !== undefined && !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(query.status)) fail();
      const rows = await database.trainingAssignment.findMany({ where: { employeeId: user.id, revokedAt: null,
        training: { status: { in: ['PUBLISHED', 'ARCHIVED'] } }, ...(query.status ? { progress: { status: query.status } } : {}) },
      select: { ...assignmentSelect, training: { select: summary } }, ...args(paging) });
      return page(rows, paging);
    },
    async assigned(user, id) {
      const assignment = await database.trainingAssignment.findFirst({ where: { id: identifier(id), employeeId: user.id, revokedAt: null, training: { status: { in: ['PUBLISHED', 'ARCHIVED'] } } },
        select: { ...assignmentSelect, training: { select: { ...summary, learningObjectives: true, content: true } } } });
      if (!assignment) missing();
      const available = assignment.training.status === 'PUBLISHED';
      if (!available) { delete assignment.training.content; delete assignment.training.learningObjectives; }
      return { assignment, contentAvailable: available, completionRequirement: assignment.training.requiresQuiz ? 'MATERIAL_AND_QUIZ' : 'MATERIAL_ONLY' };
    },
    async advance(user, id, operation, body) {
      fields(body, operation === 'start' ? [] : ['sectionKey', 'acknowledged'], operation === 'start' ? [] : ['sectionKey', 'acknowledged']);
      if (operation !== 'start' && (body.acknowledged !== true || typeof body.sectionKey !== 'string' || body.sectionKey.length > 40)) fail();
      identifier(id);
      return database.$transaction(async (tx) => {
        const owned = await tx.trainingAssignment.findFirst({ where: { id, employeeId: user.id, revokedAt: null }, select: { trainingId: true } });
        if (!owned) missing();
        const program = await lockProgram(tx, owned.trainingId);
        await tx.$queryRaw`SELECT id FROM training_assignments WHERE id = ${id}::uuid FOR UPDATE`;
        const assignment = await tx.trainingAssignment.findFirst({ where: { id, employeeId: user.id, revokedAt: null }, include: { progress: true } });
        if (!assignment) missing();
        if (program.status !== 'PUBLISHED') conflict('This course is no longer available for learning. Existing progress is retained.');
        const sections = program.content?.sections;
        if (!Array.isArray(sections) || sections.length < 2 || sections.some((section) => typeof section.key !== 'string')) conflict('Course content requires administrator review.');
        const current = assignment.progress;
        const completed = current?.completedSectionKeys ?? [];
        if (operation !== 'start') {
          if (!current?.startedAt) conflict('Start the assigned course before recording progress.');
          if (!sections.some((section) => section.key === body.sectionKey)) fail('Unknown section.');
          if (completed.includes(body.sectionKey)) return { progress: await tx.trainingProgress.findUnique({ where: { assignmentId: id }, select: progressSelect }) };
          if (sections[completed.length]?.key !== body.sectionKey) conflict('Acknowledge each section in order.');
          completed.push(body.sectionKey);
        } else if (current?.startedAt) return { progress: await tx.trainingProgress.findUnique({ where: { assignmentId: id }, select: progressSelect }) };
        const now = new Date(); const materialComplete = completed.length === sections.length;
        const finalComplete = materialComplete && !program.requiresQuiz;
        const data = { completedSectionKeys: completed, progressPercent: Math.floor(completed.length * 100 / sections.length),
          startedAt: current?.startedAt ?? now, lastActivityAt: now, status: finalComplete ? 'COMPLETED' : 'IN_PROGRESS',
          materialCompletedAt: materialComplete ? (current?.materialCompletedAt ?? now) : null, completedAt: finalComplete ? now : null };
        const progress = await tx.trainingProgress.upsert({ where: { assignmentId: id }, create: { assignmentId: id, ...data }, update: data, select: progressSelect });
        return { progress };
      });
    },
  };
}
