import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createMonthlyQuizService } from '../training/monthly-quiz-service.js';
import { TrainingError, fail, fields } from '../training/training-policy.js';

export function createMonthlyQuizRouter({ database, config, admin = false }) {
  const router = Router(), service = createMonthlyQuizService(database);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole(admin ? 'IT_SECURITY_ADMIN' : 'EMPLOYEE'), createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60000, limit: 120, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'MONTHLY_QUIZ_RATE_LIMIT', message: 'Too many requests. Try again shortly.' } } }));
  const writeLimit = rateLimit({ windowMs: 60000, limit: 60, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'MONTHLY_QUIZ_WRITE_LIMIT', message: 'Too many updates. Try again shortly.' } } });
  const handle = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (error) {
    if (error instanceof TrainingError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    next(error);
  } };
  const post = (path, fn) => router.post(path, writeLimit, json({ limit: '64kb', inflate: false }), handle((req) => {
    fields(req.query, []); if (!req.is('application/json')) fail('Use application/json.', 415); return fn(req);
  }));
  router.get('/', handle((req) => admin ? service.adminList(req.query) : service.employeeList(req.user, req.query)));
  if (admin) {
    post('/', (req) => service.create(req.user, req.body));
    router.get('/:id/report', handle((req) => service.report(req.params.id, req.query)));
    post('/:id/edit', (req) => service.edit(req.user, req.params.id, req.body));
    for (const action of ['approve', 'publish', 'archive']) post(`/:id/${action}`, (req) => service.action(req.user, req.params.id, action, req.body));
    router.get('/:id', handle((req) => { fields(req.query, []); return service.adminDetail(req.params.id); }));
  } else {
    router.get('/history', handle((req) => service.history(req.user, req.query)));
    post('/:id/attempts', (req) => service.start(req.user, req.params.id, req.body));
    router.get('/:id/attempts/:attemptId', handle((req) => { fields(req.query, []); return service.result(req.user, req.params.id, req.params.attemptId); }));
    post('/:id/attempts/:attemptId/submit', (req) => service.submit(req.user, req.params.id, req.params.attemptId, req.body));
    router.get('/:id', handle((req) => { fields(req.query, []); return service.employeeDetail(req.user, req.params.id); }));
  }
  return router;
}
