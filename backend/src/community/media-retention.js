import { IMAGE_PIPELINE, DAY } from './media-policy.js';

// Keep posts and moderation history. Remove only expired binary objects, and
// preserve evidence linked to investigations. Filesystem failures stay retryable.
export async function cleanupCommunityMedia(database, media, { apply = false, now = new Date(), ownerId } = {}) {
  const rows = await database.fileAnalysis.findMany({ where: { storageKey: { not: null }, expiresAt: { lte: now },
    evidence: { path: ['pipeline'], equals: IMAGE_PIPELINE }, incidentEvidence: { none: {} }, ...(ownerId ? { userId: ownerId } : {}) },
    select: { id: true, storageKey: true }, take: 100, orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }] });
  let removed = 0, orphans = 0;
  for (const row of rows) {
    if (!apply) continue;
    // Expiry already denies new reads and approval. Keep the key until deletion
    // succeeds so a failed filesystem operation is retried on the next run.
    await database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM file_analyses WHERE id = ${row.id}::uuid FOR UPDATE`;
      const current = await tx.fileAnalysis.findFirst({ where: { id: row.id, expiresAt: { lte: now },
        storageKey: row.storageKey, incidentEvidence: { none: {} } } });
      if (!current) return;
      await media.store.remove(row.storageKey);
      await tx.fileAnalysis.update({ where: { id: row.id }, data: { storageKey: null, deletedAt: now } });
      await tx.auditLog.create({ data: { action: 'COMMUNITY_MEDIA_EXPIRED', resourceType: 'FILE_ANALYSIS',
        resourceId: row.id, outcome: 'SUCCESS', metadata: {}, retentionUntil: new Date(now.getTime() + 90 * DAY) } });
      removed++;
    });
  }
  for await (const key of media.store.stale(now)) {
    if (await database.fileAnalysis.findUnique({ where: { storageKey: key }, select: { id: true } })) continue;
    orphans++;
    if (apply) await media.store.remove(key);
  }
  return { mode: apply ? 'APPLY' : 'PREVIEW', eligible: rows.length, removed, orphans };
}
