import { Router, json } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { verifyAcknowledgement } from '../disclaimers/disclaimer-service.js';
import { DISCLAIMER_DEFINITION } from '../../../shared/disclaimer.js';
import { EMAIL_LIMITS, EmailAnalysisError } from '../analyzers/email/email-policy.js';
import { submitEmailAnalysis } from '../analyzers/email/email-submission.js';

export const EMAIL_ACKNOWLEDGEMENT_MAX_AGE_MS = 15 * 60_000;
export const EMAIL_SUBMISSION_LIMIT = 30;
const JSON_LIMIT = 6 * (EMAIL_LIMITS.bodyBytes + EMAIL_LIMITS.headerBytes) + 1024;
const MIME_TYPES = new Set(['message/rfc822', 'application/octet-stream', 'text/plain']);

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

export function createEmailAnalysisRouter({ database, config, analyzer }) {
  const router = Router();
  let active = 0;
  const limiter = rateLimit({
    windowMs: 60_000, limit: EMAIL_SUBMISSION_LIMIT,
    keyGenerator: (req) => req.user.id,
    standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => fail(res, 429, 'EMAIL_RATE_LIMITED', 'Too many email submissions. Please try again shortly.'),
  });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('EMPLOYEE'), createTrustedOrigin(config.trustedOrigins), limiter);
  // Bound concurrent buffered requests across both modes, including slow uploads.
  router.use((_req, res, next) => {
    if (active >= 4) return fail(res, 503, 'EMAIL_BUSY', 'Email analysis is busy. Please try again shortly.');
    active += 1;
    let released = false;
    const release = () => { if (!released) { released = true; active -= 1; } };
    res.once('finish', release);
    res.once('close', release);
    next();
  });
  router.use(async (req, res, next) => {
    try {
      const now = new Date();
      const candidate = await database.disclaimerAcknowledgement.findFirst({
        where: { userId: req.user.id, context: 'EMAIL_ANALYSIS', version: DISCLAIMER_DEFINITION.version,
          createdAt: { gte: new Date(now.getTime() - EMAIL_ACKNOWLEDGEMENT_MAX_AGE_MS), lte: now } },
        orderBy: { createdAt: 'desc' }, select: { id: true },
      });
      const acknowledgement = candidate && await verifyAcknowledgement(database, {
        acknowledgementId: candidate.id, userId: req.user.id, context: 'EMAIL_ANALYSIS',
        now, maxAgeMs: EMAIL_ACKNOWLEDGEMENT_MAX_AGE_MS,
      });
      if (!acknowledgement) return fail(res, 403, 'EMAIL_ACKNOWLEDGEMENT_REQUIRED', 'A current email analysis acknowledgement is required.');
      req.emailAcknowledgementId = acknowledgement.id;
      return next();
    } catch (error) { return next(error); }
  });

  const complete = (inputFor) => async (req, res, next) => {
    try {
      const response = await submitEmailAnalysis(database, {
        userId: req.user.id, acknowledgementId: req.emailAcknowledgementId, input: inputFor(req),
      }, analyzer);
      return res.status(201).json(response);
    } catch (error) {
      if (error instanceof EmailAnalysisError) {
        return fail(res, error.code === 'EMAIL_INPUT_TOO_LARGE' ? 413 : 400, error.code, error.message);
      }
      return next(error);
    } finally {
      if (req.file?.buffer) req.file.buffer.fill(0);
      delete req.file;
      delete req.body;
    }
  };

  router.post('/text', (req, res, next) => {
    if (!req.is('application/json')) return fail(res, 415, 'EMAIL_CONTENT_TYPE', 'Use application/json for pasted email.');
    return next();
  }, json({ limit: JSON_LIMIT, strict: true, inflate: false }), complete((req) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some((key) => !['body', 'headers'].includes(key)) ||
        typeof body.body !== 'string' || (body.headers !== undefined && typeof body.headers !== 'string')) {
      throw new EmailAnalysisError('INVALID_EMAIL_INPUT');
    }
    // Enforce original header bytes before the parser trims trailing line breaks.
    if (Buffer.byteLength(body.headers ?? '') > EMAIL_LIMITS.headerBytes) throw new EmailAnalysisError('EMAIL_INPUT_TOO_LARGE');
    return { inputType: 'PASTED', ...body };
  }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: EMAIL_LIMITS.emlBytes, files: 1, fields: 0, parts: 1, fieldNameSize: 64, fieldArrayIndexLimit: 0 },
    fileFilter: (_req, file, callback) => {
      if (!/\.eml$/i.test(file.originalname) || !MIME_TYPES.has(file.mimetype)) {
        return callback(new EmailAnalysisError('INVALID_EMAIL_INPUT'));
      }
      return callback(null, true);
    },
  }).single('file');
  router.post('/eml', (req, res, next) => {
    if (!req.is('multipart/form-data')) return fail(res, 415, 'EMAIL_CONTENT_TYPE', 'Use multipart/form-data with one file field.');
    upload(req, res, (error) => {
      if (error) {
        if (req.file?.buffer) req.file.buffer.fill(0);
        delete req.file;
        delete req.body;
        return fail(res, error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'INVALID_EMAIL_UPLOAD', 'Provide one supported .eml file of at most 1 MiB and no other fields.');
      }
      return next();
    });
  }, complete((req) => {
    if (!req.file || Object.keys(req.body ?? {}).length) throw new EmailAnalysisError('INVALID_EMAIL_INPUT');
    return { inputType: 'EML', eml: req.file.buffer };
  }));
  return router;
}
