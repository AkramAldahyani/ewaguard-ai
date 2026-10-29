import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { requireIngestionAdministrator } from './ingestion-service.js';
import { prepareSource, KNOWLEDGE_ROOT } from './local-sources.js';
import { isPdplSource } from './pdpl-source.js';
import { IngestionError } from './ingestion-policy.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODELS } from './embedding-policy.js';

// Local operator only. Approval is explicit and separate from ingestion/indexing.
export async function approvePdpl(database, entry, actorId, expectedSha256, { root = KNOWLEDGE_ROOT } = {}) {
  await requireIngestionAdministrator(database, actorId);
  if (!isPdplSource(entry)) throw new IngestionError('PDPL_SOURCE_REQUIRED');
  const prepared = await prepareSource(entry, root);
  if (expectedSha256 !== prepared.contentSha256) throw new IngestionError('SOURCE_REVIEW_REQUIRED');
  return database.$transaction(async tx => {
    await requireIngestionAdministrator(tx, actorId);
    const key = `knowledge:${entry.kind}:${entry.documentKey}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const identity = { kind: entry.kind, documentKey: entry.documentKey, version: entry.version };
    const found = await tx.knowledgeDocument.findUnique({ where: { kind_documentKey_version: identity }, select: { id: true } });
    if (!found) throw new IngestionError('DOCUMENT_NOT_INGESTED');
    await tx.$queryRaw`SELECT id FROM knowledge_documents WHERE id = ${found.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM document_chunks WHERE "documentId" = ${found.id}::uuid ORDER BY position FOR UPDATE`;
    const doc = await tx.knowledgeDocument.findUniqueOrThrow({ where: { id: found.id }, include: { chunks: { orderBy: { position: 'asc' } } } });
    const index = doc.ingestionMetadata?.index;
    const fingerprint = createHash('sha256').update(JSON.stringify({ source: prepared.ingestionMetadata.fingerprint,
      model: index?.model, dimensions: EMBEDDING_DIMENSIONS })).digest('hex');
    if (!['DRAFT', 'PENDING_REVIEW', 'APPROVED'].includes(doc.status) || doc.indexingStatus !== 'INDEXED' ||
      !EMBEDDING_MODELS.includes(index?.model) || index.dimensions !== EMBEDDING_DIMENSIONS || index.fingerprint !== fingerprint ||
      doc.ingestionMetadata.indexAttempt?.state !== 'COMPLETED' || doc.contentSha256 !== prepared.contentSha256 ||
      doc.ingestionMetadata.fingerprint !== prepared.ingestionMetadata.fingerprint ||
      !isDeepStrictEqual(doc.ingestionMetadata.legalSource, prepared.ingestionMetadata.legalSource) ||
      doc.title !== entry.title || doc.source !== entry.filename || doc.filename !== 'bahrain_pdpl.pdf' || doc.classification !== 'PRODUCTION' ||
      doc.ingestionMetadata.sourceUse !== 'PUBLIC_LEGISLATION' || doc.ingestionMetadata.referenceTrust !== 'UNTRUSTED' ||
      doc.chunks.length !== prepared.chunks.length || doc.chunks.some((chunk, i) => chunk.position !== prepared.chunks[i].position ||
        chunk.content !== prepared.chunks[i].content || !isDeepStrictEqual(chunk.metadata, prepared.chunks[i].metadata)))
      throw new IngestionError('PDPL_NOT_READY_FOR_APPROVAL');
    const rows = await tx.$queryRaw`SELECT count(*)::int AS count FROM document_chunks WHERE "documentId" = ${doc.id}::uuid
      AND embedding IS NOT NULL AND "embeddingModel" = ${index.model}`;
    if (rows[0].count !== prepared.chunks.length) throw new IngestionError('PDPL_NOT_READY_FOR_APPROVAL');
    if (await tx.knowledgeDocument.count({ where: { kind: entry.kind, documentKey: entry.documentKey,
      active: true, id: { not: doc.id } } })) throw new IngestionError('ACTIVE_VERSION_CONFLICT');
    if (doc.status === 'APPROVED' && doc.active) return { status: 'UNCHANGED', documentId: doc.id };
    await tx.knowledgeDocument.update({ where: { id: doc.id }, data: { status: 'APPROVED', active: true,
      approvedById: actorId, approvedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId, action: 'KNOWLEDGE_DOCUMENT_APPROVED', resourceType: 'KNOWLEDGE_DOCUMENT',
      resourceId: doc.id, outcome: 'SUCCESS', metadata: { contentSha256: prepared.contentSha256,
        version: doc.version, translationStatus: 'UNOFFICIAL', chunks: doc.chunks.length },
      retentionUntil: new Date(Date.now() + 90 * 86400000) } });
    return { status: 'APPROVED', documentId: doc.id, chunks: doc.chunks.length };
  }, { timeout: 30_000 });
}
