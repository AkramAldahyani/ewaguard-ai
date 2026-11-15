export const RETENTION_VERSION = 'prototype-15a-v1';
export const DAY_MS = 86_400_000;
export const CHAT_RETENTION_DAYS = 30;

function integer(env, key, fallback, max) {
  const raw = env[key] ?? String(fallback);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1 || Number(raw) > max) {
    throw new Error(`Invalid ${key}`); // Never echo configuration values.
  }
  return Number(raw);
}
function flag(env, key) {
  if (env[key] !== undefined && !['true', 'false'].includes(env[key])) throw new Error(`Invalid ${key}`);
  return env[key] === 'true';
}
export function retentionPolicy(env = process.env) {
  return Object.freeze({
    enabled: flag(env, 'RETENTION_ENABLED'),
    paused: flag(env, 'RETENTION_PAUSED'),
    batchSize: integer(env, 'RETENTION_BATCH_SIZE', 100, 500),
    intervalMinutes: integer(env, 'RETENTION_INTERVAL_MINUTES', 60, 1440),
    chatDays: CHAT_RETENTION_DAYS, // Keep the existing employee notice and AI contract.
    emailDays: integer(env, 'RETENTION_EMAIL_DAYS', 30, 365),
    urlDays: integer(env, 'RETENTION_URL_DAYS', 30, 365),
    fileDays: integer(env, 'RETENTION_FILE_DAYS', 30, 365),
    notificationDays: integer(env, 'RETENTION_NOTIFICATION_DAYS', 90, 365),
    auditReviewDays: 90, // Review date only; audit rows are never purged here.
  });
}
export function retentionExpiry(category, now = new Date()) {
  const days = retentionPolicy()[`${category}Days`];
  if (!Number.isInteger(days)) throw new Error('Unsupported retention category');
  return new Date(now.getTime() + days * DAY_MS);
}

// Preserve all investigation-linked sources, including closed cases. Unknown or
// high risk sources require manual review; expiry must not cancel escalation.
export function retentionCategories(now) {
  const protectedIncident = { OR: [{ legalHold: true }, { status: { notIn: ['CLOSED', 'FALSE_POSITIVE'] } }] };
  const ownerClear = { reportedIncidents: { none: protectedIncident } };
  const analysis = {
    expiresAt: { lte: now },
    status: 'COMPLETED',
    severity: { in: ['LOW', 'MEDIUM'] },
    analyzedAt: { not: null },
    incidentEvidence: { none: {} },
    user: ownerClear,
  };
  return [
    {
      name: 'approvalPayloads',
      model: 'toolApproval',
      where: { status: 'PENDING', expiresAt: { lte: now }, user: ownerClear },
      data: { status: 'EXPIRED', encryptedParameters: null },
    },
    {
      name: 'chats',
      model: 'chatSession',
      where: {
        expiresAt: { lte: now },
        owner: ownerClear,
        aiUsage: { none: { status: { in: ['RESERVED', 'UNKNOWN'] } } },
        // Receipts may be needed for escalation, investigation or execution recovery.
        // Retain sessions with any receipts until a separate reviewed disposal plan.
        toolApprovals: { none: {} },
      },
    },
    { name: 'emails', model: 'emailAnalysis', where: { ...analysis, toolApprovals: { none: {} } } },
    { name: 'urls', model: 'urlAnalysis', where: { ...analysis, toolApprovals: { none: {} } } },
    {
      name: 'files',
      model: 'fileAnalysis',
      where: { ...analysis, storageKey: null, deletedAt: { not: null }, communityAttachment: { is: null } },
    },
    {
      name: 'notifications',
      model: 'notification',
      where: {
        expiresAt: { lte: now },
        OR: [
          { incidentId: null },
          {
            incident: { legalHold: false, status: { in: ['CLOSED', 'FALSE_POSITIVE'] }, retentionUntil: { lte: now } },
          },
        ],
      },
    },
    { name: 'revokedSessions', model: 'revokedSession', where: { expiresAt: { lte: now } } },
  ];
}
