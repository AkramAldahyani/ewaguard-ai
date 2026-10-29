import { Prisma } from '../generated/prisma/client.ts';
import { EMBEDDING_DIMENSIONS, validateVector } from './embedding-policy.js';
import { RETRIEVAL_LIMITS } from './retrieval-policy.js';
import { DEMO_POLICY_NOTICE } from './company-source.js';

// Fixed SQL fragments only; filters, model and vectors are bound parameters.
function eligibility(filters, model) {
  const publication = filters.category === 'COMPANY_POLICY' ? Prisma.sql`
    ${filters.demoEligible === true && filters.classification === 'DEMONSTRATION' && filters.approvalStatus === 'NOT_OFFICIALLY_APPROVED'}
    AND d.status = 'DRAFT' AND d.active = false AND d."approvedAt" IS NULL AND d."approvedById" IS NULL
    AND d."ingestionMetadata"->>'sourceUse' = 'DEMONSTRATION'
    AND d."ingestionMetadata"->'policySource'->>'demonstrationNoticePresent' = 'true'
    AND d."ingestionMetadata"->'demoEligibility'->>'state' = 'ENABLED'
    AND d."ingestionMetadata"->'demoEligibility'->>'reviewedById' IS NOT NULL
    AND d."ingestionMetadata"->'demoEligibility'->>'reviewedAt' IS NOT NULL
    AND d."ingestionMetadata"->'demoEligibility'->>'contentSha256' = d."contentSha256"
    AND d."ingestionMetadata"->'demoEligibility'->>'fingerprint' = d."ingestionMetadata"->>'fingerprint'`
    : Prisma.sql`d.status = ${filters.approvalStatus}::"ApprovalStatus" AND d.active = true AND d."approvedAt" IS NOT NULL AND d."approvedById" IS NOT NULL`;
  return Prisma.sql`d.kind = ${filters.category}::"DocumentKind"
    AND (${publication})
    AND d."indexingStatus" = 'INDEXED' AND d.classification = ${filters.classification}
    AND d."ingestionMetadata"->'index'->>'model' = ${model}
    AND d."ingestionMetadata"->'index'->'dimensions' = ${String(EMBEDDING_DIMENSIONS)}::jsonb
    AND d."ingestionMetadata"->>'referenceTrust' = 'UNTRUSTED'
    AND c."embeddingModel" = ${model} AND c.embedding IS NOT NULL
    AND c.metadata->>'referenceTrust' = 'UNTRUSTED'
    AND length(c.content) BETWEEN 1 AND 1600
    ${filters.pdplContext || filters.companyContext ? Prisma.sql`AND c.metadata->>'section' IS NOT NULL` : Prisma.empty}
    ${filters.documentKey ? Prisma.sql`AND d."documentKey" = ${filters.documentKey} AND d."contentSha256" = ${filters.contentSha256}` : Prisma.empty}`;
}

function project(row) {
  return { chunkId: row.chunkId, excerpt: row.content, similarity: row.similarity == null ? null : Math.min(1, row.similarity),
    source: { documentId: row.documentId, documentKey: row.documentKey, title: row.title,
      filename: typeof row.filename === 'string' && !/[\\/]/.test(row.filename) ? row.filename : null,
      category: row.kind, version: row.version, approvalStatus: row.kind === 'COMPANY_POLICY' ? 'NOT_OFFICIALLY_APPROVED' : 'APPROVED', classification: row.classification,
      ...(row.kind === 'COMPANY_POLICY' ? { notice: DEMO_POLICY_NOTICE, documentStatus: 'DRAFT',
        policyId: row.policySource?.policyId ?? null, sourceTitle: row.policySource?.sourceTitle ?? null,
        sourceVersionDate: row.policySource?.sourceVersionDate ?? null, sourceStatus: row.policySource?.sourceStatus ?? null } : {}),
      page: Number.isInteger(row.metadata?.page) && row.metadata.page > 0 ? row.metadata.page : null,
      section: typeof row.metadata?.section === 'string' && row.metadata.section.length <= 500 ? row.metadata.section : null,
      chunkPosition: row.position }, referenceTrust: 'UNTRUSTED' };
}

// Backend receipt recovery only: caller supplies IDs from its owned request record.
export async function readReferenceChunks(database, filters, model, ids) {
  if (!ids.length) return [];
  const rows = await database.$queryRaw`SELECT c.id AS "chunkId", c.position, c.content, c.metadata,
    d.id AS "documentId", d."documentKey", d.title, d.filename, d.kind, d.version, d.classification, d."ingestionMetadata"->'policySource' AS "policySource"
    FROM document_chunks c JOIN knowledge_documents d ON d.id = c."documentId"
    WHERE ${eligibility(filters, model)} AND c.id IN (${Prisma.join(ids)})`;
  return ids.map(id => rows.find(row => row.chunkId === id)).filter(Boolean).map(project);
}

export async function hasRetrievableChunks(database, filters, model) {
  const rows = await database.$queryRaw`SELECT EXISTS (SELECT 1 FROM document_chunks c
    JOIN knowledge_documents d ON d.id = c."documentId" WHERE ${eligibility(filters, model)}) AS available`;
  return rows[0].available;
}

export function isPdplDefinitionQuestion(question = '') {
  return /\b(?:define|definition|meaning|mean|what (?:is|are))\b/i.test(question) ||
    /\bwhat does\b[^?\n]*\b(?:PDPL|law)\b[^?\n]*\bsay about\s+(?:sensitive\s+)?personal data\s*[?.!]*$/i.test(question.trim());
}

// Hybrid ranking adds discriminating terms to vector similarity without another
// provider call. Generic corpus/jurisdiction words otherwise dominate short questions.
export function retrievalTerms(question = '') {
  const stop = new Set('what which who how why when where can could may should must does do is are be the a an and or to of in on for about our company organizational policy policies bahrain pdpl law under have has say says employee employees individual individuals people companies work workplace requirements rules personal data information according without with this that it its use using'.split(' '));
  return [...new Set((question.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(word => !stop.has(word)))].slice(0, 24).join(' | ');
}

export async function searchChunks(database, filters, model, vector) {
  const encoded = JSON.stringify(validateVector(vector));
  // Only the trusted PDPL adapter enables article-aware context. The generic
  // endpoint cannot request this option. Keep continuation pages as separate sources.
  const article = filters.pdplContext ? filters.question?.match(/\barticle\s*\(?\s*([1-9]\d?)\)?\b/i)?.[1] : null;
  const requestedSection = article ? `PDPL Article (${article})` : '';
  const definitionQuestion = Boolean(filters.pdplContext && !article && isPdplDefinitionQuestion(filters.question));
  const lexical = filters.pdplContext || filters.companyContext ? retrievalTerms(filters.question) : '';
  return database.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
    // Exact search over already-authorized candidates avoids filtered ANN recall gaps
    // for this small corpus. Keep HNSW intact for later measured optimization.
    const rows = await tx.$queryRaw`WITH eligible AS MATERIALIZED (
      SELECT c.id AS "chunkId", c.position, c.content, c.metadata, c.embedding,
        d.id AS "documentId", d."documentKey", d.title, d.filename, d.kind, d.version, d.classification, d."ingestionMetadata"->'policySource' AS "policySource"
      FROM document_chunks c JOIN knowledge_documents d ON d.id = c."documentId"
      WHERE ${eligibility(filters, model)}
    ), similarities AS (
      SELECT *, 1 - (embedding <=> ${encoded}::vector) AS similarity FROM eligible
    ), ranked AS (
      SELECT *, similarity + ${lexical ? Prisma.sql`0.6 * ts_rank_cd(
        setweight(to_tsvector('english', left(content, 180)), 'A') || setweight(to_tsvector('english', content), 'B'),
        to_tsquery('english', ${lexical}), 32)` : Prisma.sql`0`} AS relevance FROM similarities
    ), anchor AS (
      SELECT * FROM ranked WHERE similarity >= ${RETRIEVAL_LIMITS.minimumSimilarity} AND similarity <= 1.000001
      ORDER BY (metadata->>'section' = ${requestedSection}) DESC NULLS LAST,
        (${definitionQuestion} AND content LIKE ${'Article (%)\nDefinitions\n%'}) DESC,
        relevance DESC, "documentId", position LIMIT 1
    ) SELECT "chunkId", position, content, metadata, "documentId", "documentKey", title,
      filename, kind, version, classification, "policySource", similarity FROM ranked
      WHERE (similarity >= ${RETRIEVAL_LIMITS.minimumSimilarity} AND similarity <= 1.000001)
        OR (${Boolean(filters.pdplContext)} AND EXISTS (SELECT 1 FROM anchor a WHERE a."documentId" = ranked."documentId"
          AND a.metadata->>'section' = ranked.metadata->>'section' AND abs(a.position - ranked.position) = 1))
      ORDER BY ${filters.pdplContext ? Prisma.sql`CASE
        WHEN "chunkId" = (SELECT "chunkId" FROM anchor) THEN 0
        WHEN EXISTS (SELECT 1 FROM anchor a WHERE a."documentId" = ranked."documentId"
          AND a.metadata->>'section' = ranked.metadata->>'section' AND abs(a.position - ranked.position) = 1) THEN 1
        ELSE 2 END,` : Prisma.empty}
        relevance DESC, "documentId", position LIMIT ${filters.limit}`;
    return rows.map(project);
  }, { timeout: 10_000 });
}
