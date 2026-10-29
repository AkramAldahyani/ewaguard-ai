import { CommunityError } from './community-service.js';
import { commentText, screenComment, publicCommentWhere } from './comment-policy.js';
import { fields, identifier, pageInput } from '../training/training-policy.js';

const fail = (status, code, message) => { throw new CommunityError(status, code, message); };
const missing = () => fail(404, 'COMMENT_NOT_FOUND', 'This post or comment is no longer available.');
const person = { firstName: true, lastName: true };
const selected = { id: true, postId: true, parentId: true, authorId: true, body: true, status: true,
  createdAt: true, updatedAt: true, moderationReason: true, author: { select: person } };
const visible = (user) => ({ OR: [{ status: 'APPROVED' }, { authorId: user.id, status: { in: ['PENDING_REVIEW', 'REJECTED'] } }] });
const present = (row, user, admin = false) => ({ id: row.id, postId: row.postId, parentId: row.parentId,
  body: row.body, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt,
  own: row.authorId === user.id, authorName: admin ? `${row.author.firstName} ${row.author.lastName}` : `${row.author.firstName} ${row.author.lastName.charAt(0)}.`,
  ...(admin || row.authorId === user.id ? { moderationReason: row.moderationReason } : {}) });
async function lockPost(tx, id, requireApproved = true) {
  await tx.$queryRaw`SELECT id FROM community_posts WHERE id = ${id}::uuid FOR UPDATE`;
  const post = await tx.communityPost.findUnique({ where: { id }, select: { status: true } });
  if (!post || requireApproved && post.status !== 'APPROVED') missing();
}
async function audit(tx, user, id, action, metadata = {}) {
  await tx.auditLog.create({ data: { actorId: user.id, resourceId: id, resourceType: 'COMMUNITY_COMMENT', action,
    outcome: 'SUCCESS', metadata, retentionUntil: new Date(Date.now() + 90 * 86400000) } });
}
export function createCommentService(database) {
  return {
    async list(user, id, query) {
      const postId = identifier(id), paging = pageInput(query, ['parentId']);
      const parentId = query.parentId === undefined ? null : identifier(query.parentId);
      return database.$transaction(async (tx) => {
        const post = await tx.communityPost.findFirst({ where: { id: postId, status: 'APPROVED' }, select: { id: true } });
        if (!post) missing();
        if (parentId && !await tx.communityComment.findFirst({ where: { id: parentId, postId, parentId: null, status: 'APPROVED' }, select: { id: true } })) missing();
        const rows = await tx.communityComment.findMany({ where: { postId, parentId, ...visible(user) }, select: selected,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: paging.skip, take: paging.pageSize + 1 });
        const count = await tx.communityComment.count({ where: { postId, ...publicCommentWhere } });
        return { items: rows.slice(0, paging.pageSize).map((row) => present(row, user)), page: paging.page,
          hasMore: rows.length > paging.pageSize, commentCount: count };
      }, { isolationLevel: 'RepeatableRead' });
    },
    async submit(user, id, input) {
      const postId = identifier(id);
      fields(input, ['body', 'parentId'], ['body']);
      const body = commentText(input.body); screenComment(body);
      const parentId = input.parentId === undefined || input.parentId === null ? null : identifier(input.parentId);
      return database.$transaction(async (tx) => {
        await lockPost(tx, postId);
        if (parentId && !await tx.communityComment.findFirst({ where: { id: parentId, postId, parentId: null, status: 'APPROVED' }, select: { id: true } })) missing();
        const prior = await tx.communityComment.findFirst({ where: { postId, authorId: user.id, parentId, body,
          status: 'APPROVED', createdAt: { gte: new Date(Date.now() - 300000) } }, select: selected });
        if (prior) return { comment: present(prior, user), alreadySubmitted: true };
        const row = await tx.communityComment.create({ data: { postId, authorId: user.id, parentId, body, status: 'APPROVED' }, select: selected });
        await audit(tx, user, row.id, 'COMMUNITY_COMMENT_PUBLISHED', { publicationPolicy: 'IMMEDIATE' });
        return { comment: present(row, user), alreadySubmitted: false };
      });
    },
    async removeOwn(user, id) {
      const commentId = identifier(id);
      return database.$transaction(async (tx) => {
        const initial = await tx.communityComment.findFirst({ where: { id: commentId, authorId: user.id }, select: { postId: true } });
        if (!initial) missing();
        await lockPost(tx, initial.postId, false);
        const row = await tx.communityComment.findUnique({ where: { id: commentId } });
        if (row.status !== 'REMOVED') {
          // Remove submitted text; retain the row for thread integrity and audit.
          await tx.communityComment.update({ where: { id: commentId }, data: { body: '', status: 'REMOVED', moderationReason: null } });
          await audit(tx, user, commentId, 'COMMUNITY_COMMENT_DELETED');
        }
        return { removed: true };
      });
    },
    async queue(user, query) {
      const paging = pageInput(query, ['status']);
      const status = query.status ?? 'APPROVED';
      if (!['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REMOVED'].includes(status)) fail(400, 'COMMENT_INVALID', 'Invalid comment status.');
      const rows = await database.communityComment.findMany({ where: { status }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: paging.skip, take: paging.pageSize + 1, select: { ...selected,
          post: { select: { title: true, body: true, status: true } }, parent: { select: { body: true, status: true } },
          moderationActions: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, decision: true, reason: true, createdAt: true } } } });
      return { items: rows.slice(0, paging.pageSize).map((row) => ({ ...present(row, user, true), post: row.post,
        parent: row.parent, history: row.moderationActions })), page: paging.page, hasMore: rows.length > paging.pageSize };
    },
    async decide(user, id, action, input, transaction) {
      const commentId = identifier(id);
      fields(input, ['reason', 'expectedUpdatedAt'], ['reason', 'expectedUpdatedAt']);
      const reason = commentText(input.reason, 1000); screenComment(reason);
      const next = { approve: 'APPROVED', reject: 'REJECTED', remove: 'REMOVED' }[action];
      if (!next || typeof input.expectedUpdatedAt !== 'string') fail(400, 'COMMENT_INVALID', 'Invalid moderation decision.');
      const run = transaction ? (fn) => fn(transaction) : (fn) => database.$transaction(fn);
      return run(async (tx) => {
        const initial = await tx.communityComment.findUnique({ where: { id: commentId }, select: { postId: true } });
        if (!initial) missing();
        await lockPost(tx, initial.postId, false);
        const row = await tx.communityComment.findUnique({ where: { id: commentId }, include: { post: true, parent: true } });
        if (row.authorId === user.id) fail(403, 'COMMENT_SELF_MODERATION', 'You cannot moderate your own comment.');
        if (row.updatedAt.toISOString() !== input.expectedUpdatedAt) fail(409, 'COMMENT_STALE', 'This comment changed. Refresh and review it again.');
        if (row.status !== (next === 'REMOVED' ? 'APPROVED' : 'PENDING_REVIEW')) fail(409, 'COMMENT_TRANSITION', 'This decision is no longer available.');
        if (next === 'APPROVED') {
          if (row.post.status !== 'APPROVED' || row.parent && row.parent.status !== 'APPROVED')
            fail(409, 'COMMENT_PARENT_UNAVAILABLE', 'The post and parent comment must be published first.');
          screenComment(commentText(row.body));
        }
        await tx.communityComment.update({ where: { id: commentId }, data: { status: next, moderationReason: reason,
          updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) } });
        await tx.commentModerationAction.create({ data: { commentId, moderatorId: user.id, previousStatus: row.status, decision: next, reason } });
        await audit(tx, user, commentId, `COMMUNITY_COMMENT_${next}`, { previousStatus: row.status });
        return { status: next };
      });
    },
  };
}
