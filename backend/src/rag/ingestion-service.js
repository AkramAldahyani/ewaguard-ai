import path from 'node:path';
import { IngestionError } from './ingestion-policy.js';
import { prepareSource, KNOWLEDGE_ROOT } from './local-sources.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function requireIngestionAdministrator(database, actorId) {
  if (typeof actorId !== 'string' || !uuid.test(actorId)) throw new IngestionError('ADMIN_REQUIRED');
  const actor = await database.user.findFirst({
    where: { id: actorId, status: 'ACTIVE', deletedAt: null, role: { name: 'IT_SECURITY_ADMIN' } },
    select: { id: true },
  });
  if (!actor) throw new IngestionError('ADMIN_REQUIRED');
}

// Local operator entry point only; an actor ID is attribution, not HTTP authentication.
// Filesystem/database access remains the CLI's trust boundary. No web mutation route.
export async function ingestSource(database, entry, actorId, { root = KNOWLEDGE_ROOT } = {}) {
  await requireIngestionAdministrator(database, actorId);
  const prepared = await prepareSource(entry, root);
  const { source, contentSha256, chunks, ingestionMetadata } = prepared;
  return database.$transaction(
    async (tx) => {
      await requireIngestionAdministrator(tx, actorId);
      // Serialize same-document writers across CLI processes. SQL inputs stay parameters.
      const lockKey = `knowledge:${source.kind}:${source.documentKey}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
      const existing = await tx.knowledgeDocument.findUnique({
        where: {
          kind_documentKey_version: {
            kind: source.kind,
            documentKey: source.documentKey,
            version: source.version,
          },
        },
        select: { id: true, ingestionMetadata: true },
      });
      if (existing) {
        if (existing.ingestionMetadata?.fingerprint !== ingestionMetadata.fingerprint)
          throw new IngestionError('VERSION_CONFLICT');
        return { status: 'UNCHANGED', documentId: existing.id, documentKey: source.documentKey, chunks: chunks.length };
      }
      const document = await tx.knowledgeDocument.create({
        data: {
          kind: source.kind,
          documentKey: source.documentKey,
          version: source.version,
          title: source.title,
          source: source.filename,
          filename: path.posix.basename(source.filename),
          classification: source.classification,
          contentSha256,
          ingestionMetadata,
          uploadedById: actorId,
          status: 'DRAFT',
          active: false,
          indexingStatus: 'NOT_INDEXED',
          chunks: { create: chunks },
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'KNOWLEDGE_DOCUMENT_INGESTED',
          resourceType: 'KNOWLEDGE_DOCUMENT',
          resourceId: document.id,
          outcome: 'SUCCESS',
          metadata: {
            kind: source.kind,
            version: source.version,
            classification: source.classification,
            chunkCount: chunks.length,
          },
          retentionUntil: new Date(Date.now() + 90 * 86400000),
        },
      });
      return { status: 'INGESTED', documentId: document.id, documentKey: source.documentKey, chunks: chunks.length };
    },
    { timeout: 30_000 },
  );
}
