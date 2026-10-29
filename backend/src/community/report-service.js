import { CommunityError } from './community-service.js';
import { fields, identifier, pageInput } from '../training/training-policy.js';
import { commentText, screenComment, publicCommentWhere } from './comment-policy.js';
import { createModerationService } from './moderation-service.js';
import { createCommentService } from './comment-service.js';

const categories = ['INAPPROPRIATE', 'MISLEADING', 'SENSITIVE_INFORMATION', 'SPAM', 'OTHER'];
const fail = (status, message) => { throw new CommunityError(status, 'COMMUNITY_REPORT', message); };
async function audit(tx, user, id, action) {
  await tx.auditLog.create({ data: { actorId: user.id, resourceId: id, resourceType: 'COMMUNITY_REPORT', action,
    outcome: 'SUCCESS', retentionUntil: new Date(Date.now() + 90 * 86400000) } });
}
export function createReportService(database, media) {
  return {
    async submit(user, input) {
      fields(input, ['targetType', 'targetId', 'category', 'details'], ['targetType', 'targetId', 'category']);
      if (!['POST', 'COMMENT'].includes(input.targetType) || !categories.includes(input.category)) fail(400, 'Choose a valid report category and content type.');
      const id = identifier(input.targetId), isPost = input.targetType === 'POST';
      const details = input.details === undefined || input.details === '' ? null : commentText(input.details, 1000);
      if (details) screenComment(details);
      return database.$transaction(async (tx) => {
        const comment = isPost ? null : await tx.communityComment.findUnique({ where: { id }, select: { postId: true } });
        const postId = isPost ? id : comment?.postId;
        if (!postId) fail(404, 'This content is no longer available.');
        await tx.$queryRaw`SELECT id FROM community_posts WHERE id = ${postId}::uuid FOR UPDATE`;
        const post = await tx.communityPost.findFirst({ where: { id: postId, status: 'APPROVED' } });
        if (!post || !isPost && !await tx.communityComment.findFirst({ where: { id, ...publicCommentWhere } })) fail(404, 'This content is no longer available.');
        const target = isPost ? { postId: id } : { commentId: id };
        const prior = await tx.communityReport.findFirst({ where: { reporterId: user.id, ...target } });
        if (prior) return { submitted: true, alreadyReported: true };
        const row = await tx.communityReport.create({ data: { reporterId: user.id, ...target, category: input.category, details } });
        await audit(tx, user, row.id, 'COMMUNITY_REPORT_SUBMITTED');
        return { submitted: true, alreadyReported: false };
      });
    },
    async list(query) {
      const paging = pageInput(query, ['status']), status = query.status ?? 'PENDING';
      if (!['PENDING', 'DISMISSED', 'ACTIONED'].includes(status)) fail(400, 'Choose a valid report status.');
      const rows = await database.communityReport.findMany({ where: { status }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: paging.skip, take: paging.pageSize + 1,
        include: { reporter: { select: { firstName: true, lastName: true } }, reviewer: { select: { firstName: true, lastName: true } },
          post: { select: { id: true } }, comment: { select: { id: true, body: true, status: true, updatedAt: true, postId: true,
            author: { select: { firstName: true, lastName: true } }, parent: { select: { body: true, status: true } } } } } });
      const items = await Promise.all(rows.slice(0, paging.pageSize).map(async (row) => {
        const { post } = await createModerationService(database, media).detail(row.postId ?? row.comment.postId);
        return { id: row.id, category: row.category, details: row.details, status: row.status, reason: row.reason,
          createdAt: row.createdAt, updatedAt: row.updatedAt, reviewedAt: row.reviewedAt, reporter: row.reporter, reviewer: row.reviewer,
          targetType: row.commentId ? 'COMMENT' : 'POST', post, comment: row.comment };
      }));
      return { items, page: paging.page, hasMore: rows.length > paging.pageSize };
    },
    async resolve(user, id, input) {
      const reportId = identifier(id);
      fields(input, ['action', 'reason', 'expectedUpdatedAt', 'expectedContentUpdatedAt'], ['action', 'reason', 'expectedUpdatedAt', 'expectedContentUpdatedAt']);
      if (!['dismiss', 'remove'].includes(input.action)) fail(400, 'Choose dismiss or remove.');
      const reason = commentText(input.reason, 1000); screenComment(reason);
      return database.$transaction(async (tx) => {
        const initial = await tx.communityReport.findUnique({ where: { id: reportId }, include: { comment: true } });
        if (!initial) fail(404, 'Report not found.');
        const postId = initial.postId ?? initial.comment.postId;
        // Match the lock order used by submissions and moderation to avoid races/deadlocks.
        await tx.$queryRaw`SELECT id FROM community_posts WHERE id = ${postId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM community_reports WHERE id = ${reportId}::uuid FOR UPDATE`;
        const row = await tx.communityReport.findUnique({ where: { id: reportId } });
        const target = row.commentId ? await tx.communityComment.findUnique({ where: { id: row.commentId } }) : await tx.communityPost.findUnique({ where: { id: postId } });
        if (target.authorId === user.id || row.reporterId === user.id) fail(403, 'Another administrator must review this report.');
        if (row.status !== 'PENDING' || input.expectedUpdatedAt !== row.updatedAt.toISOString() || input.expectedContentUpdatedAt !== target.updatedAt.toISOString()) fail(409, 'This report or content changed. Refresh before deciding.');
        if (input.action === 'remove') {
          const decision = { reason, expectedUpdatedAt: input.expectedContentUpdatedAt };
          if (row.commentId) await createCommentService(database).decide(user, row.commentId, 'remove', decision, tx);
          else await createModerationService(database, media).decide(user, postId, 'REMOVED', decision, tx);
        }
        const status = input.action === 'remove' ? 'ACTIONED' : 'DISMISSED';
        await tx.communityReport.update({ where: { id: reportId }, data: { status, reason, reviewerId: user.id, reviewedAt: new Date() } });
        await audit(tx, user, reportId, `COMMUNITY_REPORT_${status}`);
        return { status };
      });
    },
  };
}
