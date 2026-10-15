import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createSecurityAnalytics, SecurityAnalyticsError } from '../analytics/security-analytics.js';

export function createSecurityAnalyticsRouter({ database, config }) {
  const router = Router(), service = createSecurityAnalytics(database);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store, max-age=0'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('IT_SECURITY_ADMIN'),
    createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60_000, limit: 30, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'SECURITY_ANALYTICS_RATE_LIMIT', message: 'Too many analytics requests. Try again shortly.' } } }));
  router.get('/security', async (req, res, next) => {
    try { return res.json(await service.overview(req.query)); }
    catch (error) {
      if (error instanceof SecurityAnalyticsError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return next(error);
    }
  });
  return router;
}
