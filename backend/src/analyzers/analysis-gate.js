import { rateLimit } from 'express-rate-limit';

export const ANALYSIS_REQUEST_LIMITS = Object.freeze({ EMAIL: 30, URL: 10 });
export class AnalysisGateError extends Error {
  constructor(type) {
    super('Analysis is busy. Try again shortly.');
    this.status = 503;
    this.code = `${type}_BUSY`;
  }
}

// One gate per analyzer per app, shared by direct routes and human approvals.
// Release only when processing completes; disconnected approval requests must
// not free a slot while their network-facing analyzer is still running.
export function createAnalysisGate(type) {
  if (!Object.hasOwn(ANALYSIS_REQUEST_LIMITS, type)) throw new TypeError('Unsupported analyzer gate.');
  let active = 0;
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: ANALYSIS_REQUEST_LIMITS[type],
    keyGenerator: (req) => req.user.id,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: { code: `${type}_RATE_LIMITED`, message: 'Too many analysis requests. Try again in a minute.' },
      }),
  });
  return Object.freeze({
    limiter,
    acquire() {
      if (active >= 4) throw new AnalysisGateError(type);
      active++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          active--;
        }
      };
    },
  });
}
