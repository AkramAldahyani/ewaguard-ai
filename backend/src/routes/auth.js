import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticateCredentials } from '../auth/auth-service.js';
import { authCookie, issueAccessToken, verifyAccessToken } from '../auth/auth-token.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';

export function createAuthRouter({ database, config }) {
  const router = Router();
  const authenticate = createAuthenticate({ database, config });
  const trustedOrigin = createTrustedOrigin(config.frontendUrl);
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
      const user = await authenticateCredentials(database, input.email, input.password);
      if (!user) {
        console.warn(JSON.stringify({ level: 'WARN', event: 'login_failed' }));
        return invalidCredentials(res);
      }
      const token = issueAccessToken(user.id, config);
      const cookie = authCookie(config);
      res.cookie(cookie.name, token, cookie.options);
      res.set('Cache-Control', 'no-store');
      console.info(JSON.stringify({ level: 'SECURITY', event: 'login_succeeded', userId: user.id }));
      return res.json({ user, session: { expiresAt: new Date(Date.now() + config.accessTokenTtlSeconds * 1000).toISOString() } });
    } catch (error) { return next(error); }
  });

  router.post('/logout', trustedOrigin, (req, res) => {
    const cookie = authCookie(config);
    let userId;
    try { userId = verifyAccessToken(req.cookies?.[cookie.name], config).sub; } catch { /* Always clear. */ }
    res.clearCookie(cookie.name, { ...cookie.options, maxAge: undefined });
    res.set('Cache-Control', 'no-store');
    console.info(JSON.stringify({ level: 'SECURITY', event: 'logout', ...(userId ? { userId } : {}) }));
    return res.status(204).end();
  });

  router.get('/me', authenticate, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: req.user, session: { expiresAt: req.auth.expiresAt } });
  });

  return router;
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
