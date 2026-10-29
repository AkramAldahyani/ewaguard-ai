import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const IMAGE_PIPELINE = 'community-image-v1';
export const DAY = 86400000;
export class CommunityMediaError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
export function mediaPolicy(env = process.env) {
  const number = (key, fallback, max) => {
    const value = env[key] ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw new Error(`Invalid ${key}`);
    return Number(value);
  };
  const root = env.COMMUNITY_MEDIA_ROOT || path.join(tmpdir(), 'ewaguard-community-images');
  const repository = fileURLToPath(new URL('../../../', import.meta.url));
  if (!path.isAbsolute(root) || path.parse(root).root === path.resolve(root) ||
      !path.relative(repository, root).startsWith('..')) throw new Error('COMMUNITY_MEDIA_ROOT must be a dedicated directory outside the repository');
  return Object.freeze({ root: path.resolve(root), maxImages: number('COMMUNITY_MAX_IMAGES', 4, 4),
    maxBytes: number('COMMUNITY_IMAGE_MAX_MIB', 5, 8) * 1024 * 1024,
    maxPixels: number('COMMUNITY_IMAGE_MAX_MEGAPIXELS', 16, 24) * 1000000,
    maxOutputBytes: 8 * 1024 * 1024,
    maxUserBytes: number('COMMUNITY_IMAGE_USER_QUOTA_MIB', 100, 1024) * 1024 * 1024,
    maxStoreBytes: number('COMMUNITY_IMAGE_TOTAL_QUOTA_MIB', 1024, 102400) * 1024 * 1024,
    retentionDays: number('COMMUNITY_IMAGE_RETENTION_DAYS', 90, 365),
    rejectedDays: number('COMMUNITY_IMAGE_REJECTED_DAYS', 7, 30), uploadTimeoutMs: 30000 });
}

export function reviewableImage(file, now = new Date()) {
  return Boolean(file && file.storageKey && !file.deletedAt && file.expiresAt > now &&
    file.status === 'COMPLETED' && file.detectedMime === 'image/png' && file.extension === 'png' &&
    file.clamavStatus === 'NO_KNOWN_DETECTION' && file.yaraStatus === 'NO_KNOWN_DETECTION' &&
    file.evidence?.pipeline === IMAGE_PIPELINE && file.evidence?.originalScanned === true &&
    file.evidence?.normalizedScanned === true);
}

export const attachmentSelection = { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true,
  fileAnalysis: { select: { status: true, storageKey: true, sha256: true, sizeBytes: true, detectedMime: true,
    extension: true, evidence: true, clamavStatus: true, yaraStatus: true, deletedAt: true, expiresAt: true } } } };

export function presentImages(attachments = [], admin = false) {
  return [...attachments].sort((a, b) => (a.fileAnalysis.evidence?.position ?? 0) - (b.fileAnalysis.evidence?.position ?? 0)).map(({ id, fileAnalysis: file }) => ({ id, kind: 'IMAGE',
    available: reviewableImage(file), width: file.evidence?.width ?? null, height: file.evidence?.height ?? null,
    ...(admin ? { clamavStatus: file.clamavStatus, yaraStatus: file.yaraStatus,
      validationStatus: file.evidence?.pipeline === IMAGE_PIPELINE ? 'NORMALIZED' : 'UNVERIFIED' } : {}) }));
}
