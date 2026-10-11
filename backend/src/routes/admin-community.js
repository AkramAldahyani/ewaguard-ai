import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createModerationService } from '../community/moderation-service.js';
import { CommunityError } from '../community/community-service.js';
import { TrainingError, fields } from '../training/training-policy.js';

export function createAdminCommunityRouter({ database, config }) {
  const router = Router(), service = createModerationService(database);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store, max-age=0'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('IT_SECURITY_ADMIN'),
    createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60000, limit: 120, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'COMMUNITY_RATE_LIMIT', message: 'Too many requests. Try again shortly.' } } }));
  const decisionLimit = rateLimit({ windowMs: 60000, limit: 30, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'COMMUNITY_DECISION_LIMIT', message: 'Too many decisions. Try again shortly.' } } });
  const handle = (fn) => async (req, res, next) => {
    try { res.json(await fn(req)); } catch (error) {
      if (error instanceof CommunityError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      if (error instanceof TrainingError) return res.status(error.status).json({ error: { code: 'COMMUNITY_INVALID', message: 'Invalid community request.' } });
      next(error);
    }
  };
  router.get('/', handle((req) => service.list(req.query)));
  router.get('/:id', handle((req) => { fields(req.query, []); return service.detail(req.params.id); }));
  router.post('/:id/:action', decisionLimit, json({ limit: '8kb', inflate: false }), handle((req) => {
    fields(req.query, []);
    if (!req.is('application/json')) throw new CommunityError(415, 'COMMUNITY_CONTENT_TYPE', 'Use application/json.');
    const decision = { approve: 'APPROVED', reject: 'REJECTED', remove: 'REMOVED' }[req.params.action];
    if (!decision) throw new CommunityError(404, 'COMMUNITY_NOT_FOUND', 'Moderation action not found.');
    return service.decide(req.user, req.params.id, decision, req.body);
  }));
  return router;
}
