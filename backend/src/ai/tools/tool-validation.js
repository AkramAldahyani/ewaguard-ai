import { UUID, containsSecret } from '../chat-policy.js';
import { parseEmailInput } from '../../analyzers/email/email-parser.js';
import { EMAIL_LIMITS } from '../../analyzers/email/email-policy.js';
import { normalizeUrl } from '../../analyzers/url/url-normalization.js';
import { TOOL_LIMITS, ToolError } from './tool-registry.js';

const invalid = () => {
  throw new ToolError(400, 'TOOL_INVALID_ARGUMENTS', 'Tool arguments do not match the required schema.');
};

// This validator intentionally supports only the registry's flat string/enum/UUID
// schemas. It is not a general JSON Schema engine. Expanding schemas requires tests.
export async function validateToolArguments(tool, argumentsJson) {
  if (typeof argumentsJson !== 'string') invalid();
  if (Buffer.byteLength(argumentsJson) > TOOL_LIMITS.argumentBytes)
    throw new ToolError(413, 'TOOL_ARGUMENTS_TOO_LARGE', 'Tool arguments exceed the size limit.');
  let value;
  try {
    value = JSON.parse(argumentsJson);
  } catch {
    invalid();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const { properties, required } = tool.parameters;
  if (
    Object.keys(value).some((key) => !Object.hasOwn(properties, key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    invalid();
  for (const [key, rule] of Object.entries(properties)) {
    const field = value[key];
    if (
      typeof field !== 'string' ||
      (rule.minLength !== undefined && field.length < rule.minLength) ||
      (rule.maxLength !== undefined && field.length > rule.maxLength) ||
      (rule.enum && !rule.enum.includes(field)) ||
      (rule.format === 'uuid' && !UUID.test(field))
    )
      invalid();
  }
  if (tool.kind === 'ACTION' && Object.values(value).some(containsSecret))
    throw new ToolError(400, 'TOOL_SENSITIVE_INPUT', 'Remove sensitive content before requesting analysis.');
  try {
    if (tool.name === 'analyze_email') {
      if (Buffer.byteLength(value.headers) > EMAIL_LIMITS.headerBytes) invalid();
      await parseEmailInput({ inputType: 'PASTED', body: value.body, headers: value.headers });
    }
    if (tool.name === 'analyze_url') normalizeUrl(value.url);
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError(400, 'TOOL_INVALID_INPUT', 'The requested analyzer input is not permitted.');
  }
  return Object.freeze(value);
}
