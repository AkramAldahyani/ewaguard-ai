import { CommunityError } from './community-service.js';

export const publicCommentWhere = { status: 'APPROVED', OR: [{ parentId: null }, { parent: { status: 'APPROVED' } }] };
export function commentText(value, max = 2000) {
  if (typeof value === 'string') value = value.normalize('NFKC');
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>\p{Cf}]/u.test(value) ||
    Array.from(value).some((c) => { const n = c.codePointAt(0); return n === 127 || n < 32 && ![9, 10, 13].includes(n); }))
    throw new CommunityError(400, 'COMMENT_INVALID', `Use plain text of 1–${max} characters without HTML.`);
  return value.trim();
}
export function screenComment(text) {
  // Conservative indicators, not comprehensive DLP or abuse detection. Human
  // post-publication review remains necessary when these patterns do not match.
  if (/-----BEGIN[\s\w]*PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\b(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,})\b|\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}|\b(?:password|passwd|api[_ -]?key|secret|access[_ -]?token)\s*[:=]\s*\S{4,}|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:CPR|passport|customer[_ -]?id)\s*[:=]\s*\w{5,}/i.test(text))
    throw new CommunityError(400, 'COMMENT_SENSITIVE', 'Remove credentials, secrets and personal information. Use the approved incident-reporting process for sensitive evidence.');
  if (/\b(?:i(?:'ll| will)|we(?:'ll| will))\s+(?:kill|hurt)\s+you\b/i.test(text))
    throw new CommunityError(400, 'COMMENT_ABUSE', 'Keep comments respectful and focused on cybersecurity learning.');
}
