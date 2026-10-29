import { Router, json } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { FILE_MAX_BYTES, FILE_LIMITS, FileAnalysisError } from '../analyzers/file/file-policy.js';
import { fileExtension } from '../analyzers/file/file-inspection.js';
import { createFileAnalyzer, submitFileAnalysis } from '../analyzers/file/file-analyzer.js';
import { submitOnce } from '../analyzers/submission-idempotency.js';
import { createThreatIntelligence } from '../services/threat-intelligence.js';
import { submitHashAnalysis, hashLookupReceipt, normalizeSha256 } from '../analyzers/file/hash-analysis.js';

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
function receiveFile(upload, req) {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new FileAnalysisError('INVALID_FILE_UPLOAD'));
    const timer = setTimeout(() => { req.destroy(); reject(new FileAnalysisError('FILE_UPLOAD_TIMEOUT')); }, FILE_LIMITS.uploadTimeoutMs);
    req.once('aborted', aborted);
    upload(req, null, (error) => {
      clearTimeout(timer); req.removeListener('aborted', aborted);
      if (error) reject(error); else resolve();
    });
    req.once('close', () => clearTimeout(timer));
  });
}

export function createFileAnalysisRouter({ database, config, threatIntelligence = createThreatIntelligence({ apiKey: config.virusTotalApiKey }), analyzer = createFileAnalyzer({ config, threatIntelligence }) }) {
  const router = Router(); let active = 0;
  const upload = multer({ storage: multer.memoryStorage(), preservePath: true,
    limits: { fileSize: FILE_MAX_BYTES, files: 1, fields: 0, parts: 1, fieldNameSize: 64, fieldArrayIndexLimit: 0 },
    fileFilter: (_req, file, callback) => {
      try { fileExtension(file.originalname); callback(null, true); } catch (error) { callback(error); }
    },
  }).single('file');
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(createAuthenticate({ database, config }), requireRole('EMPLOYEE'), createTrustedOrigin(config.trustedOrigins));
  router.use(rateLimit({ windowMs: 60_000, limit: FILE_LIMITS.submissionsPerMinute, keyGenerator: (req) => req.user.id,
    standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => fail(res, 429, 'FILE_RATE_LIMITED', 'Too many file submissions. Try again in a minute.'),
  }));
  router.post('/hash', (req, res, next) => {
    if (!req.is('application/json')) return fail(res, 415, 'FILE_CONTENT_TYPE', 'Use application/json for a hash lookup.');
    return next();
  }, json({ limit: 1024, strict: true, inflate: false }), async (req, res, next) => {
    const body = req.body;
    const sha256 = normalizeSha256(body?.sha256);
    if (!body || Array.isArray(body) || Object.keys(body).some((key) => key !== 'sha256') || !sha256) {
      return fail(res, 400, 'INVALID_SHA256', 'Enter a SHA-256 hash containing exactly 64 hexadecimal characters.');
    }
    if (active >= FILE_LIMITS.activeAnalyses) return fail(res, 503, 'FILE_BUSY', 'File analysis is busy. Try again shortly.');
    active++;
    try {
      const result = await submitOnce(database, {
        key: req.get('Idempotency-Key'), userId: req.user.id, type: 'FILE_HASH',
        payload: sha256, secret: config.jwtSecret, onReplay: hashLookupReceipt,
      }, (db) => submitHashAnalysis(db, { userId: req.user.id, sha256 }, threatIntelligence));
      return res.json(result);
    }
    catch (error) { return next(error); }
    finally { active--; delete req.body; }
  });
  router.post('/', async (req, res, next) => {
    if (active >= FILE_LIMITS.activeAnalyses) return fail(res, 503, 'FILE_BUSY', 'File analysis is busy. Try again shortly.');
    active++;
    try {
      if (!req.is('multipart/form-data')) return fail(res, 415, 'FILE_CONTENT_TYPE', 'Use multipart/form-data with one file.');
      await receiveFile(upload, req);
      if (req.aborted || !req.file || Object.keys(req.body ?? {}).length) throw new FileAnalysisError();
      const result = await submitOnce(database, { key: req.get('Idempotency-Key'), userId: req.user.id,
        type: 'FILE', payload: Buffer.concat([Buffer.from(JSON.stringify([req.file.originalname, req.file.mimetype])), req.file.buffer]), secret: config.jwtSecret },
      (db) => submitFileAnalysis(db, { userId: req.user.id, upload: req.file }, analyzer));
      return res.status(result.incident.state === 'PENDING' ? 202 : 201).json(result);
    } catch (error) {
      if (req.destroyed && !req.complete) return;
      if (error instanceof multer.MulterError) {
        const large = error.code === 'LIMIT_FILE_SIZE';
        const safe = new FileAnalysisError(large ? 'FILE_TOO_LARGE' : 'INVALID_FILE_UPLOAD');
        return fail(res, large ? 413 : 400, safe.code, safe.message);
      }
      if (error instanceof FileAnalysisError) return fail(res, error.code === 'FILE_CLEANUP_FAILED' ? 500 : error.code === 'FILE_TOO_LARGE' ? 413 : 400, error.code, error.message);
      // Busboy multipart syntax errors are not trusted display strings.
      if (/^(?:Unexpected end of (?:form|file)|Multipart:|Malformed part header)/.test(error.message ?? '')) return fail(res, 400, 'INVALID_FILE_UPLOAD', 'Provide one valid multipart file upload.');
      return next(error);
    } finally {
      req.file?.buffer?.fill(0); delete req.file; delete req.body;
      // Do not release this slot on socket close while scanners are still running.
      active--;
    }
  });
  return router;
}
