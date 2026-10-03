import { authCookie, verifyAccessToken } from '../auth/auth-token.js';
import { findActiveUser } from '../auth/auth-service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAuthenticate({ database, config }) {
  return async function authenticate(req, res, next) {
    try {
      const token = req.cookies?.[authCookie(config).name];
      if (!token) return unauthorized(res);
      const claims = verifyAccessToken(token, config);
      if (typeof claims.sub !== 'string' || !UUID.test(claims.sub) || typeof claims.exp !== 'number') {
        return unauthorized(res);
      }
      const user = await findActiveUser(database, claims.sub);
      if (!user) return unauthorized(res);
      req.auth = Object.freeze({ userId: user.id, expiresAt: new Date(claims.exp * 1000).toISOString() });
      req.user = Object.freeze(user);
      return next();
    } catch (error) {
      if (error?.name === 'TokenExpiredError' || error?.name === 'JsonWebTokenError' || error?.name === 'NotBeforeError') {
        return unauthorized(res);
      }
      return next(error);
    }
  };
}

function unauthorized(res) {
  res.set('Cache-Control', 'no-store');
  return res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' } });
}
