import { randomUUID } from 'node:crypto';
import { UUID } from '../chat-policy.js';
import { analyzeEmail } from '../../analyzers/email/email-analyzer.js';
import { persistEmailAnalysis } from '../../analyzers/email/email-submission.js';
import { createUrlAnalyzer, persistUrlAnalysis } from '../../analyzers/url/url-analyzer.js';
import { AnalysisGateError, ANALYSIS_REQUEST_LIMITS } from '../../analyzers/analysis-gate.js';
import { authorizeToolContext, requireActiveSession, requireToolAcknowledgement } from './tool-access.js';
import { toolDefinition, ToolError, TOOL_LIMITS } from './tool-registry.js';
import { validateToolArguments } from './tool-validation.js';
import { approvalProtection } from './approval-crypto.js';
import { createToolService } from './tool-service.js';

const missing = () => { throw new ToolError(404, 'TOOL_NOT_FOUND', 'Resource not found.'); };
const invalid = () => { throw new ToolError(400, 'TOOL_INVALID_APPROVAL', 'Provide only the required approval fields.'); };
const typeOf = (name) => name === 'analyze_email' ? 'EMAIL' : 'URL';
const summary = (row) => ({ id: row.id, toolName: row.toolName, status: row.status, expiresAt: row.expiresAt.toISOString(),
  analysisId: row.emailAnalysisId ?? row.urlAnalysisId ?? null });

export function purgeExpiredApprovals(database, now = new Date()) {
  return database.toolApproval.updateMany({ where: { status: 'PENDING', expiresAt: { lte: now } },
    data: { status: 'EXPIRED', encryptedParameters: null } });
}

export function createApprovalService({ database, config, gates, emailAnalyzer = analyzeEmail, urlAnalyzer, threatIntelligence }) {
  const analyzeUrl = urlAnalyzer ?? createUrlAnalyzer({ threatIntelligence });
  const tools = createToolService({ database });
  const transaction = (operation) => database.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(808201::bigint)`;
    return operation(tx);
  }, { maxWait: 1000, timeout: 5000 });
  async function owned(tx, { auth, conversationId, id }) {
    await authorizeToolContext(tx, auth, conversationId);
    if (typeof id !== 'string' || !UUID.test(id)) missing();
    const row = await tx.toolApproval.findFirst({ where: { id, userId: auth.userId, conversationId } });
    if (!row) missing();
    if (row.status === 'PENDING' && row.expiresAt <= new Date()) {
      return tx.toolApproval.update({ where: { id: row.id }, data: { status: 'EXPIRED', encryptedParameters: null } });
    }
    return row;
  }
  async function validatedParameters(row) {
    const protection = approvalProtection(config);
    const parameters = await validateToolArguments(toolDefinition(row.toolName), protection.open(row));
    if (protection.digest(row.userId, row.conversationId, row.toolName, parameters) !== row.parameterDigest) {
      throw new ToolError(409, 'TOOL_APPROVAL_INVALID', 'This approval cannot be used. Prepare a new request.');
    }
    return parameters;
  }
  async function get(request, review = false) {
    const value = await transaction(async (tx) => {
      const row = await owned(tx, request);
      const parameters = review && row.status === 'PENDING' ? await validatedParameters(row) : undefined;
      requireActiveSession(request.auth);
      return { approval: summary(row), ...(parameters ? { parameters } : {}) };
    });
    if (value.approval.status === 'COMPLETED') {
      if (!value.approval.analysisId) return { ...value, resultUnavailable: true };
      try {
        value.result = await tools.execute({ auth: request.auth, conversationId: request.conversationId, name: 'get_analysis_result',
          argumentsJson: JSON.stringify({ analyzerType: typeOf(value.approval.toolName), analysisId: value.approval.analysisId }) });
      } catch (error) {
        if (['TOOL_NOT_FOUND', 'TOOL_RESULT_UNAVAILABLE'].includes(error.code)) value.resultUnavailable = true;
        else throw error;
      }
    }
    return value;
  }
  async function prepare({ auth, conversationId, requestId, name, argumentsJson }) {
    requireActiveSession(auth);
    if (typeof requestId !== 'string' || !UUID.test(requestId)) invalid();
    const tool = toolDefinition(name);
    if (tool.kind !== 'ACTION') invalid();
    const protection = approvalProtection(config);
    return transaction(async (tx) => {
      await authorizeToolContext(tx, auth, conversationId);
      const ack = await requireToolAcknowledgement(tx, auth.userId, tool);
      const parameters = await validateToolArguments(tool, argumentsJson);
      const parameterDigest = protection.digest(auth.userId, conversationId, name, parameters);
      await tx.toolApproval.updateMany({ where: { userId: auth.userId, status: 'PENDING', expiresAt: { lte: new Date() } },
        data: { status: 'EXPIRED', encryptedParameters: null } });
      const previous = await tx.toolApproval.findUnique({ where: { userId_requestId: { userId: auth.userId, requestId } } });
      if (previous) {
        if (previous.parameterDigest !== parameterDigest || previous.conversationId !== conversationId || previous.toolName !== name) {
          throw new ToolError(409, 'TOOL_REQUEST_REUSED', 'This request ID belongs to a different operation.');
        }
        requireActiveSession(auth);
        return { approval: summary(previous), replayed: true };
      }
      if (await tx.toolApproval.count({ where: { userId: auth.userId, status: 'PENDING' } }) >= 5) {
        throw new ToolError(429, 'TOOL_PENDING_LIMIT', 'Resolve existing pending approvals before preparing more.');
      }
      const now = new Date();
      const row = { id: randomUUID(), requestId, userId: auth.userId, conversationId, acknowledgementId: ack.id, toolName: name,
        parameterDigest, createdAt: now, expiresAt: new Date(now.getTime() + TOOL_LIMITS.confirmationTtlMs) };
      requireActiveSession(auth);
      const created = await tx.toolApproval.create({ data: { ...row, encryptedParameters: protection.seal(row, parameters) } });
      return { approval: summary(created), replayed: false };
    });
  }
  async function decide(request) {
    if (!['CONFIRM', 'REJECT'].includes(request.decision)) invalid();
    // Ownership is checked before quota/slot admission. Metadata contains no input.
    const initial = await get(request);
    const type = typeOf(initial.approval.toolName);
    const release = request.decision === 'CONFIRM' && initial.approval.status === 'PENDING' ? gates[type].acquire() : () => {};
    let claimed;
    try {
      const admission = await transaction(async (tx) => {
        const row = await owned(tx, request);
        if (row.status !== 'PENDING') {
          if (row.status === 'EXPIRED' || (row.status === 'COMPLETED' && request.decision === 'CONFIRM') ||
            (row.status === 'REJECTED' && request.decision === 'REJECT')) return { replay: true };
          throw new ToolError(409, 'TOOL_APPROVAL_CONSUMED', 'This approval has already been consumed. Do not repeat the scan.');
        }
        if (request.decision === 'REJECT') {
          await tx.toolApproval.update({ where: { id: row.id }, data: { status: 'REJECTED', decidedAt: new Date(), encryptedParameters: null } });
          return { replay: false };
        }
        const parameters = await validatedParameters(row);
        await requireToolAcknowledgement(tx, request.auth.userId, toolDefinition(row.toolName), row.acknowledgementId);
        if (await tx.toolApproval.count({ where: { toolName: row.toolName, status: 'EXECUTING' } }) >= 4) throw new AnalysisGateError(type);
        if (await tx.toolApproval.count({ where: { userId: row.userId, toolName: row.toolName,
          status: { in: ['EXECUTING', 'COMPLETED', 'FAILED'] }, decidedAt: { gte: new Date(Date.now() - 60000) } } }) >= ANALYSIS_REQUEST_LIMITS[type]) {
          throw new ToolError(429, 'TOOL_EXECUTION_LIMIT', 'Too many analysis executions. Try again later.');
        }
        requireActiveSession(request.auth);
        const now = new Date();
        const consumed = await tx.toolApproval.updateMany({ where: { id: row.id, userId: row.userId, status: 'PENDING', expiresAt: { gt: now } },
          data: { status: 'EXECUTING', decidedAt: now, encryptedParameters: null } });
        if (consumed.count !== 1) throw new ToolError(409, 'TOOL_APPROVAL_EXPIRED', 'This approval has expired.');
        return { row, parameters };
      });
      if (!admission.row) return { ...await get(request), replayed: admission.replay };
      claimed = admission.row;
      // Recheck immediately before invoking the analyzer, after the durable claim.
      await authorizeToolContext(database, request.auth, request.conversationId);
      await requireToolAcknowledgement(database, request.auth.userId, toolDefinition(claimed.toolName), claimed.acknowledgementId);
      const parameters = await validateToolArguments(toolDefinition(claimed.toolName), JSON.stringify(admission.parameters));
      requireActiveSession(request.auth);
      const result = type === 'EMAIL'
        ? await emailAnalyzer({ inputType: 'PASTED', body: parameters.body, headers: parameters.headers })
        : await analyzeUrl(parameters.url);
      // A successful scan survives disconnects, expired sessions and later AI
      // failures. Analysis and receipt commit atomically; network I/O is finished.
      await database.$transaction(async (tx) => {
        const input = { userId: claimed.userId, acknowledgementId: claimed.acknowledgementId, result };
        const saved = await (type === 'EMAIL' ? persistEmailAnalysis : persistUrlAnalysis)(tx, input);
        await tx.toolApproval.update({ where: { id: claimed.id }, data: { status: 'COMPLETED', completedAt: new Date(),
          ...(type === 'EMAIL' ? { emailAnalysisId: saved.analysisId } : { urlAnalysisId: saved.analysisId }) } });
      });
      return { ...await get(request), replayed: false };
    } catch (error) {
      if (claimed) {
        // A crash leaves EXECUTING, which is also terminal for execution. Never
        // release a consumed request back to PENDING or automatically retry it.
        await database.toolApproval.updateMany({ where: { id: claimed.id, status: 'EXECUTING' },
          data: { status: 'FAILED', completedAt: new Date() } });
        if (!(error instanceof ToolError)) throw new ToolError(502, 'TOOL_ANALYSIS_FAILED', 'Analysis could not complete. This approval cannot be retried.');
      }
      throw error;
    } finally { release(); }
  }
  const safe = (operation) => async (...args) => {
    try { return await operation(...args); }
    catch (error) {
      if (error instanceof ToolError || error instanceof AnalysisGateError) throw error;
      throw new ToolError(503, 'TOOL_UNAVAILABLE', 'The tool operation could not be completed.');
    }
  };
  return Object.freeze({ prepare: safe(prepare), get: safe(get), review: safe((request) => get(request, true)), decide: safe(decide) });
}
