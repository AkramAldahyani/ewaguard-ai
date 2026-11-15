import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createTrainingService } from '../training/training-service.js';
import { createCourseQuizService } from '../training/course-quiz-service.js';
import { TrainingError, fail, fields } from '../training/training-policy.js';

export function createTrainingRouter({ database, config, admin = false }) {
  const router = Router();
  const service = createTrainingService(database);
  const quizzes = createCourseQuizService(database);
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
      limit: 120,
      keyGenerator: (req) => req.user.id,
      message: { error: { code: 'TRAINING_RATE_LIMIT', message: 'Too many requests. Try again shortly.' } },
    }),
  );
  const handle = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (error instanceof TrainingError)
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      next(error);
    }
  };
  const writes = rateLimit({
    windowMs: 60000,
    limit: 60,
    keyGenerator: (req) => req.user.id,
    message: { error: { code: 'TRAINING_WRITE_LIMIT', message: 'Too many updates. Try again shortly.' } },
  });
  const post = (path, fn) =>
    router.post(
      path,
      writes,
      json({ limit: '64kb', inflate: false }),
      handle((req) => {
        fields(req.query, []);
        if (!req.is('application/json')) fail('Use application/json.', 415);
        return fn(req);
      }),
    );
  router.get(
    '/',
    handle((req) => (admin ? service.programs(req.query) : service.mine(req.user, req.query))),
  );
  if (admin) {
    router.get(
      '/employees',
      handle((req) => service.employees(req.query)),
    );
    post('/', (req) => service.create(req.user, req.body));
    router.get(
      '/:id/quiz',
      handle((req) => {
        fields(req.query, []);
        return quizzes.adminDetail(req.params.id);
      }),
    );
    post('/:id/quiz', (req) => quizzes.save(req.user, req.params.id, req.body));
    post('/:id/quiz/edit', (req) => quizzes.save(req.user, req.params.id, req.body, true));
    for (const action of ['approve', 'publish'])
      post(`/:id/quiz/${action}`, (req) => quizzes.transition(req.user, req.params.id, action, req.body));
    router.get(
      '/:id/quiz/attempts',
      handle((req) => quizzes.adminAttempts(req.params.id, req.query)),
    );
    router.get(
      '/:id/assignments',
      handle((req) => service.assignments(req.params.id, req.query)),
    );
    post('/:id/assignments', (req) => service.assign(req.user, req.params.id, req.body));
    post('/:id/assignments/bulk', (req) => service.assignMany(req.user, req.params.id, req.body));
    for (const operation of ['edit', 'review', 'publish', 'archive'])
      post(`/:id/${operation}`, (req) => service.change(req.user, req.params.id, operation, req.body));
  } else {
    router.get(
      '/:id/quiz',
      handle((req) => {
        fields(req.query, []);
        return quizzes.employeeDetail(req.user, req.params.id);
      }),
    );
    post('/:id/quiz/attempts', (req) => quizzes.start(req.user, req.params.id, req.body));
    router.get(
      '/:id/quiz/attempts/:attemptId',
      handle((req) => {
        fields(req.query, []);
        return quizzes.result(req.user, req.params.id, req.params.attemptId);
      }),
    );
    post('/:id/quiz/attempts/:attemptId/submit', (req) =>
      quizzes.submit(req.user, req.params.id, req.params.attemptId, req.body),
    );
    for (const operation of ['start', 'sections'])
      post(`/:id/${operation}`, (req) => service.advance(req.user, req.params.id, operation, req.body));
  }
  router.get(
    '/:id',
    handle((req) => {
      fields(req.query, []);
      return admin ? service.detail(req.params.id) : service.assigned(req.user, req.params.id);
    }),
  );
  return router;
}
