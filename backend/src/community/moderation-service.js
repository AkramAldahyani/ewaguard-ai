import { CommunityError } from './community-service.js';
import { fields, identifier, pageInput, searchText } from '../training/training-policy.js';
import { attachmentSelection, presentImages, reviewableImage, DAY, IMAGE_PIPELINE } from './media-policy.js';

const categories = [
  'PHISHING',
  'SUSPICIOUS_EMAIL',
  'SUSPICIOUS_LINK',
  'SUSPICIOUS_FILE',
  'SECURITY_TIP',
  'SECURITY_WARNING',
  'EDUCATIONAL_CONTENT',
];
const statuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REMOVED'];
const transitions = { APPROVED: 'PENDING_REVIEW', REJECTED: 'PENDING_REVIEW', REMOVED: 'APPROVED' };
const person = { id: true, firstName: true, lastName: true };
const selection = {
  id: true,
  title: true,
  body: true,
  category: true,
  status: true,
  submittedAt: true,
  approvedAt: true,
  removedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: person },
  training: { select: { id: true, title: true, status: true } },
};
const fail = (status, code, message) => {
  throw new CommunityError(status, code, message);
};
const name = (user) => `${user.firstName} ${user.lastName}`.trim();
function output(row, detail = false) {
  return {
    id: row.id,
    title: row.title,
    body: detail ? row.body : row.body.slice(0, 240),
    category: row.category,
    status: row.status,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    removedAt: row.removedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: { id: row.author.id, name: name(row.author) },
    relatedTraining: row.training,
  };
}
function date(value, end = false) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    fail(400, 'COMMUNITY_INVALID', 'Use valid YYYY-MM-DD dates.');
  const result = new Date(`${value}T00:00:00Z`);
  if (end) result.setUTCDate(result.getUTCDate() + 1);
  return result;
}
function queryInput(query) {
  const paging = pageInput(query, ['status', 'category', 'authorId', 'search', 'submittedFrom', 'submittedTo', 'sort']);
  if (query.status !== undefined && !statuses.includes(query.status)) fail(400, 'COMMUNITY_INVALID', 'Invalid status.');
  if (query.category !== undefined && !categories.includes(query.category))
    fail(400, 'COMMUNITY_INVALID', 'Invalid category.');
  if (query.sort !== undefined && !['submitted_desc', 'submitted_asc', 'updated_desc'].includes(query.sort))
    fail(400, 'COMMUNITY_INVALID', 'Invalid sort order.');
  const search = searchText(query.search);
  const submittedFrom = query.submittedFrom === undefined ? undefined : date(query.submittedFrom);
  const submittedTo = query.submittedTo === undefined ? undefined : date(query.submittedTo, true);
  if (submittedFrom && submittedTo && submittedFrom >= submittedTo)
    fail(400, 'COMMUNITY_INVALID', 'Invalid date range.');
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.authorId ? { authorId: identifier(query.authorId) } : {}),
    ...(submittedFrom || submittedTo
      ? {
          submittedAt: {
            ...(submittedFrom ? { gte: submittedFrom } : {}),
            ...(submittedTo ? { lt: submittedTo } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { body: { contains: search, mode: 'insensitive' } },
            { author: { is: { firstName: { contains: search, mode: 'insensitive' } } } },
            { author: { is: { lastName: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const orderBy =
    query.sort === 'submitted_asc'
      ? [{ submittedAt: 'asc' }, { id: 'asc' }]
      : query.sort === 'updated_desc'
        ? [{ updatedAt: 'desc' }, { id: 'desc' }]
        : [{ submittedAt: 'desc' }, { id: 'desc' }];
  return { paging, where, orderBy };
}
function actionInput(body) {
  fields(body, ['reason', 'expectedUpdatedAt', 'reviewedAttachmentIds'], ['reason', 'expectedUpdatedAt']);
  if (
    body.reviewedAttachmentIds !== undefined &&
    (!Array.isArray(body.reviewedAttachmentIds) ||
      body.reviewedAttachmentIds.length > 4 ||
      body.reviewedAttachmentIds.some((id) => typeof id !== 'string'))
  )
    fail(400, 'COMMUNITY_INVALID', 'Invalid attachment review.');
  if (
    typeof body.reason !== 'string' ||
    !body.reason.trim() ||
    body.reason.length > 1000 ||
    /[<>]/u.test(body.reason) ||
    Array.from(body.reason).some((c) => {
      const n = c.codePointAt(0);
      return n === 127 || (n < 32 && ![9, 10, 13].includes(n));
    })
  )
    fail(400, 'COMMUNITY_INVALID', 'Provide a plain-text moderation reason of up to 1000 characters.');
  if (typeof body.expectedUpdatedAt !== 'string' || Number.isNaN(Date.parse(body.expectedUpdatedAt)))
    fail(400, 'COMMUNITY_INVALID', 'Provide the post version shown during review.');
  return body.reason.trim();
}
export function createModerationService(database, media) {
  const detail = async (id) => {
    const row = await database.communityPost.findUnique({
      where: { id: identifier(id) },
      select: {
        ...selection,
        attachments: attachmentSelection,
        moderationActions: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            decision: true,
            previousStatus: true,
            reason: true,
            createdAt: true,
            moderator: { select: person },
          },
        },
      },
    });
    if (!row) fail(404, 'COMMUNITY_NOT_FOUND', 'Community post not found.');
    return {
      post: {
        ...output(row, true),
        images: presentImages(row.attachments, true),
        history: row.moderationActions.map((action) => ({
          id: action.id,
          decision: action.decision,
          previousStatus: action.previousStatus,
          reason: action.reason,
          createdAt: action.createdAt,
          moderator: { id: action.moderator.id, name: name(action.moderator) },
        })),
      },
    };
  };
  return {
    async list(query) {
      const { paging, where, orderBy } = queryInput(query);
      const rows = await database.communityPost.findMany({
        where,
        select: selection,
        orderBy,
        skip: paging.skip,
        take: paging.pageSize + 1,
      });
      return {
        items: rows.slice(0, paging.pageSize).map((row) => output(row)),
        page: paging.page,
        pageSize: paging.pageSize,
        hasMore: rows.length > paging.pageSize,
      };
    },
    detail,
    async decide(user, id, decision, body, transaction) {
      const postId = identifier(id),
        reason = actionInput(body);
      const run = transaction ? (fn) => fn(transaction) : (fn) => database.$transaction(fn);
      await run(async (tx) => {
        // Lock the post so two moderators cannot both decide from the same state.
        await tx.$queryRaw`SELECT id FROM community_posts WHERE id = ${postId}::uuid FOR UPDATE`;
        const row = await tx.communityPost.findUnique({
          where: { id: postId },
          select: { id: true, authorId: true, status: true, updatedAt: true, attachments: attachmentSelection },
        });
        if (!row) fail(404, 'COMMUNITY_NOT_FOUND', 'Community post not found.');
        if (row.authorId === user.id) fail(403, 'COMMUNITY_SELF_MODERATION', 'You cannot moderate your own post.');
        if (body.expectedUpdatedAt !== row.updatedAt.toISOString())
          fail(409, 'COMMUNITY_STALE', 'This post changed. Reload before deciding.');
        if (row.status !== transitions[decision])
          fail(409, 'COMMUNITY_TRANSITION', 'This moderation action is not available for the current status.');
        if (decision === 'APPROVED' && row.attachments.length) {
          const reviewed = new Set(body.reviewedAttachmentIds ?? []);
          if (
            !media ||
            reviewed.size !== row.attachments.length ||
            row.attachments.some((image) => !reviewed.has(image.id) || !reviewableImage(image.fileAnalysis))
          )
            fail(
              409,
              'COMMUNITY_ATTACHMENTS_UNREVIEWED',
              'Review every available image before approval. Unverified or expired attachments cannot be published.',
            );
          for (const image of row.attachments) {
            const file = image.fileAnalysis;
            try {
              await media.store.read(file.storageKey, file.sha256, file.sizeBytes);
            } catch {
              fail(409, 'COMMUNITY_ATTACHMENTS_UNREVIEWED', 'An image is unavailable or failed its integrity check.');
            }
          }
        }
        const now = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
        await tx.communityPost.update({
          where: { id: postId },
          data: {
            status: decision,
            updatedAt: now,
            ...(decision === 'APPROVED' ? { approvedAt: now } : {}),
            ...(decision === 'REMOVED' ? { removedAt: now } : {}),
          },
        });
        if (['REJECTED', 'REMOVED'].includes(decision) && media)
          await tx.fileAnalysis.updateMany({
            where: {
              communityAttachment: { postId },
              evidence: { path: ['pipeline'], equals: IMAGE_PIPELINE },
              expiresAt: { gt: new Date(now.getTime() + media.policy.rejectedDays * DAY) },
            },
            data: { expiresAt: new Date(now.getTime() + media.policy.rejectedDays * DAY) },
          });
        await tx.postModerationAction.create({
          data: { postId, moderatorId: user.id, previousStatus: row.status, decision, reason },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: `COMMUNITY_POST_${decision}`,
            resourceType: 'COMMUNITY_POST',
            resourceId: postId,
            outcome: 'SUCCESS',
            metadata: {
              previousStatus: row.status,
              status: decision,
              reviewedAttachments: decision === 'APPROVED' ? row.attachments.length : 0,
            },
            retentionUntil: new Date(Date.now() + 90 * 86400000),
          },
        });
      });
      return transaction ? createModerationService(transaction, media).detail(postId) : detail(postId);
    },
  };
}
