import { DISCLAIMER_DEFINITION } from '../../../shared/disclaimer.js';
import { fields, identifier, pageInput, searchText } from '../training/training-policy.js';

const categories = ['PHISHING', 'SUSPICIOUS_EMAIL', 'SUSPICIOUS_LINK', 'SUSPICIOUS_FILE', 'SECURITY_TIP', 'SECURITY_WARNING', 'EDUCATIONAL_CONTENT'];
const statuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REMOVED'];
const fiveMinutes = 5 * 60_000;
const tenMinutes = 10 * 60_000;
export class CommunityError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const invalid = (message = 'Invalid community request.') => { throw new CommunityError(400, 'COMMUNITY_INVALID', message); };
const missing = () => { throw new CommunityError(404, 'COMMUNITY_NOT_FOUND', 'Community post not found.'); };
const author = { firstName: true, lastName: true };
const summary = { id: true, title: true, body: true, category: true, status: true, submittedAt: true,
  approvedAt: true, removedAt: true, createdAt: true, author: { select: author } };
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>]/u.test(value)
    || Array.from(value).some((c) => { const code = c.codePointAt(0); return code === 127 || code < 32 && ![9, 10, 13].includes(code); })) invalid('Use bounded plain text without HTML.');
  return value.trim();
}
function readQuery(query, own = false) {
  const paging = pageInput(query, own ? ['status', 'category', 'search'] : ['category', 'search']);
  if (query.category !== undefined && !categories.includes(query.category)) invalid();
  if (own && query.status !== undefined && !statuses.includes(query.status)) invalid();
  const search = searchText(query.search);
  return { paging, where: { ...(query.category ? { category: query.category } : {}),
    ...(own && query.status ? { status: query.status } : {}),
    ...(search ? { OR: ['title', 'body'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) } : {}) } };
}
function present(row, own = false, detail = false) {
  return { id: row.id, title: row.title, category: row.category, status: row.status,
    body: detail ? row.body : row.body.slice(0, 240),
    submittedAt: row.submittedAt, approvedAt: row.approvedAt, createdAt: row.createdAt,
    ...(own ? { removedAt: row.removedAt } : {}),
    authorName: own ? `${row.author.firstName} ${row.author.lastName}`.trim()
      : `${row.author.firstName} ${row.author.lastName.charAt(0)}.`.trim() };
}
export function createCommunityService(database) {
  return {
    async approved(query) {
      const { paging, where } = readQuery(query);
      const rows = await database.communityPost.findMany({ where: { status: 'APPROVED', ...where }, select: summary,
        orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }], skip: paging.skip, take: paging.pageSize + 1 });
      return { items: rows.slice(0, paging.pageSize).map((row) => present(row)), page: paging.page,
        pageSize: paging.pageSize, hasMore: rows.length > paging.pageSize };
    },
    async approvedDetail(id) {
      const row = await database.communityPost.findFirst({ where: { id: identifier(id), status: 'APPROVED' }, select: summary });
      if (!row) missing();
      return { post: present(row, false, true) };
    },
    async mine(user, query) {
      const { paging, where } = readQuery(query, true);
      const rows = await database.communityPost.findMany({ where: { authorId: user.id, ...where }, select: summary,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: paging.skip, take: paging.pageSize + 1 });
      return { items: rows.slice(0, paging.pageSize).map((row) => present(row, true)), page: paging.page,
        pageSize: paging.pageSize, hasMore: rows.length > paging.pageSize };
    },
    async ownDetail(user, id) {
      const row = await database.communityPost.findFirst({ where: { id: identifier(id), authorId: user.id }, select: summary });
      if (!row) missing();
      return { post: present(row, true, true) };
    },
    async submit(user, body) {
      fields(body, ['title', 'body', 'category', 'acknowledgementId'], ['title', 'body', 'category', 'acknowledgementId']);
      const title = text(body.title, 200), content = text(body.body, 5000);
      if (!categories.includes(body.category)) invalid();
      const acknowledgementId = identifier(body.acknowledgementId);
      return database.$transaction(async (tx) => {
        // Serialize retries from one author before checking for a matching pending post.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
        const now = new Date();
        const ack = await tx.disclaimerAcknowledgement.findFirst({ where: { id: acknowledgementId,
          userId: user.id, context: 'COMMUNITY_POST', version: DISCLAIMER_DEFINITION.version,
          createdAt: { gte: new Date(now.getTime() - tenMinutes), lte: now } }, select: { id: true } });
        if (!ack) throw new CommunityError(403, 'COMMUNITY_ACKNOWLEDGEMENT_REQUIRED', 'A current community-post acknowledgement is required.');
        const previous = await tx.communityPost.findFirst({ where: { authorId: user.id, status: 'PENDING_REVIEW',
          title, body: content, category: body.category, createdAt: { gte: new Date(now.getTime() - fiveMinutes) } },
        select: summary, orderBy: { createdAt: 'desc' } });
        if (previous) return { post: present(previous, true, true), alreadySubmitted: true };
        const row = await tx.communityPost.create({ data: { authorId: user.id, acknowledgementId,
          title, body: content, category: body.category, status: 'PENDING_REVIEW', submittedAt: now }, select: summary });
        await tx.auditLog.create({ data: { actorId: user.id, action: 'COMMUNITY_POST_SUBMITTED',
          resourceType: 'COMMUNITY_POST', resourceId: row.id, outcome: 'SUCCESS',
          metadata: { category: row.category }, retentionUntil: new Date(Date.now() + 90 * 86400000) } });
        return { post: present(row, true, true), alreadySubmitted: false };
      });
    },
  };
}
