import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createIncidentManagement } from '../incidents/incident-management.js';
import { ManagementError, fields } from '../incidents/management-policy.js';

export function createIncidentRouter({ database, config, admin = false }) {
  const router = Router();
  const service = createIncidentManagement(database);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(
    createAuthenticate({ database, config }),
    requireRole(admin ? 'IT_SECURITY_ADMIN' : 'EMPLOYEE'),
    createTrustedOrigin(config.trustedOrigins),
  );
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 180,
      keyGenerator: (req) => req.user.id,
      message: { error: { code: 'INCIDENT_RATE_LIMIT', message: 'Too many requests. Try again shortly.' } },
    }),
  );
  const handle = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (error instanceof ManagementError)
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      next(error);
    }
  };
  router.get(
    '/',
    handle((req) => service.list(req.user, admin, req.query)),
  );
  router.get(
    '/summary',
    handle((req) => {
      fields(req.query, []);
      return service.summary(req.user, admin);
    }),
  );
  if (admin)
    router.get(
      '/assignees',
      handle((req) => service.assignees(req.query)),
    );
  router.get(
    '/:id',
    handle((req) => {
      fields(req.query, []);
      return service.detail(req.user, admin, req.params.id);
    }),
  );
  router.get(
    '/:id/history',
    handle((req) => service.history(req.user, admin, req.params.id, req.query)),
  );
  router.get(
    '/:id/notes',
    handle((req) => service.notes(req.user, admin, req.params.id, req.query)),
  );
  if (admin) {
    const writes = rateLimit({
      windowMs: 60000,
      limit: 60,
      keyGenerator: (req) => req.user.id,
      message: { error: { code: 'INCIDENT_WRITE_LIMIT', message: 'Too many updates. Try again shortly.' } },
    });
    for (const operation of ['assignment', 'status', 'notes'])
      router.post(
        `/:id/${operation}`,
        writes,
        json({ limit: '20kb', inflate: false }),
        handle((req) => {
          fields(req.query, []);
          if (!req.is('application/json'))
            throw new ManagementError(415, 'INCIDENT_CONTENT_TYPE', 'Use application/json.');
          return service.mutate(req.user, req.params.id, operation, req.body);
        }),
      );
  }
  return router;
}
