import { randomUUID } from 'node:crypto';
import { TOOL_LIMITS, freeze } from './tool-registry.js';

export const CONFIRMATION_CONTRACT = freeze({
  version: 'tool-confirmation-v1',
  states: ['PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'CONSUMED'],
  ttlMs: TOOL_LIMITS.confirmationTtlMs,
  executionEnabled: false,
  bindings: ['id', 'userId', 'conversationId', 'toolName', 'parameters', 'acknowledgementId', 'expiresAt'],
  confirmInput: {
    type: 'object',
    properties: {
      requestId: { type: 'string', format: 'uuid' },
      decision: { type: 'string', enum: ['CONFIRM', 'REJECT'] },
    },
    required: ['requestId', 'decision'],
    additionalProperties: false,
  },
});

// Contract fixture, NOT a persisted approval or an executable capability. No
// confirmation endpoint/state transition is enabled in 8B1. Keep the serverDraft
// private; only publicRequest is suitable for a future employee-facing response.
export function pendingContract({ userId, conversationId, tool, parameters, acknowledgementId, now }) {
  const id = randomUUID();
  const expiresAt = new Date(now.getTime() + TOOL_LIMITS.confirmationTtlMs).toISOString();
  return freeze({
    serverDraft: {
      id,
      userId,
      conversationId,
      toolName: tool.name,
      parameters: { ...parameters },
      acknowledgementId,
      createdAt: now.toISOString(),
      expiresAt,
      state: 'PENDING',
      confirmedAt: null,
      executionEnabled: false,
    },
    publicRequest: {
      id,
      toolName: tool.name,
      expiresAt,
      state: 'PENDING',
      executionEnabled: false,
      summary: 'Analysis requires your review and confirmation. Execution is not available in this phase.',
    },
  });
}
