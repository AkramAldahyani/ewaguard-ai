import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createAwarenessAnalytics } from '../analytics/awareness-analytics.js';
import { AwarenessAnalyticsError } from '../analytics/awareness-policy.js';

export function createAwarenessAnalyticsRouter({ database, config }) {
  const router = Router(),
    service = createAwarenessAnalytics(database);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store, max-age=0');
    next();
  });
  router.use(
    createAuthenticate({ database, config }),
    requireRole('IT_SECURITY_ADMIN'),
    createTrustedOrigin(config.trustedOrigins),
  );
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      keyGenerator: (req) => req.user.id,
      message: {
        error: { code: 'AWARENESS_ANALYTICS_RATE_LIMIT', message: 'Too many analytics requests. Try again shortly.' },
      },
    }),
  );
  router.get('/awareness', async (req, res, next) => {
    try {
      return res.json(await service.overview(req.query));
    } catch (error) {
      if (error instanceof AwarenessAnalyticsError)
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return next(error);
    }
  });
  return router;
}
