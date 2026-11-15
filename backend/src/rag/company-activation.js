import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { prepareSource, KNOWLEDGE_ROOT } from './local-sources.js';
import { requireIngestionAdministrator } from './ingestion-service.js';
import { IngestionError } from './ingestion-policy.js';
import { isDemoPolicy } from './company-source.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODELS } from './embedding-policy.js';

export function requireDemoMode(config) {
  if (!['development', 'test'].includes(config?.nodeEnv) || config.ragDemonstrationEnabled !== true)
    throw new IngestionError('DEMONSTRATION_MODE_REQUIRED');
}

// Local operator only. This activates a reviewed sample; it NEVER approves policy.
export async function activateDemoPolicy(
  database,
  entry,
  actorId,
  expectedSha256,
  { config, root = KNOWLEDGE_ROOT } = {},
) {
  requireDemoMode(config);
  await requireIngestionAdministrator(database, actorId);
  if (!isDemoPolicy(entry)) throw new IngestionError('DEMONSTRATION_SOURCE_REQUIRED');
  const prepared = await prepareSource(entry, root);
  const policy = prepared.ingestionMetadata.policySource;
  if (
    !policy?.demonstrationNoticePresent ||
    !/^DEMO-\d{2}$/.test(policy.policyId ?? '') ||
    !policy.sourceTitle ||
    !policy.sourceVersionDate
  )
    throw new IngestionError('DEMONSTRATION_LABEL_REQUIRED');
  if (expectedSha256 !== prepared.contentSha256) throw new IngestionError('SOURCE_REVIEW_REQUIRED');
  return database.$transaction(
    async (tx) => {
      await requireIngestionAdministrator(tx, actorId);
      const key = `knowledge:${entry.kind}:${entry.documentKey}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const found = await tx.knowledgeDocument.findUnique({
        where: {
          kind_documentKey_version: {
            kind: entry.kind,
            documentKey: entry.documentKey,
            version: entry.version,
          },
        },
        select: { id: true },
      });
      if (!found) throw new IngestionError('DOCUMENT_NOT_INGESTED');
      await tx.$queryRaw`SELECT id FROM knowledge_documents WHERE id = ${found.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM document_chunks WHERE "documentId" = ${found.id}::uuid ORDER BY position FOR UPDATE`;
      const doc = await tx.knowledgeDocument.findUniqueOrThrow({
        where: { id: found.id },
        include: { chunks: { orderBy: { position: 'asc' } } },
      });
      const index = doc.ingestionMetadata?.index;
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            source: prepared.ingestionMetadata.fingerprint,
            model: index?.model,
            dimensions: EMBEDDING_DIMENSIONS,
          }),
        )
        .digest('hex');
      if (
        doc.status !== 'DRAFT' ||
        doc.active ||
        doc.approvedAt ||
        doc.approvedById ||
        doc.classification !== 'DEMONSTRATION' ||
        doc.indexingStatus !== 'INDEXED' ||
        !EMBEDDING_MODELS.includes(index?.model) ||
        index.dimensions !== EMBEDDING_DIMENSIONS ||
        index.fingerprint !== fingerprint ||
        doc.ingestionMetadata.indexAttempt?.state !== 'COMPLETED' ||
        doc.contentSha256 !== prepared.contentSha256 ||
        doc.ingestionMetadata.fingerprint !== prepared.ingestionMetadata.fingerprint ||
        !isDeepStrictEqual(doc.ingestionMetadata.policySource, policy) ||
        doc.ingestionMetadata.sourceUse !== 'DEMONSTRATION' ||
        doc.ingestionMetadata.referenceTrust !== 'UNTRUSTED' ||
        doc.title !== entry.title ||
        doc.source !== entry.filename ||
        doc.filename !== path.posix.basename(entry.filename) ||
        doc.chunks.length !== prepared.chunks.length ||
        doc.chunks.some(
          (c, i) =>
            c.position !== prepared.chunks[i].position ||
            c.content !== prepared.chunks[i].content ||
            !isDeepStrictEqual(c.metadata, prepared.chunks[i].metadata),
        )
      )
        throw new IngestionError('DEMONSTRATION_NOT_READY');
      const rows =
        await tx.$queryRaw`SELECT count(*)::int AS count FROM document_chunks WHERE "documentId" = ${doc.id}::uuid
      AND embedding IS NOT NULL AND "embeddingModel" = ${index.model}`;
      if (rows[0].count !== prepared.chunks.length) throw new IngestionError('DEMONSTRATION_NOT_READY');
      const previous = await tx.knowledgeDocument.findMany({
        where: {
          kind: entry.kind,
          documentKey: entry.documentKey,
          id: { not: doc.id },
          OR: [
            { active: true },
            { status: 'DRAFT', ingestionMetadata: { path: ['demoEligibility', 'state'], equals: 'ENABLED' } },
          ],
        },
      });
      if (
        previous.some(
          (d) =>
            d.classification !== 'DEMONSTRATION' ||
            d.status !== 'DRAFT' ||
            d.version >= doc.version ||
            d.ingestionMetadata.policySource?.policyId !== policy.policyId,
        )
      )
        throw new IngestionError('ACTIVE_VERSION_CONFLICT');
      const review = doc.ingestionMetadata.demoEligibility;
      if (
        review?.contentSha256 === prepared.contentSha256 &&
        review?.fingerprint === prepared.ingestionMetadata.fingerprint &&
        review?.state === 'ENABLED' &&
        !previous.length
      )
        return { status: 'UNCHANGED', documentId: doc.id };
      for (const old of previous)
        await tx.knowledgeDocument.update({ where: { id: old.id }, data: { active: false, status: 'ARCHIVED' } });
      await tx.knowledgeDocument.update({
        where: { id: doc.id },
        data: {
          active: false,
          ingestionMetadata: {
            ...doc.ingestionMetadata,
            demoEligibility: {
              state: 'ENABLED',
              reviewedById: actorId,
              reviewedAt: new Date().toISOString(),
              contentSha256: prepared.contentSha256,
              fingerprint: prepared.ingestionMetadata.fingerprint,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'KNOWLEDGE_DEMONSTRATION_ACTIVATED',
          resourceType: 'KNOWLEDGE_DOCUMENT',
          resourceId: doc.id,
          outcome: 'SUCCESS',
          metadata: {
            version: doc.version,
            contentSha256: prepared.contentSha256,
            replacedDocumentIds: previous.map((d) => d.id),
            authority: 'NOT_OFFICIALLY_APPROVED',
          },
          retentionUntil: new Date(Date.now() + 90 * 86400000),
        },
      });
      return { status: 'DEMONSTRATION_ENABLED', documentId: doc.id, version: doc.version, chunks: doc.chunks.length };
    },
    { timeout: 30000 },
  );
}
