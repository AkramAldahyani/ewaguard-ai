import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { CHAT_LIMITS, ChatError, PRIVACY_NOTICE, UUID, validateMessage } from '../ai/chat-policy.js';
import { createOpenAIAdapter } from '../ai/openai-adapter.js';
import { createChatService, ownedSession, messageSelect, sessionSelect } from '../ai/chat-service.js';

export function createChatRouter({ database, config, provider = createOpenAIAdapter({ apiKey: config.openaiApiKey, model: config.openaiModel }) }) {
  const router = Router();
  const service = createChatService({ database, provider });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('EMPLOYEE'), createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60_000, limit: 60, keyGenerator: (req) => req.user.id, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'CHAT_RATE_LIMITED', message: 'Too many chat requests. Try again later.' } }),
  }));
  router.use((req, _res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) return next(new ChatError(415, 'CHAT_CONTENT_TYPE', 'Use application/json.'));
    next();
  }, json({ limit: '16kb', strict: true, inflate: false }));
  router.get('/privacy', (_req, res) => res.json({ privacyNotice: PRIVACY_NOTICE, limits: CHAT_LIMITS }));
  router.post('/conversations', async (req, res) => {
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length) throw new ChatError(400, 'CHAT_INVALID_CONVERSATION', 'Send an empty JSON object to create a conversation.');
    const conversation = await database.chatSession.create({ data: { ownerId: req.user.id, expiresAt: new Date(Date.now() + CHAT_LIMITS.retentionDays * 86400000) }, select: sessionSelect });
    res.status(201).json({ conversation, privacyNotice: PRIVACY_NOTICE });
  });
  router.get('/conversations', async (req, res) => {
    const before = req.query.before;
    if (Object.keys(req.query).some((key) => key !== 'before') || (before !== undefined && (typeof before !== 'string' || !UUID.test(before)))) throw new ChatError(400, 'CHAT_INVALID_CURSOR', 'Invalid conversation cursor.');
    const conversations = await database.chatSession.findMany({ where: { ownerId: req.user.id, closedAt: null, expiresAt: { gt: new Date() }, ...(before ? { id: { lt: before } } : {}) }, orderBy: { id: 'desc' }, take: 50, select: sessionSelect });
    res.json({ conversations, nextBefore: conversations.length === 50 ? conversations.at(-1).id : null });
  });
  router.param('id', (req, _res, next, id) => {
    if (!UUID.test(id)) return next(new ChatError(404, 'CHAT_NOT_FOUND', 'Conversation not found.'));
    next();
  });
  router.get('/conversations/:id', async (req, res) => {
    const session = await ownedSession(database, req.user.id, req.params.id);
    const before = req.query.before;
    if (Object.keys(req.query).some((key) => key !== 'before') || (before !== undefined && (typeof before !== 'string' || !/^\d{1,9}$/.test(before)))) throw new ChatError(400, 'CHAT_INVALID_CURSOR', 'Invalid message cursor.');
    const messages = await database.chatMessage.findMany({ where: { sessionId: session.id, expiresAt: { gt: new Date() }, ...(before !== undefined ? { sequence: { lt: Number(before) } } : {}) }, orderBy: { sequence: 'desc' }, take: 50, select: messageSelect });
    res.json({ conversation: Object.fromEntries(Object.keys(sessionSelect).map((key) => [key, session[key]])), nextBefore: messages.length === 50 ? messages.at(-1).sequence : null, messages: messages.reverse(), privacyNotice: PRIVACY_NOTICE });
  });
  router.post('/conversations/:id/messages', async (req, res) => {
    const content = validateMessage(req.body);
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', cancel);
    try {
      const result = await service.send({ userId: req.user.id, sessionId: req.params.id, content, requestId: req.body.requestId, signal: controller.signal });
      res.status(result.replayed ? 200 : 201).json(result);
    } finally { res.off('close', cancel); delete req.body; }
  });
  router.use((error, _req, res, next) => {
    if (!(error instanceof ChatError)) return next(error);
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
  });
  return router;
}
