import { UUID } from '../chat-policy.js';
import { ownedSession } from '../chat-service.js';
import { verifyAcknowledgement } from '../../disclaimers/disclaimer-service.js';
import { DISCLAIMER_DEFINITION } from '../../../../shared/disclaimer.js';
import { TOOL_LIMITS, ToolError, toolDefinition } from './tool-registry.js';
import { validateToolArguments } from './tool-validation.js';
import { projectToolResult } from './tool-results.js';
import { pendingContract } from './tool-confirmation.js';

const delegates = Object.freeze({ EMAIL: 'emailAnalysis', URL: 'urlAnalysis', FILE: 'fileAnalysis' });
const select = Object.freeze({ id: true, evidence: true, riskScore: true, severity: true, riskRuleVersion: true });

// auth is supplied ONLY by trusted backend code after createAuthenticate. Never
// deserialize it from tool/model/client JSON. Role claims in auth are ignored.
export function createToolService({ database }) {
  let active = 0;
  async function operation({ auth, conversationId, name, argumentsJson }, prepare) {
    if (!auth || !UUID.test(auth.userId) || !Number.isFinite(Date.parse(auth.expiresAt)) || Date.parse(auth.expiresAt) <= Date.now()) {
      throw new ToolError(401, 'TOOL_AUTHENTICATION_REQUIRED', 'An active authenticated session is required.');
    }
    if (active >= TOOL_LIMITS.activeOperations) throw new ToolError(503, 'TOOL_BUSY', 'Tool operations are busy.');
    active++;
    try {
      return await database.$transaction(async (tx) => {
        // Fixed server-authored statement; model arguments never become SQL.
        await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
        const user = await tx.user.findUnique({ where: { id: auth.userId }, select: { id: true, status: true, deactivatedAt: true, role: { select: { name: true } } } });
        if (!user || user.status !== 'ACTIVE' || user.deactivatedAt) throw new ToolError(401, 'TOOL_AUTHENTICATION_REQUIRED', 'An active authenticated session is required.');
        if (user.role.name !== 'EMPLOYEE') throw new ToolError(403, 'TOOL_FORBIDDEN', 'Only employees may use these tools.');
        if (!UUID.test(conversationId)) throw new ToolError(404, 'TOOL_NOT_FOUND', 'Resource not found.');
        try { await ownedSession(tx, user.id, conversationId); }
        catch (error) { if (error.code === 'CHAT_NOT_FOUND') throw new ToolError(404, 'TOOL_NOT_FOUND', 'Resource not found.'); throw error; }
        const tool = toolDefinition(name);
        const parameters = await validateToolArguments(tool, argumentsJson);
        if (tool.kind === 'ACTION') {
          const now = new Date();
          const candidate = await tx.disclaimerAcknowledgement.findFirst({ where: { userId: user.id, context: tool.acknowledgementContext,
            version: DISCLAIMER_DEFINITION.version, createdAt: { gte: new Date(now.getTime() - TOOL_LIMITS.acknowledgementAgeMs), lte: now } },
            orderBy: { createdAt: 'desc' }, select: { id: true } });
          const ack = candidate && await verifyAcknowledgement(tx, { acknowledgementId: candidate.id, userId: user.id,
            context: tool.acknowledgementContext, now, maxAgeMs: TOOL_LIMITS.acknowledgementAgeMs });
          if (!ack || new Date(ack.createdAt) > now) throw new ToolError(403, 'TOOL_ACKNOWLEDGEMENT_REQUIRED', 'A current acknowledgement for this analysis is required.');
          if (!prepare) throw new ToolError(409, 'TOOL_EXECUTION_DEFERRED', 'New analysis requires a future human-confirmation workflow.');
          return pendingContract({ userId: user.id, conversationId, tool, parameters, acknowledgementId: ack.id, now });
        }
        if (prepare) throw new ToolError(400, 'TOOL_NOT_ACTION', 'This tool does not initiate an analysis.');
        const analyzerType = tool.name === 'get_file_analysis' ? 'FILE' : parameters.analyzerType;
        const record = await tx[delegates[analyzerType]].findFirst({ where: { id: parameters.analysisId, userId: user.id, status: 'COMPLETED', expiresAt: { gt: new Date() } },
          select: { ...select, ...(analyzerType === 'FILE' ? { clamavStatus: true, yaraStatus: true } : {}) } });
        if (!record) throw new ToolError(404, 'TOOL_NOT_FOUND', 'Resource not found.');
        return projectToolResult(tool, analyzerType, record);
      }, { maxWait: 1000, timeout: TOOL_LIMITS.transactionTimeoutMs });
    } catch (error) {
      if (error instanceof ToolError) throw error;
      throw new ToolError(503, 'TOOL_UNAVAILABLE', 'The tool operation could not be completed.');
    } finally { active--; }
  }
  return Object.freeze({ execute: (request) => operation(request, false), prepareActionContract: (request) => operation(request, true) });
}
