import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createIncidentAwarenessService, IncidentAwarenessError } from '../awareness/incident-awareness-service.js';
import { TrainingError } from '../training/training-policy.js';

export function createIncidentAwarenessRouter({ database, config }) {
  const router = Router(),
    service = createIncidentAwarenessService(database);
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
        error: { code: 'INCIDENT_AWARENESS_RATE_LIMIT', message: 'Too many awareness requests. Try again shortly.' },
      },
    }),
  );
  const handle = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (error instanceof IncidentAwarenessError)
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      if (error instanceof TrainingError)
        return res
          .status(400)
          .json({ error: { code: 'AWARENESS_ACTION_INVALID', message: 'Review the warning fields and try again.' } });
      next(error);
    }
  };
  router.get(
    '/',
    handle((req) => service.patterns(req.query)),
  );
  router.post(
    '/warnings',
    json({ limit: '16kb', inflate: false }),
    handle((req) => {
      if (Object.keys(req.query).length || !req.is('application/json'))
        throw new IncidentAwarenessError(
          415,
          'AWARENESS_CONTENT_TYPE',
          'Use application/json without query parameters.',
        );
      return service.prepareWarning(req.user, req.body);
    }),
  );
  return router;
}
