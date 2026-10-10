import { verifyAccessToken } from './auth-token.js';
import { findActiveUser } from './auth-service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function authenticateSession(database, config, token) {
  const claims = verifyAccessToken(token, config);
  if (!uuid.test(claims.sub ?? '') || !uuid.test(claims.jti ?? '') || !Number.isFinite(claims.exp)) return null;
  if (await database.revokedSession.findUnique({ where: { id: claims.jti }, select: { id: true } })) return null;
  const user = await findActiveUser(database, claims.sub, claims.mfa);
  return user ? { user, claims } : null;
}

export async function revokeSession(database, config, token) {
  let claims;
  try { claims = verifyAccessToken(token, config); } catch { return null; }
  if (!uuid.test(claims.jti ?? '') || !uuid.test(claims.sub ?? '') || !Number.isFinite(claims.exp)) return null;
  await database.revokedSession.upsert({ where: { id: claims.jti },
    create: { id: claims.jti, expiresAt: new Date(claims.exp * 1000) }, update: {} });
  return claims;
}
