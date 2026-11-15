import { UUID } from '../chat-policy.js';
import { ownedSession } from '../chat-service.js';
import { verifyAcknowledgement } from '../../disclaimers/disclaimer-service.js';
import { DISCLAIMER_DEFINITION } from '../../../../shared/disclaimer.js';
import { TOOL_LIMITS, ToolError } from './tool-registry.js';

export function requireActiveSession(auth) {
  if (
    !auth ||
    typeof auth.userId !== 'string' ||
    !UUID.test(auth.userId) ||
    typeof auth.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(auth.expiresAt)) ||
    Date.parse(auth.expiresAt) <= Date.now()
  ) {
    throw new ToolError(401, 'TOOL_AUTHENTICATION_REQUIRED', 'An active authenticated session is required.');
  }
}

// auth must originate in createAuthenticate, never a client/model parameter.
export async function authorizeToolContext(database, auth, conversationId) {
  requireActiveSession(auth);
  const user = await database.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, status: true, deactivatedAt: true, role: { select: { name: true } } },
  });
  if (!user || user.status !== 'ACTIVE' || user.deactivatedAt)
    throw new ToolError(401, 'TOOL_AUTHENTICATION_REQUIRED', 'An active authenticated session is required.');
  if (user.role.name !== 'EMPLOYEE') throw new ToolError(403, 'TOOL_FORBIDDEN', 'Only employees may use these tools.');
  if (typeof conversationId !== 'string' || !UUID.test(conversationId))
    throw new ToolError(404, 'TOOL_NOT_FOUND', 'Resource not found.');
  try {
    await ownedSession(database, user.id, conversationId);
  } catch (error) {
    if (error.code === 'CHAT_NOT_FOUND') throw new ToolError(404, 'TOOL_NOT_FOUND', 'Resource not found.');
    throw error;
  }
  requireActiveSession(auth);
  return user;
}

export async function requireToolAcknowledgement(database, userId, tool, acknowledgementId) {
  const now = new Date();
  const candidate = await database.disclaimerAcknowledgement.findFirst({
    where: {
      userId,
      context: tool.acknowledgementContext,
      ...(acknowledgementId ? { id: acknowledgementId } : {}),
      version: DISCLAIMER_DEFINITION.version,
      createdAt: { gte: new Date(now.getTime() - TOOL_LIMITS.acknowledgementAgeMs), lte: now },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const ack =
    candidate &&
    (await verifyAcknowledgement(database, {
      acknowledgementId: candidate.id,
      userId,
      context: tool.acknowledgementContext,
      now,
      maxAgeMs: TOOL_LIMITS.acknowledgementAgeMs,
    }));
  if (!ack || new Date(ack.createdAt) > now)
    throw new ToolError(
      403,
      'TOOL_ACKNOWLEDGEMENT_REQUIRED',
      'A current acknowledgement for this analysis is required.',
    );
  return ack;
}
