import { randomUUID } from 'node:crypto';
import { CHAT_LIMITS, ChatError, INSTRUCTION_VERSION, PRIVACY_NOTICE, SYSTEM_INSTRUCTIONS, estimatedMicros } from './chat-policy.js';
import { withUsageLock } from './chat-service.js';
import { responseToolSchemas } from './tool-orchestration.js';
import { providerError } from './openai-adapter.js';
import { PDPL_RESPONSE_FORMAT, groundedResponseFormat } from '../rag/pdpl-response-format.js';
import { COMPANY_RESPONSE_FORMAT } from '../rag/company-answer.js';

export function inputBound(input, enableTools, pdplResponse = false, companyResponse = false, answerFormat) {
  return Buffer.byteLength(SYSTEM_INSTRUCTIONS) + Buffer.byteLength(JSON.stringify(input)) +
    (enableTools ? Buffer.byteLength(JSON.stringify(responseToolSchemas)) : 0) +
    (answerFormat ? Buffer.byteLength(JSON.stringify(answerFormat)) : companyResponse ? Buffer.byteLength(JSON.stringify(COMPANY_RESPONSE_FORMAT)) : pdplResponse ? Buffer.byteLength(JSON.stringify(PDPL_RESPONSE_FORMAT)) : 0) + 4096;
}

export async function reconcileAmbiguousUsage(tx, now = new Date()) {
  // Every request is charged its conservative maximum before provider I/O. If a
  // process crashes or usage cannot be verified, keep that full charge and close
  // the unusable reservation so one ambiguous call cannot pause the whole app.
  return tx.aiUsage.updateMany({
    where: { OR: [
      { status: 'UNKNOWN' },
      { status: 'RESERVED', updatedAt: { lt: new Date(now.getTime() - 60_000) } },
    ] },
    data: { status: 'FAILED' },
  });
}

export async function checkUsageAdmission(tx, userId, reservedMicros, now = new Date()) {
  const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
  await reconcileAmbiguousUsage(tx, now);
  if (await tx.aiUsage.count({ where: { userId, createdAt: { gte: day } } }) >= CHAT_LIMITS.dailyRequests) throw new ChatError(429, 'CHAT_DAILY_LIMIT', 'Your daily AI request limit has been reached.');
  const sum = await tx.aiUsage.aggregate({ _sum: { chargedMicros: true } });
  if ((sum._sum.chargedMicros ?? 0) + reservedMicros > CHAT_LIMITS.budgetMicros) throw new ChatError(503, 'AI_BUDGET_EXHAUSTED', 'The application AI budget has been reached.');
}

export async function paidRound({ database, provider, root, input, enableTools, round, signal, maxOutputTokens, pricing, pdplResponse = false, companyResponse = false, references = [] }) {
  const answerFormat = references.length ? groundedResponseFormat(companyResponse ? COMPANY_RESPONSE_FORMAT : PDPL_RESPONSE_FORMAT, references) : undefined;
  let entry = root;
  if (round > 0) {
    // verify() fails closed on stale/unknown pricing; it never switches models.
    pricing = await provider.verify();
    const inputTokenBound = inputBound(input, enableTools, pdplResponse, companyResponse, answerFormat);
    const reservedMicros = estimatedMicros(inputTokenBound, maxOutputTokens, pricing);
    entry = await withUsageLock(database, async (tx) => {
      const active = await tx.aiUsage.findUnique({ where: { id: root.id } });
      if (active?.status !== 'RESERVED') throw new ChatError(409, 'CHAT_REQUEST_ALREADY_USED', 'This request has already been attempted.');
      await checkUsageAdmission(tx, root.userId, reservedMicros);
      // Root stays RESERVED until the entire turn finishes. Children are separate
      // paid requests, but do not consume a second application/conversation slot.
      await tx.aiUsage.update({ where: { id: root.id }, data: { updatedAt: new Date() } });
      return tx.aiUsage.create({ data: { userId: root.userId, sessionId: root.sessionId,
        requestId: randomUUID(), parentRequestId: root.requestId, model: provider.model,
        pricingVersion: pricing.version, instructionVersion: INSTRUCTION_VERSION, privacyNoticeVersion: PRIVACY_NOTICE.version,
        inputTokenBound, outputTokenBound: maxOutputTokens, reservedMicros, chargedMicros: reservedMicros } });
    });
  }
  let response;
  try {
    if (signal?.aborted) throw new ChatError(499, 'CHAT_CANCELLED', 'The request was cancelled.');
    response = await provider.respond(input, { signal, maxOutputTokens, enableTools, pdplResponse, companyResponse, answerFormat, routeTurn: round === 0 && enableTools });
  } catch (error) {
    await withUsageLock(database, (tx) => tx.aiUsage.updateMany({ where: { id: entry.id, status: 'RESERVED' }, data: { status: 'FAILED' } }));
    throw providerError(error);
  }
  const usage = response?.usage;
  const known = Number.isSafeInteger(usage?.input_tokens) && usage.input_tokens >= 0 &&
    Number.isSafeInteger(usage?.output_tokens) && usage.output_tokens >= 0 &&
    usage.input_tokens <= entry.inputTokenBound && usage.output_tokens <= entry.outputTokenBound &&
    response.model === provider.model && (!response.service_tier || response.service_tier === 'default');
  if (!known) {
    await withUsageLock(database, (tx) => tx.aiUsage.updateMany({ where: { id: entry.id, status: 'RESERVED' }, data: { status: 'FAILED' } }));
    throw new ChatError(503, 'AI_USAGE_REVIEW_REQUIRED', 'AI usage could not be verified. The request was conservatively charged and closed.');
  }
  await withUsageLock(database, (tx) => tx.aiUsage.update({ where: { id: entry.id }, data: {
    inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
    chargedMicros: estimatedMicros(usage.input_tokens, usage.output_tokens, pricing),
    ...(round > 0 ? { status: 'COMPLETED' } : {}),
  } }));
  return response;
}
