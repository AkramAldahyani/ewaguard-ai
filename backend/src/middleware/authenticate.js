import { authCookie } from '../auth/auth-token.js';
import { authenticateSession } from '../auth/session.js';

export function createAuthenticate({ database, config }) {
  return async function authenticate(req, res, next) {
    try {
      const token = req.cookies?.[authCookie(config).name];
      if (!token) return unauthorized(res);
      const session = await authenticateSession(database, config, token);
      if (!session) return unauthorized(res);
      const { user, claims } = session;
      req.auth = Object.freeze({ userId: user.id, sessionId: claims.jti, mfaVerified: Boolean(claims.mfa), expiresAt: new Date(claims.exp * 1000).toISOString() });
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
