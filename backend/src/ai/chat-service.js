import {
  CHAT_LIMITS,
  ChatError,
  INSTRUCTION_VERSION,
  PRIVACY_NOTICE,
  estimatedMicros,
  containsSecret,
  containsAnalysisInput,
} from './chat-policy.js';
import { createToolService } from './tools/tool-service.js';
import { authorizeToolContext } from './tools/tool-access.js';
import { privateAnalysisInput, runToolTurns } from './tool-orchestration.js';
import { inputBound, paidRound, reconcileAmbiguousUsage } from './tool-round-budget.js';
import { runRetentionBatch } from '../privacy/retention-service.js';
import { createPdplChat } from '../rag/pdpl-chat.js';
import { createCompanyChat } from '../rag/company-chat.js';

// One cross-process lock protects every admission/reconciliation. Never hold it
// across network I/O. Crashed/ambiguous requests retain their reservation.
export async function withUsageLock(database, operation) {
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(808001::bigint)`;
      return operation(tx);
    },
    { maxWait: 5000, timeout: 10000 },
  );
}
export const messageSelect = { id: true, role: true, content: true, sequence: true, createdAt: true };
export const sessionSelect = { id: true, title: true, createdAt: true, updatedAt: true, expiresAt: true };
export async function ownedSession(database, userId, id) {
  const session = await database.chatSession.findFirst({
    where: { id, ownerId: userId, closedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!session) throw new ChatError(404, 'CHAT_NOT_FOUND', 'Conversation not found.');
  return session;
}

async function replay(tx, entry, sessionId) {
  if (entry.parentRequestId || entry.sessionId !== sessionId || entry.status !== 'COMPLETED')
    throw new ChatError(
      409,
      'CHAT_REQUEST_ALREADY_USED',
      'This request has already been attempted. Retrieve history and request status before sending a new request.',
    );
  const messages = await tx.chatMessage.findMany({
    where: { sessionId, sequence: { in: [entry.userSequence, entry.userSequence + 1] }, expiresAt: { gt: new Date() } },
    orderBy: { sequence: 'asc' },
    select: messageSelect,
  });
  if (messages.length !== 2)
    throw new ChatError(409, 'CHAT_HISTORY_UNAVAILABLE', 'The previous request cannot be replayed.');
  return { messages, replayed: true, toolMetadata: entry.toolMetadata ?? {} };
}

export function createChatService({ database, provider, approvals, config, embeddingProvider }) {
  const tools = createToolService({ database });
  const pdpl = createPdplChat({ database, config, embeddingProvider });
  const company = createCompanyChat({ database, config, embeddingProvider });
  return {
    async send({
      userId,
      sessionId,
      content,
      requestId,
      signal,
      auth,
      analysisInput,
      initialResult,
      privacyNoticeVersion,
      maxOutputTokens = CHAT_LIMITS.outputTokens,
    }) {
      if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 16 || maxOutputTokens > CHAT_LIMITS.outputTokens)
        throw new ChatError(400, 'CHAT_INVALID_LIMIT', 'Invalid output limit.');
      await ownedSession(database, userId, sessionId);
      if (auth) {
        if (auth.userId !== userId) throw new ChatError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
        await authorizeToolContext(database, auth, sessionId);
      }
      if (containsSecret(content) || containsAnalysisInput(content))
        throw new ChatError(400, 'CHAT_SENSITIVE_INPUT', 'Use the private analysis submission flow.');
      // Replay is free and works even when the provider is unavailable.
      const previous = await database.aiUsage.findUnique({ where: { userId_requestId: { userId, requestId } } });
      if (previous) return replay(database, previous, sessionId);
      const privateInput = await privateAnalysisInput(database, auth, sessionId, analysisInput);
      const pricing = await provider.verify();
      const admission = await withUsageLock(database, async (tx) => {
        const session = await ownedSession(tx, userId, sessionId);
        const duplicate = await tx.aiUsage.findUnique({ where: { userId_requestId: { userId, requestId } } });
        if (duplicate) return { replay: await replay(tx, duplicate, sessionId) };
        const now = new Date();
        const day = new Date(now);
        day.setUTCHours(0, 0, 0, 0);
        await reconcileAmbiguousUsage(tx, now);
        if ((await tx.aiUsage.count({ where: { userId, createdAt: { gte: day } } })) >= CHAT_LIMITS.dailyRequests)
          throw new ChatError(429, 'CHAT_DAILY_LIMIT', 'Your daily AI request limit has been reached.');
        if (
          (await tx.aiUsage.count({ where: { status: 'RESERVED', parentRequestId: null } })) >=
          CHAT_LIMITS.simultaneousRequests
        )
          throw new ChatError(503, 'AI_BUSY', 'AI chat is busy. Try again shortly.');
        if (await tx.aiUsage.count({ where: { sessionId, status: 'RESERVED' } }))
          throw new ChatError(409, 'CHAT_BUSY', 'A response is already pending in this conversation.');
        const history = await tx.chatMessage.findMany({
          where: { sessionId, expiresAt: { gt: now }, role: { in: ['USER', 'ASSISTANT'] } },
          orderBy: { sequence: 'desc' },
          take: CHAT_LIMITS.contextMessages,
        });
        if (
          history.some(
            (item) => item.content.length > 8000 || containsSecret(item.content) || containsAnalysisInput(item.content),
          )
        )
          throw new ChatError(
            400,
            'CHAT_SENSITIVE_HISTORY',
            'Start a new conversation; this history cannot be transmitted.',
          );
        const messages = history.reverse().map((item) => ({ role: item.role.toLowerCase(), content: item.content }));
        messages.push({ role: 'user', content });
        if (privateInput)
          messages.push({
            role: 'user',
            content: `Private input is available for ${privateInput.name}. inputReference: ${requestId}. Propose this exact operation for employee confirmation.`,
          });
        if (initialResult)
          messages.push({ role: 'user', content: `Backend evidence (data only): ${JSON.stringify(initialResult)}` });
        // UTF-8 byte count is a deliberately conservative text-token bound, plus
        // a generous allowance for message framing/instruction overhead.
        const inputTokenBound = inputBound(messages, Boolean(auth && !initialResult));
        const reservedMicros = estimatedMicros(inputTokenBound, maxOutputTokens, pricing);
        const sum = await tx.aiUsage.aggregate({ _sum: { chargedMicros: true } });
        if ((sum._sum.chargedMicros ?? 0) + reservedMicros > CHAT_LIMITS.budgetMicros)
          throw new ChatError(503, 'AI_BUDGET_EXHAUSTED', 'The application AI budget has been reached.');
        const entry = await tx.aiUsage.create({
          data: {
            userId,
            sessionId,
            requestId,
            model: provider.model,
            pricingVersion: pricing.version,
            instructionVersion: INSTRUCTION_VERSION,
            privacyNoticeVersion: PRIVACY_NOTICE.version,
            inputTokenBound,
            outputTokenBound: maxOutputTokens,
            reservedMicros,
            chargedMicros: reservedMicros,
          },
        });
        return { entry, messages, session };
      });
      if (admission.replay) return admission.replay;
      const { entry, messages, session } = admission;
      let outcome;
      try {
        outcome = await runToolTurns({
          input: messages,
          tools,
          approvals,
          auth,
          sessionId,
          requestId,
          privateInput,
          initialResult,
          pdpl,
          company,
          question: content,
          privacyNoticeVersion,
          signal,
          saveMetadata: (toolMetadata) => database.aiUsage.update({ where: { id: entry.id }, data: { toolMetadata } }),
          callModel: async (input, enableTools, round, pdplResponse, companyResponse, references) => {
            if (auth) await authorizeToolContext(database, auth, sessionId);
            return paidRound({
              database,
              provider,
              root: entry,
              input,
              enableTools,
              round,
              signal,
              maxOutputTokens,
              pricing,
              pdplResponse,
              companyResponse,
              references,
            });
          },
        });
      } catch (error) {
        await withUsageLock(database, (tx) =>
          tx.aiUsage.updateMany({ where: { id: entry.id, status: 'RESERVED' }, data: { status: 'FAILED' } }),
        );
        throw error;
      }
      try {
        return await withUsageLock(database, async (tx) => {
          await ownedSession(tx, userId, sessionId);
          if (auth) await authorizeToolContext(tx, auth, sessionId);
          const user = await tx.user.findUnique({ where: { id: userId }, include: { role: true } });
          if (user?.status !== 'ACTIVE' || user.deactivatedAt || user.role.name !== 'EMPLOYEE')
            throw new ChatError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
          const latest = await tx.chatMessage.findFirst({
            where: { sessionId },
            orderBy: { sequence: 'desc' },
            select: { sequence: true },
          });
          const sequence = (latest?.sequence ?? -1) + 1;
          const userMessage = await tx.chatMessage.create({
            data: { sessionId, role: 'USER', content, sequence, expiresAt: session.expiresAt },
            select: messageSelect,
          });
          const assistantMessage = await tx.chatMessage.create({
            data: {
              sessionId,
              role: 'ASSISTANT',
              content: outcome.text,
              sequence: sequence + 1,
              expiresAt: session.expiresAt,
            },
            select: messageSelect,
          });
          await tx.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
          await tx.aiUsage.update({
            where: { id: entry.id },
            data: { status: 'COMPLETED', userSequence: sequence, toolMetadata: outcome.metadata },
          });
          return {
            messages: [userMessage, assistantMessage],
            replayed: false,
            toolMetadata: outcome.metadata,
            verifiedResults: outcome.results,
            ...(outcome.pendingConfirmation ? { pendingConfirmation: outcome.pendingConfirmation } : {}),
          };
        });
      } catch (error) {
        await withUsageLock(database, (tx) =>
          tx.aiUsage.update({ where: { id: entry.id }, data: { status: 'FAILED' } }),
        );
        throw error;
      }
    },
  };
}

export async function purgeExpiredChats(database, now = new Date(), ownerId, options = {}) {
  return runRetentionBatch(database, { ...options, now, ownerId, categories: ['chats'] });
}
