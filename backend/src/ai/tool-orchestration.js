import { ChatError, UUID, containsSecret } from './chat-policy.js';
import { responseText } from './openai-adapter.js';
import { TOOL_REGISTRY, TOOL_LIMITS, toolDefinition, freeze, ToolError } from './tools/tool-registry.js';
import { validateToolArguments } from './tools/tool-validation.js';
import { authorizeToolContext, requireToolAcknowledgement } from './tools/tool-access.js';

export const RESPONSE_LIMITS = Object.freeze({ toolRounds: TOOL_LIMITS.modelRounds, invocations: TOOL_LIMITS.modelInvocations });
// Raw registry action schemas remain backend-only. The model sees an opaque,
// turn-bound reference to input supplied through the authenticated private handoff.
export const responseToolSchemas = freeze(TOOL_REGISTRY.map((tool) => ({
  type: 'function', name: tool.name, description: tool.description, strict: true,
  parameters: tool.kind === 'READ_ONLY' ? tool.parameters : {
    type: 'object', properties: { inputReference: { type: 'string', format: 'uuid' } },
    required: ['inputReference'], additionalProperties: false,
  },
})));

export async function privateAnalysisInput(database, auth, conversationId, value) {
  if (value === undefined) return undefined;
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'parameters,toolName') {
    throw new ToolError(400, 'TOOL_INVALID_ARGUMENTS', 'Provide toolName and parameters for private analysis input.');
  }
  const tool = toolDefinition(value.toolName);
  if (tool.kind !== 'ACTION') throw new ToolError(400, 'TOOL_NOT_ACTION', 'Only email and URL analysis accept private input.');
  await authorizeToolContext(database, auth, conversationId);
  await requireToolAcknowledgement(database, auth.userId, tool);
  const parameters = await validateToolArguments(tool, JSON.stringify(value.parameters));
  return { name: tool.name, parameters };
}

const invalid = () => { throw new ChatError(502, 'AI_INVALID_RESPONSE', 'The AI response was incomplete or invalid.'); };
export function functionCalls(response) {
  if (response?.status !== 'completed' || !Array.isArray(response.output) || !response.output.length) invalid();
  const calls = [];
  for (const item of response.output) {
    if (!item || !['function_call', 'message', 'reasoning'].includes(item.type)) invalid();
    if (item.type === 'function_call') {
      if (typeof item.call_id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.call_id) ||
        typeof item.name !== 'string' || typeof item.arguments !== 'string' ||
        (item.status && item.status !== 'completed') || calls.some((call) => call.call_id === item.call_id)) invalid();
      calls.push(item);
    }
    if (item.type === 'message') responseText({ status: 'completed', output: [item] });
  }
  return calls;
}

export function validateGroundedText(text, results) {
  if (/\b(?:is|are|completely|definitely|100%)\s+(?:safe|legitimate)\b|\b(?:created|opened|filed)\s+(?:an?\s+)?(?:security\s+)?incident\b/i.test(text)) invalid();
  if (!results.length) return text;
  const levels = new Set(results.map((r) => r.data.risk.riskLevel));
  const scores = new Set(results.map((r) => String(r.data.risk.score)));
  for (const match of text.matchAll(/\b(LOW|MEDIUM|HIGH|CRITICAL)\b/gi)) if (!levels.has(match[1].toUpperCase())) invalid();
  for (const match of text.matchAll(/\b(?:risk\s*)?score\s*(?:is|of|:|=)?\s*(\d+)\b/gi)) if (!scores.has(match[1])) invalid();
  for (const match of text.matchAll(/\b(\d+)\s*(?:\/\s*100|out of 100)\b/gi)) if (!scores.has(match[1])) invalid();
  return text;
}

export async function runToolTurns({ input, callModel, tools, approvals, auth, sessionId, requestId,
  privateInput, saveMetadata, initialResult }) {
  let invocations = 0;
  const seen = new Set();
  const results = initialResult ? [initialResult] : [];
  const metadata = { results: [] };
  if (initialResult) metadata.results.push({ name: 'get_analysis_result', analyzerType: initialResult.data.analyzerType, analysisId: initialResult.data.analysisId });
  for (let round = 0; round <= RESPONSE_LIMITS.toolRounds; round++) {
    const enabled = Boolean(auth && !initialResult && round < RESPONSE_LIMITS.toolRounds);
    const response = await callModel(input, enabled, round);
    const calls = functionCalls(response);
    if (!calls.length) return { text: validateGroundedText(responseText(response), results), metadata, results };
    if (!enabled) throw new ChatError(502, 'AI_TOOL_ROUND_LIMIT', 'The assistant reached its tool-round limit. No additional tools were run.');
    if (invocations + calls.length > RESPONSE_LIMITS.invocations) throw new ChatError(502, 'AI_TOOL_INVOCATION_LIMIT', 'The assistant requested too many tools. No additional tools were run.');
    // Validate the entire batch before any execution or proposal persistence.
    const checked = [];
    for (const call of calls) {
      if (seen.has(call.call_id)) invalid();
      seen.add(call.call_id);
      const definition = toolDefinition(call.name);
      const schema = responseToolSchemas.find((tool) => tool.name === call.name);
      const args = await validateToolArguments({ ...definition, kind: 'READ_ONLY', name: 'reference', parameters: schema.parameters }, call.arguments);
      if (definition.kind === 'ACTION' && (!privateInput || call.name !== privateInput.name || args.inputReference !== requestId || !UUID.test(args.inputReference))) {
        throw new ToolError(400, 'TOOL_PRIVATE_INPUT_REQUIRED', 'Submit analysis input privately before requesting this action.');
      }
      checked.push({ call, definition });
    }
    invocations += calls.length;
    const action = checked.find(({ definition }) => definition.kind === 'ACTION');
    if (action) {
      if (checked.filter(({ definition }) => definition.kind === 'ACTION').length !== 1) invalid();
      const pending = await approvals.prepare({ auth, conversationId: sessionId, requestId,
        name: action.call.name, argumentsJson: JSON.stringify(privateInput.parameters) });
      metadata.approvalId = pending.approval.id;
      const needsConfirmation = pending.approval.status === 'PENDING';
      metadata.state = needsConfirmation ? 'PENDING_CONFIRMATION' : pending.approval.status;
      await saveMetadata(metadata);
      // Stop here: never pay for a model paraphrase of a confirmation prompt.
      return { text: needsConfirmation ? 'Analysis requires your review and confirmation. No analyzer has run for this request.'
        : 'This analysis request has already been processed. Retrieve its saved approval status and any completed result.', metadata, results,
      ...(needsConfirmation ? { pendingConfirmation: pending.approval } : {}) };
    }
    const outputs = [];
    for (const { call } of checked) {
      const result = await tools.execute({ auth, conversationId: sessionId, name: call.name, argumentsJson: call.arguments });
      results.push(result);
      metadata.results.push({ name: call.name, analyzerType: result.data.analyzerType, analysisId: result.data.analysisId });
      await saveMetadata(metadata);
      outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
    }
    // Preserve reasoning (including encrypted state) and matching function IDs
    // in memory only, with store:false. Do not persist provider reasoning/payloads.
    if (Buffer.byteLength(JSON.stringify(response.output)) > 64 * 1024 || containsSecret(JSON.stringify(response.output))) invalid();
    input = [...input, ...response.output, ...outputs];
  }
  invalid();
}
