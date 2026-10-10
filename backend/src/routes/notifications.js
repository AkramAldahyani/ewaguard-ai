import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { ManagementError, fields } from '../incidents/management-policy.js';
import { createNotificationService } from '../notifications/notification-service.js';

export function createNotificationRouter({ database, config }) {
  const router = Router(); const service = createNotificationService(database);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('EMPLOYEE', 'IT_SECURITY_ADMIN'), createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60000, limit: 120, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'NOTIFICATION_RATE_LIMIT', message: 'Too many requests. Try again shortly.' } } }));
  const handle = (fn) => async (req, res, next) => {
    try { res.json(await fn(req)); } catch (error) {
      if (error instanceof ManagementError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      next(error);
    }
  };
  router.get('/', handle((req) => service.list(req.user, req.query)));
  router.get('/unread-count', handle((req) => { fields(req.query, []); return service.unread(req.user); }));
  router.post('/:id/read', json({ limit: '1kb', inflate: false }), handle((req) => {
    fields(req.query, []); fields(req.body, []);
    if (!req.is('application/json')) throw new ManagementError(415, 'NOTIFICATION_CONTENT_TYPE', 'Use application/json.');
    return service.markRead(req.user, req.params.id);
  }));
  return router;
}
