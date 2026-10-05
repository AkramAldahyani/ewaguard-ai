import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { isDisclaimerContext } from '../../../shared/disclaimer.js';
import { acknowledgeDisclaimer } from '../disclaimers/disclaimer-service.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';

export function createDisclaimerRouter({ database, config }) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'ACKNOWLEDGEMENT_RATE_LIMITED', message: 'Too many acknowledgement requests. Please try again shortly.' } }),
  });
  router.use(createAuthenticate({ database, config }), requireRole('EMPLOYEE'));
  router.post('/acknowledge', limiter, createTrustedOrigin(config.trustedOrigins), async (req, res, next) => {
    try {
      const context = validateBody(req.body);
      if (!context) return res.status(400).json({ error: { code: 'INVALID_ACKNOWLEDGEMENT', message: 'A supported disclaimer context is required.' } });
      const result = await acknowledgeDisclaimer(database, { userId: req.user.id, context });
      return res.status(result.reused ? 200 : 201).json({ acknowledgement: {
        id: result.acknowledgement.id,
        context: result.acknowledgement.context,
        version: result.acknowledgement.version,
        acknowledgedAt: result.acknowledgement.createdAt.toISOString(),
        reused: result.reused,
      } });
    } catch (error) { return next(error); }
  });
  return router;
}

function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'context')) return null;
  return isDisclaimerContext(body.context) ? body.context : null;
}
