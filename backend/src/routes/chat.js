import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { CHAT_LIMITS, ChatError, PRIVACY_NOTICE, UUID, validateMessage } from '../ai/chat-policy.js';
import { createOpenAIAdapter } from '../ai/openai-adapter.js';
import { createChatService, ownedSession, messageSelect, sessionSelect } from '../ai/chat-service.js';
import { createHash } from 'node:crypto';
import { ToolError } from '../ai/tools/tool-registry.js';
import { createToolService } from '../ai/tools/tool-service.js';
import { createPdplChat } from '../rag/pdpl-chat.js';
import { createCompanyChat } from '../rag/company-chat.js';
import { RetrievalError } from '../rag/retrieval-policy.js';

export function createChatRouter({ database, config, approvals, embeddingProvider, provider = createOpenAIAdapter({ apiKey: config.openaiApiKey, model: config.openaiModel }) }) {
  const router = Router();
  const service = createChatService({ database, provider, approvals, config, embeddingProvider });
  const pdpl = createPdplChat({ database, config, embeddingProvider });
  const company = createCompanyChat({ database, config, embeddingProvider });
  const tools = createToolService({ database });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('EMPLOYEE'), createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60_000, limit: 60, keyGenerator: (req) => req.user.id, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'CHAT_RATE_LIMITED', message: 'Too many chat requests. Try again later.' } }),
  }));
  router.use((req, _res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) return next(new ChatError(415, 'CHAT_CONTENT_TYPE', 'Use application/json.'));
    next();
  }, json({ limit: '128kb', strict: true, inflate: false }));
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
    const requests = await database.aiUsage.findMany({ where: { userId: req.user.id, sessionId: session.id, parentRequestId: null,
      OR: [{ userSequence: { gte: messages.at(-1)?.sequence ?? 0, ...(before !== undefined ? { lt: Number(before) } : {}) } },
        ...(before === undefined ? [{ userSequence: null }] : [])] }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { requestId: true, status: true, userSequence: true, toolMetadata: true } });
    res.json({ conversation: Object.fromEntries(Object.keys(sessionSelect).map((key) => [key, session[key]])), nextBefore: messages.length === 50 ? messages.at(-1).sequence : null, messages: messages.reverse(), requests, privacyNotice: PRIVACY_NOTICE });
  });
  router.post('/conversations/:id/messages', async (req, res) => {
    const content = validateMessage(req.body);
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', cancel);
    try {
      const result = await service.send({ userId: req.user.id, auth: req.auth, sessionId: req.params.id, content,
        requestId: req.body.requestId, analysisInput: req.body.analysisInput, privacyNoticeVersion: req.body.privacyNoticeVersion, signal: controller.signal });
      res.status(result.replayed ? 200 : 201).json(result);
    } finally { res.off('close', cancel); delete req.body; }
  });
  // Recovery exposes only safe references/current projections, never ledger costs,
  // raw provider output, private parameters or another employee's records.
  router.get('/conversations/:id/requests/:requestId', async (req, res) => {
    await ownedSession(database, req.user.id, req.params.id);
    if (!UUID.test(req.params.requestId)) throw new ChatError(404, 'CHAT_REQUEST_NOT_FOUND', 'Request not found.');
    const entry = await database.aiUsage.findFirst({ where: { userId: req.user.id, sessionId: req.params.id,
      requestId: req.params.requestId, parentRequestId: null } });
    if (!entry) throw new ChatError(404, 'CHAT_REQUEST_NOT_FOUND', 'Request not found.');
    const verifiedResults = [];
    for (const ref of entry.toolMetadata?.results ?? []) {
      if (ref.name === 'search_company_policy') {
        verifiedResults.push(await company.recover({ auth: req.auth, conversationId: req.params.id, receipt: ref }));
        continue;
      }
      if (ref.name === 'search_pdpl') {
        verifiedResults.push(await pdpl.recover({ auth: req.auth, conversationId: req.params.id, receipt: ref }));
        continue;
      }
      verifiedResults.push(await tools.execute({ auth: req.auth, conversationId: req.params.id, name: ref.name,
        argumentsJson: JSON.stringify(ref.name === 'get_file_analysis' ? { analysisId: ref.analysisId } : { analyzerType: ref.analyzerType, analysisId: ref.analysisId }) }));
    }
    const receipt = await database.toolApproval.findFirst({ where: { userId: req.user.id, conversationId: req.params.id, requestId: entry.requestId }, select: { id: true } });
    const approvalId = entry.toolMetadata?.approvalId ?? receipt?.id;
    const pending = approvalId ? await approvals.get({ auth: req.auth, conversationId: req.params.id, id: approvalId }) : {};
    res.json({ status: entry.status, toolMetadata: entry.toolMetadata, verifiedResults, ...pending });
  });
  // Explicit, idempotent continuation after human approval. The analyzer is never
  // called here. A stable server request ID prevents paid retries on replay.
  router.post('/conversations/:id/approvals/:approvalId/explanation', async (req, res) => {
    try {
      if (!req.body || Object.keys(req.body).join(',') !== 'privacyNoticeVersion' || req.body.privacyNoticeVersion !== PRIVACY_NOTICE.version) {
        throw new ChatError(400, 'CHAT_INVALID_MESSAGE', 'Acknowledge the current chat privacy notice.');
      }
      const completed = await approvals.get({ auth: req.auth, conversationId: req.params.id, id: req.params.approvalId });
      if (completed.approval.status !== 'COMPLETED' || !completed.result) throw new ToolError(409, 'TOOL_RESULT_UNAVAILABLE', 'A completed analysis is required.');
      const digest = createHash('sha256').update(`approval-explanation:${req.params.approvalId}`).digest('hex');
      const requestId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
      try {
        const explanation = await service.send({ auth: req.auth, userId: req.user.id, sessionId: req.params.id, requestId,
          content: 'Explain the completed analysis using the verified backend findings.', initialResult: completed.result });
        res.json({ ...completed, explanation });
      } catch (error) {
        if (!(error instanceof ChatError) || error.status < 409) throw error;
        res.json({ ...completed, explanation: { status: 'UNAVAILABLE', code: error.code,
          message: 'The analysis is available below. An AI explanation is unavailable; no new scan was performed.' } });
      }
    } finally { delete req.body; }
  });
  router.use((error, _req, res, next) => {
    if (!(error instanceof ChatError) && !(error instanceof ToolError) && !(error instanceof RetrievalError)) return next(error);
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
  });
  return router;
}
