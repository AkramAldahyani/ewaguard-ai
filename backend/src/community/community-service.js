import { DISCLAIMER_DEFINITION } from '../../../shared/disclaimer.js';
import { fields, identifier, pageInput, searchText } from '../training/training-policy.js';
import { attachmentSelection, presentImages, DAY, IMAGE_PIPELINE } from './media-policy.js';
import { publicCommentWhere } from './comment-policy.js';

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
const fiveMinutes = 5 * 60_000;
const tenMinutes = 10 * 60_000;
export class CommunityError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}
const invalid = (message = 'Invalid community request.') => {
  throw new CommunityError(400, 'COMMUNITY_INVALID', message);
};
const missing = () => {
  throw new CommunityError(404, 'COMMUNITY_NOT_FOUND', 'Community post not found.');
};
const author = { firstName: true, lastName: true };
const summary = {
  id: true,
  title: true,
  body: true,
  category: true,
  status: true,
  submittedAt: true,
  approvedAt: true,
  removedAt: true,
  createdAt: true,
  author: { select: author },
  attachments: attachmentSelection,
};
const engagementSelection = (user) => ({
  _count: { select: { likes: true, comments: { where: publicCommentWhere } } },
  likes: { where: { userId: user.id }, select: { userId: true } },
  saves: { where: { userId: user.id }, select: { userId: true } },
});
const engagement = (row) => ({
  likeCount: row._count?.likes ?? 0,
  commentCount: row._count?.comments ?? 0,
  liked: Boolean(row.likes?.length),
  saved: Boolean(row.saves?.length),
});
function text(value, max) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[<>]/u.test(value) ||
    Array.from(value).some((c) => {
      const code = c.codePointAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    })
  )
    invalid('Use bounded plain text without HTML.');
  return value.trim();
}
function readQuery(query, own = false) {
  const paging = pageInput(query, own ? ['status', 'category', 'search'] : ['category', 'search']);
  if (query.category !== undefined && !categories.includes(query.category)) invalid();
  if (own && query.status !== undefined && !statuses.includes(query.status)) invalid();
  const search = searchText(query.search);
  return {
    paging,
    where: {
      ...(query.category ? { category: query.category } : {}),
      ...(own && query.status ? { status: query.status } : {}),
      ...(search
        ? { OR: ['title', 'body'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
        : {}),
    },
  };
}
function present(row, own = false) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    body: row.body,
    images: presentImages(row.attachments),
    ...engagement(row),
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
    ...(own ? { removedAt: row.removedAt } : {}),
    authorName: own
      ? `${row.author.firstName} ${row.author.lastName}`.trim()
      : `${row.author.firstName} ${row.author.lastName.charAt(0)}.`.trim(),
  };
}
export async function requireCommunityAcknowledgement(database, userId, id) {
  const now = new Date();
  const ack = await database.disclaimerAcknowledgement.findFirst({
    where: {
      id: identifier(id),
      userId,
      context: 'COMMUNITY_POST',
      version: DISCLAIMER_DEFINITION.version,
      createdAt: { gte: new Date(now.getTime() - tenMinutes), lte: now },
    },
    select: { id: true },
  });
  if (!ack)
    throw new CommunityError(
      403,
      'COMMUNITY_ACKNOWLEDGEMENT_REQUIRED',
      'A current community-post acknowledgement is required.',
    );
}

export function createCommunityService(database) {
  return {
    async approved(query, user) {
      const { paging, where } = readQuery(query);
      const rows = await database.communityPost.findMany({
        where: { status: 'APPROVED', ...where },
        select: { ...summary, ...engagementSelection(user) },
        orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.pageSize + 1,
      });
      return {
        items: rows.slice(0, paging.pageSize).map((row) => present(row)),
        page: paging.page,
        pageSize: paging.pageSize,
        hasMore: rows.length > paging.pageSize,
      };
    },
    async approvedDetail(id, user) {
      const row = await database.communityPost.findFirst({
        where: { id: identifier(id), status: 'APPROVED' },
        select: { ...summary, ...engagementSelection(user) },
      });
      if (!row) missing();
      return { post: present(row, false, true) };
    },
    async mine(user, query) {
      const { paging, where } = readQuery(query, true);
      const rows = await database.communityPost.findMany({
        where: { authorId: user.id, deletedAt: null, ...where },
        select: { ...summary, ...engagementSelection(user) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.pageSize + 1,
      });
      return {
        items: rows.slice(0, paging.pageSize).map((row) => present(row, true)),
        page: paging.page,
        pageSize: paging.pageSize,
        hasMore: rows.length > paging.pageSize,
      };
    },
    async ownDetail(user, id) {
      const row = await database.communityPost.findFirst({
        where: { id: identifier(id), authorId: user.id, deletedAt: null },
        select: { ...summary, ...engagementSelection(user) },
      });
      if (!row) missing();
      return { post: present(row, true, true) };
    },
    async deleteOwn(user, id) {
      const postId = identifier(id);
      return database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM community_posts WHERE id = ${postId}::uuid FOR UPDATE`;
        const post = await tx.communityPost.findFirst({ where: { id: postId, authorId: user.id } });
        if (!post) missing();
        if (post.deletedAt) return { deleted: true };
        const now = new Date(Math.max(Date.now(), post.updatedAt.getTime() + 1));
        // Retain moderation/report history while withdrawing all employee access.
        await tx.communityPost.update({
          where: { id: postId },
          data: { status: 'REMOVED', deletedAt: now, removedAt: post.removedAt ?? now, updatedAt: now },
        });
        await tx.fileAnalysis.updateMany({
          where: {
            communityAttachment: { postId },
            evidence: { path: ['pipeline'], equals: IMAGE_PIPELINE },
            expiresAt: { gt: now },
          },
          data: { expiresAt: now },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'COMMUNITY_POST_DELETED',
            resourceType: 'COMMUNITY_POST',
            resourceId: postId,
            outcome: 'SUCCESS',
            metadata: { previousStatus: post.status },
            retentionUntil: new Date(now.getTime() + 90 * DAY),
          },
        });
        return { deleted: true };
      });
    },
    async saved(user, query) {
      const { paging, where } = readQuery(query);
      const rows = await database.communityPostSave.findMany({
        where: { userId: user.id, post: { status: 'APPROVED', ...where } },
        select: { post: { select: { ...summary, ...engagementSelection(user) } } },
        orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
        skip: paging.skip,
        take: paging.pageSize + 1,
      });
      return {
        items: rows.slice(0, paging.pageSize).map(({ post }) => present(post)),
        page: paging.page,
        pageSize: paging.pageSize,
        hasMore: rows.length > paging.pageSize,
      };
    },
    async setEngagement(user, id, kind, body) {
      fields(body, ['active'], ['active']);
      if (typeof body.active !== 'boolean' || !['like', 'save'].includes(kind)) invalid();
      const postId = identifier(id);
      return database.$transaction(async (tx) => {
        // Share the moderator's lock: removal cannot race an approval-only write.
        await tx.$queryRaw`SELECT id FROM community_posts WHERE id = ${postId}::uuid FOR UPDATE`;
        const post = await tx.communityPost.findUnique({ where: { id: postId }, select: { status: true } });
        if (!post || post.status !== 'APPROVED') missing();
        const relation = kind === 'like' ? tx.communityPostLike : tx.communityPostSave;
        const key = { userId: user.id, postId };
        // Explicit desired state is idempotent, including retries after a lost response.
        if (body.active) await relation.upsert({ where: { userId_postId: key }, create: key, update: {} });
        else await relation.deleteMany({ where: key });
        const updated = await tx.communityPost.findUnique({ where: { id: postId }, select: engagementSelection(user) });
        return { engagement: engagement(updated) };
      });
    },
    async submit(user, body, images = [], imagePolicy = {}) {
      fields(body, ['title', 'body', 'category', 'acknowledgementId'], ['body', 'category', 'acknowledgementId']);
      // Empty titles preserve the existing non-null column and historical posts.
      const title = body.title === undefined || body.title === '' ? '' : text(body.title, 200);
      const content = images.length && body.body === '' ? '' : text(body.body, 5000);
      if (!categories.includes(body.category)) invalid();
      const acknowledgementId = identifier(body.acknowledgementId);
      return database.$transaction(async (tx) => {
        // Serialize retries from one author before checking for a matching pending post.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
        const now = new Date();
        await requireCommunityAcknowledgement(tx, user.id, acknowledgementId);
        const previous = await tx.communityPost.findFirst({
          where: {
            authorId: user.id,
            status: 'PENDING_REVIEW',
            title,
            body: content,
            category: body.category,
            createdAt: { gte: new Date(now.getTime() - fiveMinutes) },
          },
          select: summary,
          orderBy: { createdAt: 'desc' },
        });
        if (
          previous &&
          previous.attachments.length === images.length &&
          [...previous.attachments]
            .sort((a, b) => (a.fileAnalysis.evidence?.position ?? 0) - (b.fileAnalysis.evidence?.position ?? 0))
            .every((entry, index) => entry.fileAnalysis.sha256 === images[index].sha256)
        )
          return { post: present(previous, true, true), alreadySubmitted: true };
        if (images.length) {
          // Serialize image quota admission across users, not merely each author.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(808601::bigint)`;
          const where = { storageKey: { not: null }, communityAttachment: { isNot: null } };
          const total = await tx.fileAnalysis.aggregate({ where, _sum: { sizeBytes: true } });
          const own = await tx.fileAnalysis.aggregate({
            where: { ...where, userId: user.id },
            _sum: { sizeBytes: true },
          });
          const added = images.reduce((sum, image) => sum + image.sizeBytes, 0n);
          if (
            added + (own._sum.sizeBytes ?? 0n) > BigInt(imagePolicy.maxUserBytes) ||
            added + (total._sum.sizeBytes ?? 0n) > BigInt(imagePolicy.maxStoreBytes)
          )
            throw new CommunityError(
              409,
              'COMMUNITY_MEDIA_QUOTA',
              'Image storage quota reached. Contact IT/security or submit a text post.',
            );
        }
        // The active community consent covers the images and their local checks.
        // Preserve the database's distinct acknowledgement contexts for each record.
        const imageAcknowledgements = {};
        if (images.length)
          for (const context of ['COMMUNITY_ATTACHMENT', 'FILE_ANALYSIS']) {
            imageAcknowledgements[context] = (
              await tx.disclaimerAcknowledgement.create({
                data: {
                  userId: user.id,
                  version: DISCLAIMER_DEFINITION.version,
                  context,
                },
              })
            ).id;
          }
        const row = await tx.communityPost.create({
          data: {
            authorId: user.id,
            acknowledgementId,
            title,
            body: content,
            category: body.category,
            status: 'PENDING_REVIEW',
            submittedAt: now,
            attachments: {
              create: images.map((image, position) => ({
                acknowledgement: { connect: { id: imageAcknowledgements.COMMUNITY_ATTACHMENT } },
                fileAnalysis: {
                  create: {
                    userId: user.id,
                    acknowledgementId: imageAcknowledgements.FILE_ANALYSIS,
                    status: 'COMPLETED',
                    extension: 'png',
                    detectedMime: 'image/png',
                    storageKey: image.storageKey,
                    sha256: image.sha256,
                    sizeBytes: image.sizeBytes,
                    evidence: { ...image.evidence, position },
                    clamavStatus: 'NO_KNOWN_DETECTION',
                    yaraStatus: 'NO_KNOWN_DETECTION',
                    analyzedAt: now,
                    expiresAt: new Date(now.getTime() + imagePolicy.retentionDays * DAY),
                  },
                },
              })),
            },
          },
          select: summary,
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'COMMUNITY_POST_SUBMITTED',
            resourceType: 'COMMUNITY_POST',
            resourceId: row.id,
            outcome: 'SUCCESS',
            metadata: { category: row.category },
            retentionUntil: new Date(Date.now() + 90 * 86400000),
          },
        });
        return { post: present(row, true, true), alreadySubmitted: false };
      });
    },
  };
}
