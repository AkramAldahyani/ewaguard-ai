import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { requireIngestionAdministrator } from './ingestion-service.js';
import { prepareSource, KNOWLEDGE_ROOT } from './local-sources.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODELS, EMBEDDING_LIMITS, EmbeddingError, inputByteBound, validateVector } from './embedding-policy.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = source => ({ kind_documentKey_version: { kind: source.kind, documentKey: source.documentKey, version: source.version } });
const projection = { id: true, kind: true, documentKey: true, version: true, title: true, source: true, classification: true,
  contentSha256: true, status: true, active: true, indexingStatus: true, ingestionMetadata: true,
  chunks: { orderBy: { position: 'asc' }, take: 5001, select: { id: true, position: true, content: true, metadata: true } } };

function verifySource(doc, prepared) {
  if (!doc) throw new EmbeddingError('DOCUMENT_NOT_INGESTED');
  const { source, contentSha256, ingestionMetadata, chunks } = prepared;
  if (['REJECTED', 'ARCHIVED'].includes(doc.status)) throw new EmbeddingError('DOCUMENT_NOT_ELIGIBLE');
  if (doc.kind !== source.kind || doc.classification !== source.classification || doc.source !== source.filename || doc.title !== source.title ||
    doc.contentSha256 !== contentSha256 || doc.ingestionMetadata?.fingerprint !== ingestionMetadata.fingerprint ||
    doc.ingestionMetadata?.sourceUse !== source.sourceUse || !doc.chunks.length || doc.chunks.length !== chunks.length ||
    doc.chunks.some((chunk, i) => chunk.position !== chunks[i].position || chunk.content !== chunks[i].content ||
      !isDeepStrictEqual(chunk.metadata, chunks[i].metadata))) throw new EmbeddingError('SOURCE_MISMATCH');
}

async function lockedDocument(tx, source) {
  const doc = await tx.knowledgeDocument.findUnique({ where: identity(source), select: { id: true } });
  if (!doc) throw new EmbeddingError('DOCUMENT_NOT_INGESTED');
  await tx.$queryRaw`SELECT id FROM knowledge_documents WHERE id = ${doc.id}::uuid FOR UPDATE`;
  // Serialize chunk edits until this short transaction ends.
  await tx.$queryRaw`SELECT id FROM document_chunks WHERE "documentId" = ${doc.id}::uuid ORDER BY position FOR UPDATE`;
  return tx.knowledgeDocument.findUnique({ where: { id: doc.id }, select: projection });
}

async function indexComplete(tx, doc, fingerprint, model) {
  if (doc.indexingStatus !== 'INDEXED' || doc.ingestionMetadata?.index?.fingerprint !== fingerprint) return false;
  const rows = await tx.$queryRaw`SELECT count(*)::int AS count FROM document_chunks
    WHERE "documentId" = ${doc.id}::uuid AND embedding IS NOT NULL AND "embeddingModel" = ${model}`;
  return rows[0].count === doc.chunks.length;
}

async function audit(tx, actorId, documentId, action, metadata, outcome = 'SUCCESS') {
  await tx.auditLog.create({ data: { actorId, action, resourceType: 'KNOWLEDGE_DOCUMENT', resourceId: documentId,
    outcome, metadata, retentionUntil: new Date(Date.now() + 90 * 86400000) } });
}

export async function previewIndex(database, entry, config, { root = KNOWLEDGE_ROOT } = {}) {
  const prepared = await prepareSource(entry, root);
  const inputBytes = prepared.chunks.reduce((sum, chunk) => sum + inputByteBound(chunk.content), 0);
  if (inputBytes > config.maxDocumentBytes) throw new EmbeddingError('DOCUMENT_BUDGET_EXCEEDED');
  const doc = await database.knowledgeDocument.findUnique({ where: identity(prepared.source), select: projection });
  if (doc) verifySource(doc, prepared);
  return { documentKey: entry.documentKey, documentId: doc?.id ?? null, status: doc?.indexingStatus ?? 'NOT_INGESTED',
    model: config.model, dimensions: EMBEDDING_DIMENSIONS, chunks: prepared.chunks.length, inputBytes };
}

// Operator/backend-only service. The entry must come from the reviewed local manifest.
// Source re-extraction prevents changed DB chunk text from silently being sent externally.
export async function indexSource(database, entry, actorId, { provider, config, root = KNOWLEDGE_ROOT, force = false } = {}) {
  await requireIngestionAdministrator(database, actorId);
  if (!EMBEDDING_MODELS.includes(config?.model) || provider?.model !== config.model || provider?.dimensions !== EMBEDDING_DIMENSIONS ||
    !Number.isInteger(config.maxDocumentBytes) || config.maxDocumentBytes < 8000 || config.maxDocumentBytes > 2_000_000)
    throw new EmbeddingError('EMBEDDING_CONFIGURATION_INVALID');
  const prepared = await prepareSource(entry, root);
  const inputBytes = prepared.chunks.reduce((sum, chunk) => sum + inputByteBound(chunk.content), 0);
  if (inputBytes > config.maxDocumentBytes) throw new EmbeddingError('DOCUMENT_BUDGET_EXCEEDED');
  const fingerprint = digest({ source: prepared.ingestionMetadata.fingerprint, model: config.model, dimensions: EMBEDDING_DIMENSIONS });
  const runId = randomUUID();
  const claim = await database.$transaction(async tx => {
    await requireIngestionAdministrator(tx, actorId);
    const doc = await lockedDocument(tx, prepared.source); verifySource(doc, prepared);
    const attempt = doc.ingestionMetadata.indexAttempt;
    const expiry = new Date(attempt?.expiresAt).getTime();
    if (attempt?.state === 'RUNNING' && (!Number.isFinite(expiry) || expiry > Date.now())) throw new EmbeddingError('INDEXING_BUSY');
    if (!force && await indexComplete(tx, doc, fingerprint, config.model)) return { unchanged: true, doc };
    const expiresAt = new Date(Date.now() + EMBEDDING_LIMITS.leaseMs).toISOString();
    await tx.knowledgeDocument.update({ where: { id: doc.id }, data: { indexingStatus: 'PENDING', ingestionMetadata: {
      ...doc.ingestionMetadata, externalProcessingAttempted: true,
      indexAttempt: { runId, state: 'RUNNING', model: config.model, expiresAt } } } });
    await audit(tx, actorId, doc.id, 'KNOWLEDGE_INDEXING_STARTED', { runId, model: config.model, inputByteBound: inputBytes, chunks: doc.chunks.length });
    return { doc };
  }, { timeout: 30_000 });
  if (claim.unchanged) return { status: 'UNCHANGED', documentId: claim.doc.id, chunks: claim.doc.chunks.length };
  const signal = AbortSignal.timeout(EMBEDDING_LIMITS.jobMs);
  let totalTokens = 0;
  try {
    const vectors = [];
    for (let start = 0; start < prepared.chunks.length; start += EMBEDDING_LIMITS.batchSize) {
      signal.throwIfAborted();
      // Re-check authorization/lease/source eligibility before each external request.
      await requireIngestionAdministrator(database, actorId);
      const current = await database.knowledgeDocument.findUnique({ where: { id: claim.doc.id }, select: projection });
      verifySource(current, prepared);
      if (current.ingestionMetadata.indexAttempt?.runId !== runId || current.ingestionMetadata.indexAttempt.state !== 'RUNNING')
        throw new EmbeddingError('INDEXING_SUPERSEDED');
      const input = prepared.chunks.slice(start, start + EMBEDDING_LIMITS.batchSize).map(chunk => chunk.content);
      const batch = await provider.embed(input, { signal });
      if (!Array.isArray(batch?.vectors) || batch.vectors.length !== input.length ||
        !Number.isSafeInteger(batch.totalTokens) || batch.totalTokens < 0) throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID');
      vectors.push(...batch.vectors.map(validateVector)); totalTokens += batch.totalTokens;
    }
    signal.throwIfAborted();
    return await database.$transaction(async tx => {
      await requireIngestionAdministrator(tx, actorId);
      const doc = await lockedDocument(tx, prepared.source); verifySource(doc, prepared);
      if (doc.ingestionMetadata.indexAttempt?.runId !== runId || doc.ingestionMetadata.indexAttempt.state !== 'RUNNING' ||
        new Date(doc.ingestionMetadata.indexAttempt.expiresAt).getTime() <= Date.now() ||
        digest(doc.chunks.map(c => [c.id, c.content])) !== digest(claim.doc.chunks.map(c => [c.id, c.content])))
        throw new EmbeddingError('INDEXING_SUPERSEDED');
      for (let i = 0; i < doc.chunks.length; i++) {
        const vector = JSON.stringify(vectors[i]);
        const changed = await tx.$executeRaw`UPDATE document_chunks SET embedding = ${vector}::vector,
          "embeddingModel" = ${config.model}, "updatedAt" = now() WHERE id = ${doc.chunks[i].id}::uuid AND "documentId" = ${doc.id}::uuid`;
        if (changed !== 1) throw new EmbeddingError('INDEXING_SUPERSEDED');
      }
      const metadata = { ...doc.ingestionMetadata, index: { fingerprint, model: config.model, dimensions: EMBEDDING_DIMENSIONS,
        indexedAt: new Date().toISOString(), chunkCount: doc.chunks.length },
        externalProcessingPerformed: true, indexAttempt: { runId, state: 'COMPLETED', totalTokens } };
      await tx.knowledgeDocument.update({ where: { id: doc.id }, data: { indexingStatus: 'INDEXED', ingestionMetadata: metadata } });
      await audit(tx, actorId, doc.id, 'KNOWLEDGE_INDEXED', { runId, model: config.model, chunks: doc.chunks.length, totalTokens });
      return { status: 'INDEXED', documentId: doc.id, chunks: doc.chunks.length, model: config.model, totalTokens };
    }, { timeout: 30_000 });
  } catch (error) {
    const code = error instanceof EmbeddingError ? error.code : 'INDEXING_FAILED';
    // Failure marking is best-effort; a database outage leaves the lease to expire.
    try {
      await database.$transaction(async tx => {
        const doc = await lockedDocument(tx, prepared.source);
        if (doc.ingestionMetadata.indexAttempt?.runId !== runId || doc.ingestionMetadata.indexAttempt?.state !== 'RUNNING') return;
        await tx.knowledgeDocument.update({ where: { id: doc.id }, data: { indexingStatus: 'ERROR', ingestionMetadata: {
          ...doc.ingestionMetadata, indexAttempt: { runId, state: 'FAILED', code, totalTokens, billingMayBeIncomplete: true } } } });
        await audit(tx, actorId, doc.id, 'KNOWLEDGE_INDEXING_FAILED', { runId, code, totalTokens, billingMayBeIncomplete: true }, 'FAILURE');
      }, { timeout: 30_000 });
    } catch { /* No provider payloads or database details may escape to logs. */ }
    throw new EmbeddingError(code);
  }
}
