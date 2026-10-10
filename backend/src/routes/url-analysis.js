import { Router, json } from 'express';
import { createAnalysisGate, ANALYSIS_REQUEST_LIMITS } from '../analyzers/analysis-gate.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { DISCLAIMER_DEFINITION } from '../../../shared/disclaimer.js';
import { createThreatIntelligence } from '../services/threat-intelligence.js';
import { createUrlAnalyzer, submitUrlAnalysis } from '../analyzers/url/url-analyzer.js';
import { UrlAnalysisError } from '../analyzers/url/url-normalization.js';

export const URL_SUBMISSION_LIMIT = ANALYSIS_REQUEST_LIMITS.URL;
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
export function createUrlAnalysisRouter({ database, config, threatIntelligence = createThreatIntelligence({ apiKey: config.virusTotalApiKey }), analyzer = createUrlAnalyzer({ threatIntelligence }), gate = createAnalysisGate('URL') }) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('EMPLOYEE'), createTrustedOrigin(config.trustedOrigins));
  router.use(gate.limiter);
  router.post('/', (req, res, next) => {
    if (!req.is('application/json')) return fail(res, 415, 'URL_CONTENT_TYPE', 'Use application/json.');
    next();
  }, json({ limit: '26kb', strict: true, inflate: false }), async (req, res, next) => {
    let release;
    try {
      if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || !Object.hasOwn(req.body, 'url')) throw new UrlAnalysisError();
      release = gate.acquire();
      const now = new Date();
      const ack = await database.disclaimerAcknowledgement.findFirst({ where: {
        userId: req.user.id, context: 'URL_ANALYSIS', version: DISCLAIMER_DEFINITION.version,
        createdAt: { gte: new Date(now.getTime() - 15 * 60_000), lte: now },
      }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      if (!ack) return fail(res, 403, 'URL_ACKNOWLEDGEMENT_REQUIRED', 'A current URL analysis acknowledgement is required.');
      const response = await submitUrlAnalysis(database, { userId: req.user.id, acknowledgementId: ack.id, input: req.body.url }, analyzer);
      return res.status(response.incident.state === 'PENDING' ? 202 : 201).json(response);
    } catch (error) {
      if (error instanceof UrlAnalysisError) return fail(res, 400, error.code, error.message);
      return next(error);
    } finally { release?.(); delete req.body; }
  });
  return router;
}
