import { CHAT_LIMITS, ChatError, INSTRUCTION_VERSION, PRIVACY_NOTICE, SYSTEM_INSTRUCTIONS, estimatedMicros, containsSecret } from './chat-policy.js';
import { responseText, providerError } from './openai-adapter.js';

// One cross-process lock protects every admission/reconciliation. Never hold it
// across network I/O. Crashed/ambiguous requests retain their reservation.
export async function withUsageLock(database, operation) {
  return database.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(808001::bigint)`;
    return operation(tx);
  }, { maxWait: 5000, timeout: 10000 });
}
export const messageSelect = { id: true, role: true, content: true, sequence: true, createdAt: true };
export const sessionSelect = { id: true, title: true, createdAt: true, updatedAt: true, expiresAt: true };
export async function ownedSession(database, userId, id) {
  const session = await database.chatSession.findFirst({ where: { id, ownerId: userId, closedAt: null, expiresAt: { gt: new Date() } } });
  if (!session) throw new ChatError(404, 'CHAT_NOT_FOUND', 'Conversation not found.');
  return session;
}

async function replay(tx, entry, sessionId) {
  if (entry.sessionId !== sessionId || entry.status !== 'COMPLETED') throw new ChatError(409, 'CHAT_REQUEST_ALREADY_USED', 'This request has already been attempted. Retrieve history before sending a new request.');
  const messages = await tx.chatMessage.findMany({ where: { sessionId, sequence: { in: [entry.userSequence, entry.userSequence + 1] }, expiresAt: { gt: new Date() } }, orderBy: { sequence: 'asc' }, select: messageSelect });
  if (messages.length !== 2) throw new ChatError(409, 'CHAT_HISTORY_UNAVAILABLE', 'The previous request cannot be replayed.');
  return { messages, replayed: true };
}

export function createChatService({ database, provider }) {
  return {
    async send({ userId, sessionId, content, requestId, signal, maxOutputTokens = CHAT_LIMITS.outputTokens }) {
      if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 16 || maxOutputTokens > CHAT_LIMITS.outputTokens) throw new ChatError(400, 'CHAT_INVALID_LIMIT', 'Invalid output limit.');
      await ownedSession(database, userId, sessionId);
      // Replay is free and works even when the provider is unavailable.
      const previous = await database.aiUsage.findUnique({ where: { userId_requestId: { userId, requestId } } });
      if (previous) return replay(database, previous, sessionId);
      const pricing = await provider.verify();
      const admission = await withUsageLock(database, async (tx) => {
        const session = await ownedSession(tx, userId, sessionId);
        const duplicate = await tx.aiUsage.findUnique({ where: { userId_requestId: { userId, requestId } } });
        if (duplicate) return { replay: await replay(tx, duplicate, sessionId) };
        const now = new Date();
        const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
        if (await tx.aiUsage.count({ where: { OR: [{ status: 'UNKNOWN' }, { status: 'RESERVED', createdAt: { lt: new Date(now.getTime() - 60_000) } }] } })) {
          throw new ChatError(503, 'AI_USAGE_REVIEW_REQUIRED', 'AI usage requires administrator billing review.');
        }
        if (await tx.aiUsage.count({ where: { userId, createdAt: { gte: day } } }) >= CHAT_LIMITS.dailyRequests) throw new ChatError(429, 'CHAT_DAILY_LIMIT', 'Your daily AI request limit has been reached.');
        if (await tx.aiUsage.count({ where: { status: 'RESERVED' } }) >= CHAT_LIMITS.simultaneousRequests) throw new ChatError(503, 'AI_BUSY', 'AI chat is busy. Try again shortly.');
        if (await tx.aiUsage.count({ where: { sessionId, status: 'RESERVED' } })) throw new ChatError(409, 'CHAT_BUSY', 'A response is already pending in this conversation.');
        const history = await tx.chatMessage.findMany({ where: { sessionId, expiresAt: { gt: now }, role: { in: ['USER', 'ASSISTANT'] } }, orderBy: { sequence: 'desc' }, take: CHAT_LIMITS.contextMessages });
        if (history.some((item) => item.content.length > 8000 || containsSecret(item.content))) throw new ChatError(400, 'CHAT_SENSITIVE_HISTORY', 'Start a new conversation; this history cannot be transmitted.');
        const messages = history.reverse().map((item) => ({ role: item.role.toLowerCase(), content: item.content }));
        messages.push({ role: 'user', content });
        // UTF-8 byte count is a deliberately conservative text-token bound, plus
        // a generous allowance for message framing/instruction overhead.
        const inputTokenBound = Buffer.byteLength(SYSTEM_INSTRUCTIONS) + Buffer.byteLength(JSON.stringify(messages)) + 4096;
        const reservedMicros = estimatedMicros(inputTokenBound, maxOutputTokens, pricing);
        const sum = await tx.aiUsage.aggregate({ _sum: { chargedMicros: true } });
        if ((sum._sum.chargedMicros ?? 0) + reservedMicros > CHAT_LIMITS.budgetMicros) throw new ChatError(503, 'AI_BUDGET_EXHAUSTED', 'The application AI budget has been reached.');
        const entry = await tx.aiUsage.create({ data: { userId, sessionId, requestId, model: provider.model,
          pricingVersion: pricing.version, instructionVersion: INSTRUCTION_VERSION, privacyNoticeVersion: PRIVACY_NOTICE.version,
          inputTokenBound, outputTokenBound: maxOutputTokens, reservedMicros, chargedMicros: reservedMicros } });
        return { entry, messages, session };
      });
      if (admission.replay) return admission.replay;
      const { entry, messages, session } = admission;
      let response;
      try {
        if (signal?.aborted) throw new ChatError(499, 'CHAT_CANCELLED', 'The request was cancelled.');
        response = await provider.respond(messages, { signal, maxOutputTokens });
      } catch (error) {
        // Even timeouts/network failures may have incurred a charge. Do not
        // release funds automatically or retry a potentially billed request.
        await withUsageLock(database, (tx) => tx.aiUsage.update({ where: { id: entry.id }, data: { status: 'UNKNOWN' } }));
        throw providerError(error);
      }
      const usage = response?.usage;
      const usageKnown = Number.isSafeInteger(usage?.input_tokens) && usage.input_tokens >= 0 &&
        Number.isSafeInteger(usage?.output_tokens) && usage.output_tokens >= 0 &&
        usage.input_tokens <= entry.inputTokenBound && usage.output_tokens <= entry.outputTokenBound &&
        response.model === provider.model &&
        (!response.service_tier || response.service_tier === 'default');
      if (!usageKnown) {
        await withUsageLock(database, (tx) => tx.aiUsage.update({ where: { id: entry.id }, data: { status: 'UNKNOWN' } }));
        throw new ChatError(503, 'AI_USAGE_REVIEW_REQUIRED', 'AI usage could not be verified. Further requests require billing review.');
      }
      const chargedMicros = estimatedMicros(usage.input_tokens, usage.output_tokens, pricing);
      // Account for known usage even when validation or storage subsequently fails.
      await withUsageLock(database, (tx) => tx.aiUsage.update({ where: { id: entry.id }, data: {
        inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, chargedMicros,
      } }));
      let text;
      try { text = responseText(response); }
      catch (error) {
        await withUsageLock(database, (tx) => tx.aiUsage.update({ where: { id: entry.id }, data: { status: 'FAILED' } }));
        throw error;
      }
      try {
        return await withUsageLock(database, async (tx) => {
          await ownedSession(tx, userId, sessionId);
          const user = await tx.user.findUnique({ where: { id: userId }, include: { role: true } });
          if (user?.status !== 'ACTIVE' || user.deactivatedAt || user.role.name !== 'EMPLOYEE') throw new ChatError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
          const latest = await tx.chatMessage.findFirst({ where: { sessionId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
          const sequence = (latest?.sequence ?? -1) + 1;
          const userMessage = await tx.chatMessage.create({ data: { sessionId, role: 'USER', content, sequence, expiresAt: session.expiresAt }, select: messageSelect });
          const assistantMessage = await tx.chatMessage.create({ data: { sessionId, role: 'ASSISTANT', content: text, sequence: sequence + 1, expiresAt: session.expiresAt }, select: messageSelect });
          await tx.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
          await tx.aiUsage.update({ where: { id: entry.id }, data: { status: 'COMPLETED', userSequence: sequence } });
          return { messages: [userMessage, assistantMessage], replayed: false };
        });
      } catch (error) {
        await withUsageLock(database, (tx) => tx.aiUsage.update({ where: { id: entry.id }, data: { status: 'FAILED' } }));
        throw error;
      }
    },
  };
}

export async function purgeExpiredChats(database, now = new Date(), ownerId) {
  // Usage survives via SET NULL, so deleting history never replenishes budget.
  return withUsageLock(database, (tx) => tx.chatSession.deleteMany({ where: { ...(ownerId ? { ownerId } : {}), expiresAt: { lte: now }, aiUsage: { none: { status: 'RESERVED' } } } }));
}
