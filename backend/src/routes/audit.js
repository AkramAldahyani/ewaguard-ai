import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { identitySelect, actorKind } from '../users/user-identity.js';

const auditOutcomes = ['SUCCESS', 'FAILURE', 'DENIED'];
const actorScopes = ['USER', 'NON_USER'];
const dayMs = 86_400_000;

function auditDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function auditFilters(query) {
  const allowed = ['page', 'pageSize', 'action', 'resourceType', 'outcome', 'actorScope', 'start', 'end'];
  if (!query || typeof query !== 'object' || Array.isArray(query) ||
      Object.keys(query).some((key) => !allowed.includes(key)) ||
      Object.values(query).some((value) => typeof value !== 'string')) return null;
  const integer = (value, fallback, max) => value === undefined ? fallback
    : /^[1-9]\d{0,4}$/.test(value) && Number(value) <= max ? Number(value) : null;
  const text = (value, max) => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed && trimmed.length <= max &&
      ![...trimmed].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? trimmed : null;
  };
  const page = integer(query.page, 1, 10000), pageSize = integer(query.pageSize, 20, 100);
  const action = text(query.action, 100), resourceType = text(query.resourceType, 80);
  if (!page || !pageSize || action === null || resourceType === null ||
      (query.outcome !== undefined && !auditOutcomes.includes(query.outcome)) ||
      (query.actorScope !== undefined && !actorScopes.includes(query.actorScope))) return null;
  const start = query.start === undefined ? undefined : auditDate(query.start);
  const end = query.end === undefined ? undefined : auditDate(query.end);
  if ((query.start !== undefined && !start) || (query.end !== undefined && !end) ||
      (start && end && (start > end || (end.getTime() - start.getTime()) / dayMs > 365))) return null;
  const where = {};
  if (action) where.action = { contains: action, mode: 'insensitive' };
  if (resourceType) where.resourceType = { contains: resourceType, mode: 'insensitive' };
  if (query.outcome) where.outcome = query.outcome;
  if (query.actorScope) where.actorId = query.actorScope === 'USER' ? { not: null } : null;
  if (start || end) where.createdAt = {
    ...(start ? { gte: start } : {}),
    ...(end ? { lt: new Date(end.getTime() + dayMs) } : {}),
  };
  return { page, pageSize, where };
}

export async function listAuditLogs(database, query) {
  const filters = auditFilters(query);
  if (!filters) return null;
  const { page, pageSize, where } = filters;
  const [total, rows] = await Promise.all([
    database.auditLog.count({ where }),
    database.auditLog.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, actorId: true, actor: { select: identitySelect }, action: true,
        resourceType: true, resourceId: true, outcome: true, createdAt: true, metadata: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, total, totalPages, hasMore: page < totalPages,
    items: rows.map(({ metadata, ...row }) => ({
      ...row, actorKind: actorKind(row.actorId, metadata?.system),
    })) };
}

export function createAuditRouter({ database, config }) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('IT_SECURITY_ADMIN'),
    createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60000, limit: 60, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'AUDIT_RATE_LIMIT', message: 'Too many requests. Try again shortly.' } } }));
  router.get('/', async (req, res, next) => {
    try {
      const result = await listAuditLogs(database, req.query);
      if (!result) return res.status(400).json({ error: { code: 'INVALID_AUDIT_QUERY', message: 'Check the audit filters and pagination.' } });
      return res.json(result);
    } catch (error) { return next(error); }
  });
  return router;
}
