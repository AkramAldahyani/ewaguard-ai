import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { DISCLAIMER_DEFINITION } from '../../../shared/disclaimer.js';
import { RETRIEVAL_LIMITS, RETRIEVAL_PRIVACY, RetrievalError } from '../rag/retrieval-policy.js';
import { createRetrievalService } from '../rag/retrieval-service.js';

export function createKnowledgeRouter({ database, config, provider }) {
  const router = Router();
  const service = createRetrievalService({ database, config, provider });
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  router.use(
    createAuthenticate({ database, config }),
    requireRole('EMPLOYEE'),
    createTrustedOrigin(config.trustedOrigins),
  );
  router.get('/privacy', (_req, res) =>
    res.json({
      privacyNotice: RETRIEVAL_PRIVACY,
      disclaimer: DISCLAIMER_DEFINITION,
      acknowledgementContext: 'CHAT',
      limits: RETRIEVAL_LIMITS,
    }),
  );
  router.post(
    '/search',
    rateLimit({
      windowMs: 60_000,
      limit: 10,
      keyGenerator: (req) => req.user.id,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) =>
        res
          .status(429)
          .json({ error: { code: 'RETRIEVAL_RATE_LIMITED', message: 'Too many searches. Try again shortly.' } }),
    }),
    (req, _res, next) => {
      if (!req.is('application/json'))
        return next(new RetrievalError(415, 'RETRIEVAL_CONTENT_TYPE', 'Use application/json.'));
      next();
    },
    json({ limit: '8kb', strict: true, inflate: false }),
    async (req, res) => {
      const controller = new AbortController();
      const cancel = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', cancel);
      try {
        if (Object.keys(req.query).length)
          throw new RetrievalError(400, 'RETRIEVAL_INVALID_REQUEST', 'Send search parameters in the JSON body only.');
        res.json(await service.retrieve({ auth: req.auth, body: req.body, signal: controller.signal }));
      } finally {
        res.off('close', cancel);
        delete req.body;
      }
    },
  );
  router.use((error, _req, res, next) => {
    if (!(error instanceof RetrievalError)) return next(error);
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
  });
  return router;
}
