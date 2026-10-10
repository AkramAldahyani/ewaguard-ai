import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticateCredentials, findActiveUser } from '../auth/auth-service.js';
import { cancelMfa, completeMfa, mfaCookie, securityEvent, startMfa } from '../auth/mfa-service.js';
import { authCookie, issueAccessToken, verifyAccessToken } from '../auth/auth-token.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { revokeSession } from '../auth/session.js';

export function createAuthRouter({ database, config }) {
  const router = Router();
  const authenticate = createAuthenticate({ database, config });
  const trustedOrigin = createTrustedOrigin(config.trustedOrigins);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const mfaLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'MFA_RATE_LIMITED', message: 'Too many verification attempts. Please try again later.' } }),
  });
  const loginLimiter = rateLimit({
    windowMs: config.loginRateLimitWindowMinutes * 60_000,
    limit: config.loginRateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (_req, res) => res.status(429).json({
      error: { code: 'LOGIN_RATE_LIMITED', message: 'Too many sign-in attempts. Please try again later.' },
    }),
  });

  router.post('/login', loginLimiter, trustedOrigin, async (req, res, next) => {
    try {
      const input = validateLogin(req.body);
      if (!input) return invalidCredentials(res);
      const credentials = await authenticateCredentials(database, input.email, input.password);
      if (!credentials) {
        console.warn(JSON.stringify({ level: 'WARN', event: 'login_failed' }));
        return invalidCredentials(res);
      }
      const { user, credentialHash } = credentials;
      if (user.role === 'IT_SECURITY_ADMIN') {
        const access = authCookie(config);
        res.clearCookie(access.name, { ...access.options, maxAge: undefined });
        const challenge = await startMfa(database, user.id, config, credentialHash);
        if (!challenge) return res.status(503).json({ error: { code: 'SIGN_IN_UNAVAILABLE', message: 'Sign in is temporarily unavailable. Please try again later or contact your administrator.' } });
        const pending = mfaCookie(config);
        res.cookie(pending.name, challenge.token, pending.options);
        return res.status(202).json({ mfaRequired: true, enrollment: challenge.enrollment,
          ...(challenge.provisioningUri ? { provisioningUri: challenge.provisioningUri } : {}) });
      }
      const token = issueAccessToken(user.id, config);
      const cookie = authCookie(config);
      res.cookie(cookie.name, token, cookie.options);
      res.set('Cache-Control', 'no-store');
      console.info(JSON.stringify({ level: 'SECURITY', event: 'login_succeeded', userId: user.id }));
      return res.json({ user, session: sessionMetadata(token, config) });
    } catch (error) { return next(error); }
  });

  router.post('/mfa/verify', mfaLimiter, trustedOrigin, async (req, res, next) => {
    try {
      const pending = mfaCookie(config);
      const code = req.body && Object.keys(req.body).length === 1 ? req.body.code : undefined;
      const result = await completeMfa(database, req.cookies?.[pending.name], code, config);
      if (!result) return res.status(401).json({ error: { code: 'MFA_VERIFICATION_FAILED', message: 'Verification failed. Check your code or return to sign in.' } });
      const user = await findActiveUser(database, result.userId, result.enabledAt.toISOString());
      if (!user) return invalidCredentials(res);
      const access = authCookie(config);
      const token = issueAccessToken(user.id, config, result.enabledAt);
      res.cookie(access.name, token, access.options);
      res.clearCookie(pending.name, { ...pending.options, maxAge: undefined });
      securityEvent('admin_authentication_succeeded', user.id);
      return res.json({ user, session: sessionMetadata(token, config) });
    } catch (error) { return next(error); }
  });

  router.post('/logout', trustedOrigin, async (req, res, next) => {
    try {
      const pending = mfaCookie(config);
      const cookie = authCookie(config);
      res.clearCookie(cookie.name, { ...cookie.options, maxAge: undefined });
      res.clearCookie(pending.name, { ...pending.options, maxAge: undefined });
      await cancelMfa(database, req.cookies?.[pending.name], config);
      const claims = await revokeSession(database, config, req.cookies?.[cookie.name]);
      if (claims) req.app.locals.realtime?.disconnectSession(claims.jti);
      const userId = claims?.sub;
      securityEvent('logout', userId);
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  router.get('/me', authenticate, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: req.user, session: { id: req.auth.sessionId, expiresAt: req.auth.expiresAt } });
  });

  return router;
}

function sessionMetadata(token, config) {
  const claims = verifyAccessToken(token, config);
  return { id: claims.jti, expiresAt: new Date(claims.exp * 1000).toISOString() };
}

function validateLogin(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.keys(body).every((key) => ['email', 'password'].includes(key))) return null;
  if (typeof body.email !== 'string' || typeof body.password !== 'string') return null;
  const email = body.email.trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254 || body.password.length < 1 || body.password.length > 128) return null;
  return { email, password: body.password };
}

function invalidCredentials(res) {
  res.set('Cache-Control', 'no-store');
  return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
}
