import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { CommunityError, createCommunityService } from '../community/community-service.js';
import { TrainingError, fields } from '../training/training-policy.js';

export function createCommunityRouter({ database, config }) {
  const router = Router(), service = createCommunityService(database);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store, max-age=0'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('EMPLOYEE'), createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60000, limit: 120, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'COMMUNITY_RATE_LIMIT', message: 'Too many requests. Try again shortly.' } } }));
  const writeLimit = rateLimit({ windowMs: 60000, limit: 30, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'COMMUNITY_WRITE_LIMIT', message: 'Too many submissions. Try again shortly.' } } });
  const handle = (fn) => async (req, res, next) => {
    try { res.json(await fn(req)); } catch (error) {
      if (error instanceof CommunityError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      if (error instanceof TrainingError) return res.status(error.status).json({ error: { code: 'COMMUNITY_INVALID', message: 'Invalid community request.' } });
      next(error);
    }
  };
  router.get('/', handle((req) => service.approved(req.query)));
  router.get('/mine', handle((req) => service.mine(req.user, req.query)));
  router.get('/mine/:id', handle((req) => { fields(req.query, []); return service.ownDetail(req.user, req.params.id); }));
  router.get('/:id', handle((req) => { fields(req.query, []); return service.approvedDetail(req.params.id); }));
  router.post('/', writeLimit, json({ limit: '16kb', inflate: false }), handle((req) => {
    fields(req.query, []);
    if (!req.is('application/json')) throw new CommunityError(415, 'COMMUNITY_CONTENT_TYPE', 'Use application/json.');
    return service.submit(req.user, req.body);
  }));
  return router;
}
