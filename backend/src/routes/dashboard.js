import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createDashboardService } from '../dashboard/dashboard-service.js';

export function createDashboardRouter({ database, config }) {
  const router = Router(), service = createDashboardService(database);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store, max-age=0'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('IT_SECURITY_ADMIN'),
    createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60_000, limit: 60, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'DASHBOARD_RATE_LIMIT', message: 'Too many dashboard requests. Try again shortly.' } } }));
  router.get('/', async (req, res, next) => {
    if (Object.keys(req.query).length) return res.status(400).json({ error: { code: 'DASHBOARD_INVALID', message: 'Unsupported dashboard query.' } });
    try { return res.json(await service.overview(req.user)); } catch (error) { return next(error); }
  });
  return router;
}
