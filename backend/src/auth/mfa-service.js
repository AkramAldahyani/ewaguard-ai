import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Secret, TOTP } from 'otpauth';
import { authAudit } from './auth-audit.js';

const MAX_ATTEMPTS = 5;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const eligible = (user) => user?.status === 'ACTIVE' && !user.deactivatedAt && !user.deletedAt && user.role.name === 'IT_SECURITY_ADMIN';
const clearedChallenge = { mfaChallengeHash: null, mfaChallengeExpiresAt: null, mfaChallengeCredential: null, mfaPendingSecret: null, mfaChallengeAttempts: 0 };

export function mfaCookie(config) {
  const secure = config.nodeEnv === 'production';
  return { name: secure ? '__Host-ewaguard_mfa' : 'ewaguard_mfa', options: {
    httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: config.mfaChallengeTtlSeconds * 1000,
  } };
}

export function totpFor(secret, config, label = 'Administrator') {
  return new TOTP({ issuer: config.mfaIssuer, label, algorithm: 'SHA1', digits: 6, period: 30, secret });
}

export function encryptSecret(secret, userId, config) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(config.mfaEncryptionKey, 'hex'), iv);
  cipher.setAAD(Buffer.from(`ewaguard:mfa:v1:${userId}`));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptSecret(encrypted, userId, config) {
  const [version, iv, tag, ciphertext] = encrypted.split('.');
  if (version !== 'v1') throw new Error('Invalid encrypted MFA data.');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(config.mfaEncryptionKey, 'hex'), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(`ewaguard:mfa:v1:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

async function lockedUser(tx, id) {
  // Serialize enrollment, attempts and counter consumption across processes and concurrent requests.
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.user.findUnique({ where: { id }, include: { role: true } });
}

function challengeClaims(token, config) {
  try {
    const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: 'ewaguard-api', audience: 'ewaguard-mfa' });
    if (claims.purpose !== 'admin-mfa' || !/^[0-9a-f-]{36}$/i.test(claims.sub)) return null;
    return claims;
  } catch { return null; }
}

export async function startMfa(database, userId, config, credentialHash) {
  if (!config.mfaEncryptionKey) { await authAudit(database, 'MFA_START_FAILED', userId); return null; }
  const result = await database.$transaction(async (tx) => {
    const user = await lockedUser(tx, userId);
    if (!eligible(user) || user.passwordHash !== credentialHash) return null;
    const now = Date.now();
    const attempts = user.mfaChallengeExpiresAt?.getTime() > now ? user.mfaChallengeAttempts : 0;
    if (attempts >= MAX_ATTEMPTS) return null;
    const enrollment = !user.mfaEnabledAt;
    const secret = enrollment ? new Secret({ size: 20 }).base32 : null;
    const token = jwt.sign({ purpose: 'admin-mfa' }, config.jwtSecret, {
      algorithm: 'HS256', subject: user.id, audience: 'ewaguard-mfa', issuer: 'ewaguard-api',
      jwtid: randomUUID(), expiresIn: config.mfaChallengeTtlSeconds,
    });
    await tx.user.update({ where: { id: user.id }, data: {
      mfaChallengeHash: digest(token), mfaChallengeExpiresAt: new Date(now + config.mfaChallengeTtlSeconds * 1000),
      mfaChallengeCredential: digest(user.passwordHash), mfaChallengeAttempts: attempts,
      mfaPendingSecret: secret ? encryptSecret(secret, user.id, config) : null,
    } });
    return { token, enrollment, ...(enrollment ? { provisioningUri: totpFor(secret, config, user.email).toString() } : {}) };
  });
  await authAudit(database, result ? (result.enrollment ? 'MFA_ENROLLMENT_STARTED' : 'MFA_CHALLENGE_STARTED') : 'MFA_START_FAILED', userId);
  return result;
}

export async function completeMfa(database, token, code, config) {
  if (!config.mfaEncryptionKey) { await authAudit(database, 'MFA_CHALLENGE_FAILED'); return null; }
  const claims = challengeClaims(token, config);
  if (!claims) { await authAudit(database, 'MFA_CHALLENGE_FAILED'); return null; }
  let auditUserId = null;
  const result = await database.$transaction(async (tx) => {
    const user = await lockedUser(tx, claims.sub);
    if (eligible(user)) auditUserId = user.id;
    if (!eligible(user) || user.mfaChallengeHash !== digest(token) ||
        !user.mfaChallengeExpiresAt || user.mfaChallengeExpiresAt.getTime() <= Date.now() ||
        user.mfaChallengeAttempts >= MAX_ATTEMPTS || user.mfaChallengeCredential !== digest(user.passwordHash)) return null;
    const enrollment = !user.mfaEnabledAt;
    const encrypted = enrollment ? user.mfaPendingSecret : user.mfaSecretEncrypted;
    if (!encrypted) return null;
    const totp = totpFor(decryptSecret(encrypted, user.id, config), config);
    const now = Date.now();
    const delta = typeof code === 'string' && /^\d{6}$/.test(code) ? totp.validate({ token: code, window: 1, timestamp: now }) : null;
    const counter = BigInt(Math.floor(now / 30_000) + (delta ?? 0));
    if (delta === null || (user.mfaLastCounter !== null && counter <= user.mfaLastCounter)) {
      await tx.user.update({ where: { id: user.id }, data: { mfaChallengeAttempts: { increment: 1 } } });
      return null;
    }
    const enabledAt = user.mfaEnabledAt ?? new Date();
    await tx.user.update({ where: { id: user.id }, data: {
      ...clearedChallenge, mfaSecretEncrypted: encrypted, mfaEnabledAt: enabledAt, mfaLastCounter: counter, lastLoginAt: new Date(),
    } });
    // Enabling administrator MFA is a durable security mutation: audit failure
    // must roll back enrollment. Routine verification audits run after commit.
    if (enrollment) await authAudit(tx, 'MFA_ENROLLMENT_COMPLETED', user.id, { required: true });
    return { userId: user.id, enabledAt, enrollment, sessionVersion: user.sessionVersion };
  });
  if (!result || !result.enrollment) await authAudit(database, result ? 'MFA_CHALLENGE_SUCCEEDED' : 'MFA_CHALLENGE_FAILED', auditUserId);
  return result ? { userId: result.userId, enabledAt: result.enabledAt, sessionVersion: result.sessionVersion } : null;
}

export async function cancelMfa(database, token, config) {
  const claims = challengeClaims(token, config);
  if (!claims) return;
  // Preserve failure budget and expiry so cancellation cannot reset account throttling.
  const changed = await database.user.updateMany({ where: { id: claims.sub, mfaChallengeHash: digest(token) }, data: {
    mfaChallengeHash: null, mfaPendingSecret: null, mfaChallengeCredential: null,
  } });
  if (changed.count) await authAudit(database, 'MFA_CANCELLED', claims.sub);
}
