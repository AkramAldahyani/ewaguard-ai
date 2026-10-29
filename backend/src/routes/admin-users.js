import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createUserService } from '../users/user-service.js';
import { UserManagementError, fields, fail } from '../users/user-policy.js';

function handle(fn, status = 200) {
  return async (req, res, next) => {
    try { res.status(status).json(await fn(req)); } catch (error) {
      if (error instanceof UserManagementError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      if (error.code === 'P2002') return res.status(409).json({ error: { code: 'USER_IDENTITY_EXISTS', message: 'That email or employee ID is already assigned to an account.' } });
      if (error.code === 'P2034') return res.status(409).json({ error: { code: 'USER_CONFLICT', message: 'The account changed concurrently. Reload and try again.' } });
      next(error);
    }
  };
}
const noQuery = (req) => fields(req.query, []);
function jsonOnly(req, _res, next) {
  try { noQuery(req); if (!req.is('application/json')) fail(415, 'USER_CONTENT_TYPE', 'Use application/json.'); next(); } catch (error) { next(error); }
}
function errors(error, _req, res, next) {
  if (error instanceof UserManagementError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  next(error);
}
const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); };
export function createAdminUsersRouter({ database, config }) {
  const router = Router(), service = createUserService(database, config);
  router.use(noStore, createAuthenticate({ database, config }), requireRole('IT_SECURITY_ADMIN'), createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60000, limit: 120, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'USER_RATE_LIMIT', message: 'Too many requests. Try again shortly.' } } }));
  const writeLimit = rateLimit({ windowMs: 60000, limit: 30, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'USER_WRITE_LIMIT', message: 'Too many account changes. Try again shortly.' } } });
  router.get('/', handle((req) => service.list(req.query)));
  router.get('/summary', handle((req) => { noQuery(req); return service.summary(); }));
  router.get('/options', handle((req) => { noQuery(req); return service.options(); }));
  router.get('/:id/profile', handle((req) => { noQuery(req); return service.profile(req.params.id); }));
  router.get('/:id', handle((req) => { noQuery(req); return service.detail(req.params.id); }));
  router.post('/', writeLimit, jsonOnly, json({ limit: '8kb', inflate: false }), handle((req) => service.create(req.auth, req.body), 201));
  for (const [path, method] of [['update', 'update'], ['status', 'status'], ['role', 'role'], ['setup', 'issueSetup'], ['delete', 'delete']]) {
    router.post(`/:id/${path}`, writeLimit, jsonOnly, json({ limit: '8kb', inflate: false }), handle(async (req) => {
      const result = await service[method](req.auth, req.params.id, req.body);
      if (['update', 'status', 'role', 'delete'].includes(path)) req.app.locals.realtime?.disconnectUser(req.params.id);
      return result;
    }));
  }
  router.use(errors);
  return router;
}

export function createAccountSetupRouter({ database, config }) {
  const router = Router(), service = createUserService(database, config);
  router.use(noStore, createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 15 * 60000, limit: 20,
    message: { error: { code: 'SETUP_RATE_LIMIT', message: 'Too many setup attempts. Try again later.' } } }));
  router.post('/validate', jsonOnly, json({ limit: '2kb', inflate: false }), handle((req) => service.validateSetup(req.body)));
  router.post('/', jsonOnly, json({ limit: '2kb', inflate: false }), handle((req) => service.completeSetup(req.body)));
  router.use(errors);
  return router;
}
