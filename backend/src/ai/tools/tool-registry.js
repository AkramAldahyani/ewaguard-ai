import { EMAIL_LIMITS } from '../../analyzers/email/email-policy.js';

export function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}
export const TOOL_LIMITS = freeze({ argumentBytes: 48 * 1024, resultBytes: 16 * 1024,
  activeOperations: 4, transactionTimeoutMs: 5000, statementTimeoutMs: 2000,
  acknowledgementAgeMs: 15 * 60_000, confirmationTtlMs: 5 * 60_000,
  modelRounds: 0, actionExecutions: 1 });

const id = { type: 'string', format: 'uuid', minLength: 36, maxLength: 36 };
const schema = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const reference = schema({ analyzerType: { type: 'string', enum: ['EMAIL', 'URL', 'FILE'] }, analysisId: id });
const read = (name, description, parameters = reference) => ({ name, description, parameters, strict: true,
  kind: 'READ_ONLY', authorizedRole: 'EMPLOYEE', execution: 'INTERNAL_ONLY',
  inputRequirements: 'Owned, unexpired conversation and completed, unexpired analysis with a stored final risk result.',
  privacyRestrictions: 'IDs only; no raw content, paths, identity overrides, or new network operations.',
  acknowledgementContext: null, allowedService: 'owned-completed-analysis-projection',
  timeoutMs: TOOL_LIMITS.transactionTimeoutMs, operationalLimits: { records: 1, outputBytes: TOOL_LIMITS.resultBytes },
  outputProjection: 'analysis-tool-result-v1' });
const action = (name, description, parameters, context, service) => ({ name, description, parameters, strict: true,
  kind: 'ACTION', authorizedRole: 'EMPLOYEE', execution: 'HUMAN_APPROVAL_API_ONLY',
  inputRequirements: 'Validated text, current acknowledgement, owned conversation, and a durable exact-operation human confirmation.',
  privacyRestrictions: 'No secrets. Parameters stay within the backend confirmation contract; never send them to a model automatically.',
  acknowledgementContext: context, allowedService: service, timeoutMs: TOOL_LIMITS.transactionTimeoutMs,
  operationalLimits: { executions: 1, humanApprovalRequired: true, proposalsPerInvocation: 1, confirmationTtlMs: TOOL_LIMITS.confirmationTtlMs },
  outputProjection: 'tool-approval-summary-v1' });

export const TOOL_REGISTRY = freeze([
  action('analyze_email', 'Prepare a pasted-email analysis for employee review. Does not run analysis.',
    schema({ body: { type: 'string', minLength: 1, maxLength: EMAIL_LIMITS.bodyBytes }, headers: { type: 'string', maxLength: EMAIL_LIMITS.headerBytes } }),
    'EMAIL_ANALYSIS', 'submitEmailAnalysis'),
  action('analyze_url', 'Prepare a public HTTP(S) URL analysis for employee review. Does not perform DNS, TLS or reputation requests.',
    schema({ url: { type: 'string', minLength: 1, maxLength: 4096 } }), 'URL_ANALYSIS', 'submitUrlAnalysis'),
  read('get_file_analysis', 'Retrieve an owned completed file analysis. Does not upload, read, or rescan a file.', schema({ analysisId: id })),
  read('get_analysis_result', 'Retrieve minimized evidence and the stored final risk result for an owned completed analysis.'),
  read('explain_risk', 'Return the stored final risk and fixed reason descriptions; never recalculate or accept a supplied score.'),
  read('get_security_recommendations', 'Return existing deterministic incident-assistance guidance from the stored final risk; no incident is created.'),
]);

export class ToolError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function toolDefinition(name) {
  const tool = TOOL_REGISTRY.find((entry) => entry.name === name);
  if (!tool) throw new ToolError(400, 'TOOL_UNKNOWN', 'This tool is not supported.');
  return tool;
}
