import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ISSUER = 'ewaguard-api';
const AUDIENCE = 'ewaguard-web';

export function issueAccessToken(userId, config, mfaEnabledAt = null, sessionVersion = 0) {
  return jwt.sign(
    { version: sessionVersion, ...(mfaEnabledAt ? { mfa: mfaEnabledAt.toISOString() } : {}) },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      subject: userId,
      issuer: ISSUER,
      audience: AUDIENCE,
      jwtid: randomUUID(),
      expiresIn: config.accessTokenTtlSeconds,
    },
  );
}

export function verifyAccessToken(token, config) {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function authCookie(config) {
  const secure = config.nodeEnv === 'production';
  return {
    name: secure ? '__Host-ewaguard_access' : 'ewaguard_access',
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: config.accessTokenTtlSeconds * 1000,
    },
  };
}
