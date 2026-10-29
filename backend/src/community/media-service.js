import { createMediaStore } from './media-store.js';
import { createImageProcessor } from './image-processing.js';
import { CommunityMediaError, reviewableImage, mediaPolicy } from './media-policy.js';
import { identifier } from '../training/training-policy.js';

export function createCommunityMedia({ database, config, store, processor } ) {
  const policy = config.communityMedia ?? mediaPolicy();
  store ??= createMediaStore(policy.root);
  processor ??= createImageProcessor(config, policy);
  return { policy, store, processor,
    async read(user, attachmentId) {
      const row = await database.communityPostAttachment.findFirst({ where: { id: identifier(attachmentId),
        ...(user.role === 'IT_SECURITY_ADMIN' ? {} : { post: { OR: [{ status: 'APPROVED' }, { authorId: user.id }] } }) },
        include: { fileAnalysis: true } });
      if (!row || !reviewableImage(row.fileAnalysis)) throw new CommunityMediaError(404, 'COMMUNITY_MEDIA_UNAVAILABLE', 'This image is unavailable.');
      try { return await store.read(row.fileAnalysis.storageKey, row.fileAnalysis.sha256, row.fileAnalysis.sizeBytes); }
      catch { throw new CommunityMediaError(404, 'COMMUNITY_MEDIA_UNAVAILABLE', 'This image is unavailable.'); }
    },
  };
}
