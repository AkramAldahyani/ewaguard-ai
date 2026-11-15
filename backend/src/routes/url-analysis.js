import { Router, json } from 'express';
import { createAnalysisGate, ANALYSIS_REQUEST_LIMITS } from '../analyzers/analysis-gate.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createThreatIntelligence } from '../services/threat-intelligence.js';
import { createUrlAnalyzer, submitUrlAnalysis } from '../analyzers/url/url-analyzer.js';
import { UrlAnalysisError } from '../analyzers/url/url-normalization.js';
import { submitOnce } from '../analyzers/submission-idempotency.js';

export const URL_SUBMISSION_LIMIT = ANALYSIS_REQUEST_LIMITS.URL;
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
export function createUrlAnalysisRouter({
  database,
  config,
  threatIntelligence = createThreatIntelligence({ apiKey: config.virusTotalApiKey }),
  analyzer = createUrlAnalyzer({ threatIntelligence }),
  gate = createAnalysisGate('URL'),
}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(
    createAuthenticate({ database, config }),
    requireRole('EMPLOYEE'),
    createTrustedOrigin(config.trustedOrigins),
  );
  router.use(gate.limiter);
  router.post(
    '/',
    (req, res, next) => {
      if (!req.is('application/json')) return fail(res, 415, 'URL_CONTENT_TYPE', 'Use application/json.');
      next();
    },
    json({ limit: '26kb', strict: true, inflate: false }),
    async (req, res, next) => {
      let release;
      try {
        if (
          !req.body ||
          Array.isArray(req.body) ||
          Object.keys(req.body).length !== 1 ||
          !Object.hasOwn(req.body, 'url')
        )
          throw new UrlAnalysisError();
        release = gate.acquire();
        const response = await submitOnce(
          database,
          {
            key: req.get('Idempotency-Key'),
            userId: req.user.id,
            type: 'URL',
            payload: JSON.stringify(req.body.url),
            secret: config.jwtSecret,
          },
          (db) => submitUrlAnalysis(db, { userId: req.user.id, input: req.body.url }, analyzer),
        );
        return res.status(response.incident.state === 'PENDING' ? 202 : 201).json(response);
      } catch (error) {
        if (error instanceof UrlAnalysisError) return fail(res, 400, error.code, error.message);
        return next(error);
      } finally {
        release?.();
        delete req.body;
      }
    },
  );
  return router;
}
