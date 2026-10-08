import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createApprovalService } from '../ai/tools/approval-service.js';
import { ToolError } from '../ai/tools/tool-registry.js';

function fields(body, names) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== [...names].sort().join(',')) {
    throw new ToolError(400, 'TOOL_INVALID_APPROVAL', 'Provide only the required approval fields.');
  }
}

export function createToolApprovalRouter(options) {
  const { database, config, gates } = options;
  const service = createApprovalService(options);
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('EMPLOYEE'), createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60000, limit: 60, keyGenerator: (req) => req.user.id,
    standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'TOOL_RATE_LIMITED', message: 'Too many approval requests. Try again later.' } }),
  }));
  router.use((req, _res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) return next(new ToolError(415, 'TOOL_CONTENT_TYPE', 'Use application/json.'));
    next();
  }, json({ limit: '256kb', strict: true, inflate: false }));
  const envelope = (req) => ({ auth: req.auth, conversationId: req.params.conversationId, id: req.params.id });
  const base = '/conversations/:conversationId/requests';
  router.post(base, async (req, res) => {
    try {
      fields(req.body, ['requestId', 'toolName', 'parameters']);
      const value = await service.prepare({ ...envelope(req), requestId: req.body.requestId, name: req.body.toolName,
        argumentsJson: JSON.stringify(req.body.parameters) });
      res.status(value.replayed ? 200 : 201).json(value);
    } finally { delete req.body; }
  });
  router.get(`${base}/:id`, async (req, res) => res.json(await service.get(envelope(req))));
  // Private human review only. This endpoint is never a model-callable tool.
  router.get(`${base}/:id/review`, async (req, res) => res.json(await service.review(envelope(req))));
  router.post(`${base}/:id/decision`, async (req, res, next) => {
    fields(req.body, ['decision']);
    if (!['CONFIRM', 'REJECT'].includes(req.body.decision)) throw new ToolError(400, 'TOOL_INVALID_APPROVAL', 'Choose CONFIRM or REJECT.');
    const value = await service.get(envelope(req));
    if (req.body.decision === 'CONFIRM' && value.approval.status === 'PENDING') {
      return gates[value.approval.toolName === 'analyze_email' ? 'EMAIL' : 'URL'].limiter(req, res, next);
    }
    next();
  }, async (req, res) => {
    try {
      const value = await service.decide({ ...envelope(req), decision: req.body.decision });
      res.status(value.approval.status === 'EXPIRED' ? 410 : 200).json(value);
    } finally { delete req.body; }
  });
  router.use((error, req, res, next) => {
    delete req.body;
    if (!(error instanceof ToolError)) return next(error);
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
  });
  return router;
}
