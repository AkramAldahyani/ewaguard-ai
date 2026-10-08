import { authorizeToolContext, requireActiveSession, requireToolAcknowledgement } from './tool-access.js';
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
  async function operation(request, prepare) {
    const { auth, conversationId, name, argumentsJson } = request ?? {};
    requireActiveSession(auth);
    if (active >= TOOL_LIMITS.activeOperations) throw new ToolError(503, 'TOOL_BUSY', 'Tool operations are busy.');
    active++;
    try {
      return await database.$transaction(async (tx) => {
        // A session may expire while waiting for a transaction slot.
        requireActiveSession(auth);
        // Fixed server-authored statement; model arguments never become SQL.
        await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
        const user = await authorizeToolContext(tx, auth, conversationId);
        const tool = toolDefinition(name);
        const parameters = await validateToolArguments(tool, argumentsJson);
        if (tool.kind === 'ACTION') {
          const now = new Date();
          const ack = await requireToolAcknowledgement(tx, user.id, tool);
          if (!prepare) throw new ToolError(409, 'TOOL_EXECUTION_DEFERRED', 'New analysis requires a future human-confirmation workflow.');
          requireActiveSession(auth);
          return pendingContract({ userId: user.id, conversationId, tool, parameters, acknowledgementId: ack.id, now });
        }
        if (prepare) throw new ToolError(400, 'TOOL_NOT_ACTION', 'This tool does not initiate an analysis.');
        const analyzerType = tool.name === 'get_file_analysis' ? 'FILE' : parameters.analyzerType;
        const record = await tx[delegates[analyzerType]].findFirst({ where: { id: parameters.analysisId, userId: user.id, status: 'COMPLETED', expiresAt: { gt: new Date() } },
          select: { ...select, ...(analyzerType === 'FILE' ? { clamavStatus: true, yaraStatus: true } : {}) } });
        if (!record) throw new ToolError(404, 'TOOL_NOT_FOUND', 'Resource not found.');
        requireActiveSession(auth);
        return projectToolResult(tool, analyzerType, record);
      }, { maxWait: 1000, timeout: TOOL_LIMITS.transactionTimeoutMs });
    } catch (error) {
      if (error instanceof ToolError) throw error;
      throw new ToolError(503, 'TOOL_UNAVAILABLE', 'The tool operation could not be completed.');
    } finally { active--; }
  }
  return Object.freeze({ execute: (request) => operation(request, false), prepareActionContract: (request) => operation(request, true) });
}
