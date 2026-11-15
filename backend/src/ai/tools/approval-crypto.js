import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { ToolError } from './tool-registry.js';

const canonical = (parameters) =>
  JSON.stringify(
    Object.fromEntries(
      Object.keys(parameters)
        .sort()
        .map((key) => [key, parameters[key]]),
    ),
  );
const binding = (row) =>
  Buffer.from(
    JSON.stringify([
      row.id,
      row.userId,
      row.conversationId,
      row.toolName,
      row.acknowledgementId,
      row.parameterDigest,
      new Date(row.createdAt).toISOString(),
      new Date(row.expiresAt).toISOString(),
    ]),
  );

export function approvalProtection(config) {
  if (!/^[a-f0-9]{64}$/i.test(config.toolApprovalEncryptionKey ?? '')) {
    throw new ToolError(503, 'TOOL_APPROVALS_NOT_CONFIGURED', 'Analysis approvals are not configured.');
  }
  const derive = (purpose) =>
    Buffer.from(
      hkdfSync('sha256', Buffer.from(config.toolApprovalEncryptionKey, 'hex'), 'ewaguard-approval-v1', purpose, 32),
    );
  const encryptionKey = derive('encryption');
  const digestKey = derive('operation-binding');
  return {
    digest(userId, conversationId, toolName, parameters) {
      return createHmac('sha256', digestKey)
        .update(JSON.stringify([userId, conversationId, toolName, canonical(parameters)]))
        .digest('hex');
    },
    seal(row, parameters) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
      cipher.setAAD(binding(row));
      const encrypted = Buffer.concat([cipher.update(canonical(parameters), 'utf8'), cipher.final()]);
      return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(
        '.',
      );
    },
    open(row) {
      try {
        const [version, iv, tag, value, extra] = row.encryptedParameters.split('.');
        if (version !== 'v1' || extra !== undefined) throw new Error();
        const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64'));
        decipher.setAAD(binding(row));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(value, 'base64')), decipher.final()]).toString('utf8');
      } catch {
        throw new ToolError(409, 'TOOL_APPROVAL_INVALID', 'This approval cannot be used. Prepare a new request.');
      }
    },
  };
}
