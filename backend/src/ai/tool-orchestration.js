import { ChatError, UUID, containsSecret, containsResponseSecret, containsAnalysisInput } from './chat-policy.js';
import { responseText } from './openai-adapter.js';
import { TOOL_REGISTRY, TOOL_LIMITS, toolDefinition, freeze, ToolError } from './tools/tool-registry.js';
import { validateToolArguments } from './tools/tool-validation.js';
import { authorizeToolContext, requireToolAcknowledgement } from './tools/tool-access.js';
import { formatPdplAnswer, isPdplQuestion } from '../rag/pdpl-answer.js';
import { pdplReceipt } from '../rag/pdpl-chat.js';
import { companyReceipt } from '../rag/company-chat.js';
import { formatCompanyAnswer, isCompanyQuestion } from '../rag/company-answer.js';
import { QUESTION_ROUTE_TOOL } from './question-routing.js';

const isKnowledge = (result) => ['PDPL', 'COMPANY_POLICY'].includes(result.data?.kind);

export const RESPONSE_LIMITS = Object.freeze({
  toolRounds: TOOL_LIMITS.modelRounds,
  invocations: TOOL_LIMITS.modelInvocations,
});
// Raw registry action schemas remain backend-only. The model sees an opaque,
// turn-bound reference to input supplied through the authenticated private handoff.
export const responseToolSchemas = freeze([
  ...TOOL_REGISTRY.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    strict: true,
    parameters:
      tool.kind === 'READ_ONLY'
        ? tool.parameters
        : {
            type: 'object',
            properties: { inputReference: { type: 'string', format: 'uuid' } },
            required: ['inputReference'],
            additionalProperties: false,
          },
  })),
  QUESTION_ROUTE_TOOL,
]);

export async function privateAnalysisInput(database, auth, conversationId, value) {
  if (value === undefined) return undefined;
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'parameters,toolName') {
    throw new ToolError(400, 'TOOL_INVALID_ARGUMENTS', 'Provide toolName and parameters for private analysis input.');
  }
  const tool = toolDefinition(value.toolName);
  if (tool.kind !== 'ACTION')
    throw new ToolError(400, 'TOOL_NOT_ACTION', 'Only email and URL analysis accept private input.');
  await authorizeToolContext(database, auth, conversationId);
  await requireToolAcknowledgement(database, auth.userId, tool);
  const parameters = await validateToolArguments(tool, JSON.stringify(value.parameters));
  return { name: tool.name, parameters };
}

const invalid = () => {
  throw new ChatError(502, 'AI_INVALID_RESPONSE', 'The AI response was incomplete or invalid.');
};
export function functionCalls(response) {
  if (response?.status !== 'completed' || !Array.isArray(response.output) || !response.output.length) invalid();
  const calls = [];
  for (const item of response.output) {
    if (!item || !['function_call', 'message', 'reasoning'].includes(item.type)) invalid();
    if (item.type === 'function_call') {
      if (
        typeof item.call_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(item.call_id) ||
        typeof item.name !== 'string' ||
        typeof item.arguments !== 'string' ||
        (item.status && item.status !== 'completed') ||
        calls.some((call) => call.call_id === item.call_id)
      )
        invalid();
      calls.push(item);
    }
    if (item.type === 'message') responseText({ status: 'completed', output: [item] });
  }
  return calls;
}

export function validateGroundedText(text, results, options = {}) {
  const claims = text.replace(
    /\b(?:do not|does not|don['’]t|doesn['’]t|cannot|can['’]t|never)\b(?:(?!\bbut\b)[^.!?;\n]){0,100}\b(?:guarantee|promise|claim)\b(?:(?!\bbut\b)[^.!?;\n]){0,100}\b(?:safe|legitimate)\b/gi,
    'no safety guarantee',
  );
  if (
    /\b(?:is|are|completely|definitely|100%)\s+(?:safe|legitimate)\b|\b(?:created|opened|filed)\s+(?:an?\s+)?(?:security\s+)?incident\b/i.test(
      claims,
    )
  )
    invalid();
  if (results.some((r) => r.data?.kind === 'COMPANY_POLICY'))
    return formatCompanyAnswer(text, results.filter(isKnowledge), options);
  const legal = results.find((r) => r.data?.kind === 'PDPL');
  if (legal) return formatPdplAnswer(text, legal, options);
  if (!results.length) return text;
  const levels = new Set(results.map((r) => r.data.risk.riskLevel));
  const scores = new Set(results.map((r) => String(r.data.risk.score)));
  for (const match of text.matchAll(/\b(LOW|MEDIUM|HIGH|CRITICAL)\b/gi))
    if (!levels.has(match[1].toUpperCase())) invalid();
  for (const match of text.matchAll(/\b(?:risk\s*)?score\s*(?:is|of|:|=)?\s*(\d+)\b/gi))
    if (!scores.has(match[1])) invalid();
  for (const match of text.matchAll(/\b(\d+)\s*(?:\/\s*100|out of 100)\b/gi)) if (!scores.has(match[1])) invalid();
  return text;
}

export async function runToolTurns({
  input,
  callModel,
  tools,
  approvals,
  auth,
  sessionId,
  requestId,
  privateInput,
  saveMetadata,
  initialResult,
  pdpl,
  company,
  question,
  privacyNoticeVersion,
  signal,
}) {
  let invocations = 0;
  const seen = new Set();
  const results = initialResult ? [initialResult] : [];
  const metadata = { results: [] };
  if (initialResult)
    metadata.results.push({
      name: 'get_analysis_result',
      analyzerType: initialResult.data.analyzerType,
      analysisId: initialResult.data.analysisId,
    });
  for (let round = 0; round <= RESPONSE_LIMITS.toolRounds; round++) {
    const references = results.filter(isKnowledge);
    const hasCompany = references.some((r) => r.data.kind === 'COMPANY_POLICY');
    const unavailable = references.find((r) => r.data.status !== 'MATCHES');
    if (unavailable)
      return {
        text: hasCompany ? formatCompanyAnswer('', references) : formatPdplAnswer('', unavailable),
        metadata,
        results,
      };
    const enabled = Boolean(auth && !initialResult && !references.length && round < RESPONSE_LIMITS.toolRounds);
    const response = await callModel(
      input,
      enabled,
      round,
      references.length > 0 && !hasCompany,
      hasCompany,
      references,
    );
    const calls = functionCalls(response);
    if (!calls.length) {
      for (let i = 0; i < results.length; i++) {
        if (results[i].data?.kind === 'PDPL')
          results[i] = await pdpl.recover({ auth, conversationId: sessionId, receipt: pdplReceipt(results[i]) });
        if (results[i].data?.kind === 'COMPANY_POLICY')
          results[i] = await company.recover({ auth, conversationId: sessionId, receipt: companyReceipt(results[i]) });
      }
      const text = responseText(response);
      // Route by the employee's question. Capability descriptions in the answer
      // (such as "I can help with PDPL and company policies") are not questions
      // and must not replace ordinary conversation with a source fallback.
      const missingCompany =
        !results.some((r) => r.data?.kind === 'COMPANY_POLICY') && isCompanyQuestion(question ?? '');
      const missingLegal = !results.some((r) => r.data?.kind === 'PDPL') && isPdplQuestion(question ?? '');
      return {
        text: missingCompany
          ? formatCompanyAnswer('', [])
          : missingLegal
            ? formatPdplAnswer('', null)
            : validateGroundedText(text, results, { allowGeneral: metadata.routing?.generalGuidance === 'INCLUDE' }),
        metadata,
        results,
      };
    }
    if (!enabled)
      throw new ChatError(
        502,
        'AI_TOOL_ROUND_LIMIT',
        'The assistant reached its tool-round limit. No additional tools were run.',
      );
    if (invocations + calls.length > RESPONSE_LIMITS.invocations)
      throw new ChatError(
        502,
        'AI_TOOL_INVOCATION_LIMIT',
        'The assistant requested too many tools. No additional tools were run.',
      );
    // Validate the entire batch before any execution or proposal persistence.
    const checked = [];
    for (const call of calls) {
      if (seen.has(call.call_id)) invalid();
      seen.add(call.call_id);
      const definition =
        call.name === 'route_question' ? { ...QUESTION_ROUTE_TOOL, kind: 'READ_ONLY' } : toolDefinition(call.name);
      const schema = responseToolSchemas.find((tool) => tool.name === call.name);
      const args = await validateToolArguments(
        { ...definition, kind: 'READ_ONLY', name: 'reference', parameters: schema.parameters },
        call.arguments,
      );
      if (
        definition.kind === 'ACTION' &&
        (!privateInput ||
          call.name !== privateInput.name ||
          args.inputReference !== requestId ||
          !UUID.test(args.inputReference))
      ) {
        throw new ToolError(
          400,
          'TOOL_PRIVATE_INPUT_REQUIRED',
          'Submit analysis input privately before requesting this action.',
        );
      }
      checked.push({ call, definition, args });
    }
    invocations += calls.length;
    const route = checked.find(({ call }) => call.name === 'route_question');
    if (route) {
      if (checked.length !== 1 || round !== 0 || results.length) invalid();
      const { source, question: resolved, answer, generalGuidance } = route.args;
      if (containsSecret(resolved) || containsAnalysisInput(resolved) || containsResponseSecret(answer)) invalid();
      metadata.routing = { source, generalGuidance };
      if (['GENERAL', 'CLARIFY'].includes(source)) {
        if (resolved || !answer.trim() || /\[(?:PDPL|POLICY)\d+\]/i.test(answer)) invalid();
        return {
          text: validateGroundedText(
            responseText({
              status: 'completed',
              output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer }] }],
            }),
            [],
          ),
          metadata,
          results,
        };
      }
      if (!resolved.trim() || answer) invalid();
      const kinds = source === 'BOTH' ? ['PDPL', 'COMPANY_POLICY'] : [source];
      if (invocations + kinds.length - 1 > RESPONSE_LIMITS.invocations) invalid();
      invocations += kinds.length - 1;
      for (const kind of kinds) {
        const service = kind === 'PDPL' ? pdpl : company;
        if (!service) throw new ToolError(503, 'KNOWLEDGE_UNAVAILABLE', 'Knowledge retrieval is unavailable.');
        const result = await service.search({
          auth,
          conversationId: sessionId,
          question: resolved,
          requestId,
          privacyNoticeVersion,
          signal,
        });
        if (result?.data?.kind !== kind || !Array.isArray(result.data.matches)) invalid();
        results.push(result);
        metadata.results.push(kind === 'PDPL' ? pdplReceipt(result) : companyReceipt(result));
      }
      await saveMetadata(metadata);
      if (
        Buffer.byteLength(JSON.stringify(response.output)) > 64 * 1024 ||
        containsSecret(JSON.stringify(response.output))
      )
        invalid();
      input = [
        ...input,
        ...response.output,
        {
          type: 'function_call_output',
          call_id: route.call.call_id,
          output: JSON.stringify({ trust: 'UNTRUSTED_DATA', sources: results, generalGuidance }),
        },
      ];
      continue;
    }
    if (
      checked.some(({ call }) => ['search_pdpl', 'search_company_policy'].includes(call.name)) &&
      (checked.length !== 1 || results.length)
    )
      invalid();
    const action = checked.find(({ definition }) => definition.kind === 'ACTION');
    if (action) {
      if (checked.filter(({ definition }) => definition.kind === 'ACTION').length !== 1) invalid();
      const pending = await approvals.prepare({
        auth,
        conversationId: sessionId,
        requestId,
        name: action.call.name,
        argumentsJson: JSON.stringify(privateInput.parameters),
      });
      metadata.approvalId = pending.approval.id;
      const needsConfirmation = pending.approval.status === 'PENDING';
      metadata.state = needsConfirmation ? 'PENDING_CONFIRMATION' : pending.approval.status;
      await saveMetadata(metadata);
      // Stop here: never pay for a model paraphrase of a confirmation prompt.
      return {
        text: needsConfirmation
          ? 'Analysis requires your review and confirmation. No analyzer has run for this request.'
          : 'This analysis request has already been processed. Retrieve its saved approval status and any completed result.',
        metadata,
        results,
        ...(needsConfirmation ? { pendingConfirmation: pending.approval } : {}),
      };
    }
    const outputs = [];
    for (const { call } of checked) {
      if (['search_pdpl', 'search_company_policy'].includes(call.name)) {
        // Legacy source tools remain supported for saved/injected providers.
        // Live initial turns use the context-aware route_question contract.
        const legalQuestion = isPdplQuestion(question ?? '');
        const policyQuestion = isCompanyQuestion(question ?? '');
        const kinds =
          legalQuestion || policyQuestion
            ? [...(legalQuestion ? ['PDPL'] : []), ...(policyQuestion ? ['COMPANY_POLICY'] : [])]
            : [call.name === 'search_pdpl' ? 'PDPL' : 'COMPANY_POLICY'];
        if (invocations + kinds.length - 1 > RESPONSE_LIMITS.invocations) invalid();
        invocations += kinds.length - 1;
        const found = [];
        for (const kind of kinds) {
          const service = kind === 'PDPL' ? pdpl : company;
          if (!service) throw new ToolError(503, 'KNOWLEDGE_UNAVAILABLE', 'Knowledge retrieval is unavailable.');
          const result = await service.search({
            auth,
            conversationId: sessionId,
            question,
            requestId,
            privacyNoticeVersion,
            signal,
          });
          found.push(result);
          results.push(result);
          metadata.results.push(kind === 'PDPL' ? pdplReceipt(result) : companyReceipt(result));
          await saveMetadata(metadata);
        }
        outputs.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(found.length === 1 ? found[0] : { trust: 'UNTRUSTED_DATA', sources: found }),
        });
        continue;
      }
      const result = await tools.execute({
        auth,
        conversationId: sessionId,
        name: call.name,
        argumentsJson: call.arguments,
      });
      results.push(result);
      metadata.results.push({
        name: call.name,
        analyzerType: result.data.analyzerType,
        analysisId: result.data.analysisId,
      });
      await saveMetadata(metadata);
      outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
    }
    // Preserve reasoning (including encrypted state) and matching function IDs
    // in memory only, with store:false. Do not persist provider reasoning/payloads.
    if (
      Buffer.byteLength(JSON.stringify(response.output)) > 64 * 1024 ||
      containsSecret(JSON.stringify(response.output))
    )
      invalid();
    input = [...input, ...response.output, ...outputs];
  }
  invalid();
}
