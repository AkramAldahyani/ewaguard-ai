import { findActiveUser } from '../auth/auth-service.js';
import { UUID } from '../ai/chat-policy.js';
import { verifyAcknowledgement } from '../disclaimers/disclaimer-service.js';
import { createEmbeddingAdapter } from './openai-embeddings.js';
import { EMBEDDING_MODELS, EMBEDDING_DIMENSIONS, EmbeddingError } from './embedding-policy.js';
import { RETRIEVAL_LIMITS, RETRIEVAL_PRIVACY, RetrievalError, validateRetrieval } from './retrieval-policy.js';
import { hasRetrievableChunks, searchChunks } from './retrieval-store.js';

export async function requireRetrievalAccess(database, auth) {
  if (
    !auth ||
    !UUID.test(auth.userId ?? '') ||
    !UUID.test(auth.sessionId ?? '') ||
    !Number.isSafeInteger(auth.sessionVersion) ||
    !(new Date(auth.expiresAt).getTime() > Date.now()) ||
    (await database.revokedSession.findUnique({ where: { id: auth.sessionId }, select: { id: true } }))
  )
    throw new RetrievalError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  const user = await findActiveUser(database, auth.userId, auth.mfaProof, auth.sessionVersion);
  if (!user) throw new RetrievalError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (user.role !== 'EMPLOYEE') throw new RetrievalError(403, 'FORBIDDEN', 'This retrieval endpoint is for employees.');
}

async function reserve(database, userId, request, model) {
  const resourceId = `${userId}:${request.requestId}`;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  await database.$transaction(
    async (tx) => {
      // Shared across application instances; only metadata is stored, never the question.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('rag-retrieval-quota', 0))::text`;
      if (
        await tx.auditLog.findFirst({
          where: { action: 'KNOWLEDGE_RETRIEVAL_REQUESTED', resourceId },
          select: { id: true },
        })
      )
        throw new RetrievalError(
          409,
          'RETRIEVAL_ALREADY_REQUESTED',
          'This request was already submitted. Automatic replay is unavailable.',
        );
      const where = { action: 'KNOWLEDGE_RETRIEVAL_REQUESTED', createdAt: { gte: since } };
      const [personal, global] = await Promise.all([
        tx.auditLog.count({ where: { ...where, actorId: userId } }),
        tx.auditLog.count({ where }),
      ]);
      if (personal >= RETRIEVAL_LIMITS.dailyPerUser || global >= RETRIEVAL_LIMITS.dailyGlobal)
        throw new RetrievalError(429, 'RETRIEVAL_DAILY_LIMIT', 'The daily retrieval limit has been reached.');
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'KNOWLEDGE_RETRIEVAL_REQUESTED',
          resourceType: 'KNOWLEDGE_RETRIEVAL',
          resourceId,
          outcome: 'SUCCESS',
          metadata: {
            category: request.category,
            classification: request.classification,
            model,
            privacyNoticeVersion: RETRIEVAL_PRIVACY.version,
            acknowledgementId: request.acknowledgementId,
          },
          retentionUntil: new Date(Date.now() + 90 * 86400000),
        },
      });
    },
    { timeout: 10_000 },
  );
}

export function createRetrievalService({ database, config, provider, sourceRestriction }) {
  const inFlight = new Set();
  let adapter = provider;
  return {
    async retrieve({ auth, body, signal }) {
      await requireRetrievalAccess(database, auth);
      const request = { ...validateRetrieval(body), ...sourceRestriction };
      if (request.category === 'COMPANY_POLICY') {
        if (!['development', 'test'].includes(config.nodeEnv) || config.ragDemonstrationEnabled !== true)
          throw new RetrievalError(403, 'DEMONSTRATION_MODE_REQUIRED', 'Demonstration policy retrieval is disabled.');
        request.demoEligible = true;
      }
      const acknowledgement = await verifyAcknowledgement(database, {
        acknowledgementId: request.acknowledgementId,
        userId: auth.userId,
        context: 'CHAT',
        maxAgeMs: RETRIEVAL_LIMITS.acknowledgementMs,
      });
      if (!acknowledgement)
        throw new RetrievalError(
          400,
          'RETRIEVAL_ACKNOWLEDGEMENT_REQUIRED',
          'Acknowledge the sensitive-information notice before searching.',
        );
      const model = config.openaiEmbeddingModel ?? 'text-embedding-3-small';
      if (!EMBEDDING_MODELS.includes(model))
        throw new RetrievalError(503, 'RETRIEVAL_NOT_CONFIGURED', 'Knowledge retrieval is not configured.');
      if (inFlight.has(auth.userId) || inFlight.size >= RETRIEVAL_LIMITS.simultaneousGlobal)
        throw new RetrievalError(429, 'RETRIEVAL_BUSY', 'Retrieval is busy. Try again shortly.');
      inFlight.add(auth.userId);
      try {
        const empty = {
          status: 'NO_MATCHES',
          category: request.category,
          classification: request.classification,
          matches: [],
        };
        // An empty/unpublished corpus never incurs a query-embedding charge.
        if (!(await hasRetrievableChunks(database, request, model))) return empty;
        adapter ??= createEmbeddingAdapter({ apiKey: config.openaiApiKey, model });
        if (adapter.model !== model || adapter.dimensions !== EMBEDDING_DIMENSIONS)
          throw new RetrievalError(503, 'RETRIEVAL_NOT_CONFIGURED', 'Knowledge retrieval is not configured.');
        signal?.throwIfAborted();
        await reserve(database, auth.userId, request, model);
        const result = await adapter.embed([request.question], { signal });
        signal?.throwIfAborted();
        if (result?.vectors?.length !== 1) throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID');
        await requireRetrievalAccess(database, auth);
        const matches = await searchChunks(database, request, model, result.vectors[0]);
        // Revalidate revocation/suspension after database search as well as after network IO.
        await requireRetrievalAccess(database, auth);
        return { ...empty, status: matches.length ? 'MATCHES' : 'NO_MATCHES', matches };
      } catch (error) {
        if (error instanceof EmbeddingError)
          throw new RetrievalError(
            503,
            'RETRIEVAL_PROVIDER_UNAVAILABLE',
            'Knowledge retrieval is temporarily unavailable.',
          );
        throw error;
      } finally {
        inFlight.delete(auth.userId);
      }
    },
  };
}
