import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createIncidentFromAnalysis, reportCredentialExposure, IncidentError } from '../incidents/incident-engine.js';

export function createAnalysisEscalationRouter({ database, config }) {
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
  router.use(rateLimit({ windowMs: 60000, limit: 30, keyGenerator: (req) => req.user.id }));
  router.post('/:analyzerType/:analysisId/retry', json({ limit: '1kb', inflate: false }), async (req, res, next) => {
    if (!req.is('application/json'))
      return res
        .status(415)
        .json({ error: { code: 'INCIDENT_CONTENT_TYPE', message: 'Use application/json with an empty object.' } });
    if (req.body && (Array.isArray(req.body) || Object.keys(req.body).length)) {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INCIDENT_INPUT', message: 'No incident fields may be supplied.' } });
    }
    try {
      const incident = await createIncidentFromAnalysis(database, { ...req.params, userId: req.user.id });
      return res.json({ analysisId: req.params.analysisId, incident });
    } catch (error) {
      if (error instanceof IncidentError)
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return next(error);
    }
  });
  // Explicit employee confirmation only: the body is a fixed statement, never free text or a severity.
  router.post('/:analyzerType/:analysisId/exposure', json({ limit: '1kb', inflate: false }), async (req, res, next) => {
    if (!req.is('application/json'))
      return res.status(415).json({ error: { code: 'INCIDENT_CONTENT_TYPE', message: 'Use application/json.' } });
    const body = req.body;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).sort().join() !== 'confirmed,exposure' ||
      body.exposure !== 'CREDENTIALS_SUBMITTED' ||
      body.confirmed !== true
    ) {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_EXPOSURE_REPORT', message: 'Confirm the credential exposure report only.' } });
    }
    try {
      const incident = await reportCredentialExposure(database, { ...req.params, userId: req.user.id });
      return res.json({ analysisId: req.params.analysisId, incident });
    } catch (error) {
      if (error instanceof IncidentError)
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return next(error);
    }
  });
  return router;
}
