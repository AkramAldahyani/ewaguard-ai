import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { CommunityMediaError } from '../community/media-policy.js';
import { CommunityError, requireCommunityAcknowledgement } from '../community/community-service.js';
import { TrainingError, fields } from '../training/training-policy.js';

function respond(error, res, next) {
  if (error instanceof CommunityMediaError || error instanceof CommunityError)
    return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  if (error instanceof TrainingError || error instanceof multer.MulterError || /Unexpected end of|Multipart:|Malformed part header/.test(error.message ?? ''))
    return res.status(400).json({ error: { code: 'COMMUNITY_IMAGE_INVALID', message: 'Check the image count, file size, file type, and post fields.' } });
  next(error);
}
export function mountCommunityMediaReads(router, media) {
  router.get('/media/:id', async (req, res, next) => {
    try {
      fields(req.query, []);
      const buffer = await media.read(req.user, req.params.id);
      res.set({ 'Cache-Control': 'private, no-store, max-age=0', 'Content-Type': 'image/png',
        'Content-Disposition': 'inline; filename="community-image.png"', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin' });
      res.end(buffer);
    } catch (error) { respond(error, res, next); }
  });
}

export function mountCommunityMediaUploads(router, { database, service, media }) {
  const { policy } = media;
  let active = 0;
  const upload = multer({ storage: multer.memoryStorage(), preservePath: true,
    limits: { files: policy.maxImages, fileSize: policy.maxBytes, fields: 3, fieldSize: 20000,
      parts: policy.maxImages + 3, fieldNameSize: 40, headerPairs: 30 } }).array('images', policy.maxImages);
  const limit = rateLimit({ windowMs: 60000, limit: 5, keyGenerator: (req) => req.user.id,
    message: { error: { code: 'COMMUNITY_RATE_LIMIT', message: 'Too many image uploads. Try again shortly.' } } });
  router.get('/media-options', (_req, res) => res.json({ maxImages: policy.maxImages, maxBytes: policy.maxBytes,
    formats: ['image/jpeg', 'image/png', 'image/webp'], videoEnabled: false }));
  router.post('/with-images', limit, async (req, res, next) => {
    if (active >= 2) return res.status(429).json({ error: { code: 'COMMUNITY_RATE_LIMIT', message: 'Image processing is busy. Try again shortly.' } });
    active++; const prepared = []; let committed = false; let aborted = false;
    const onClose = () => { if (!res.writableEnded) aborted = true; };
    res.on('close', onClose);
    try {
      fields(req.query, []);
      if (!req.is('multipart/form-data')) throw new CommunityMediaError(415, 'COMMUNITY_IMAGE_INVALID', 'Use a multipart image upload.');
      const acknowledgementId = req.get('X-Community-Acknowledgement');
      // Authorize acknowledgement before parsing or processing file bytes.
      await requireCommunityAcknowledgement(database, req.user.id, acknowledgementId);
      const length = Number(req.get('Content-Length'));
      if (length > policy.maxBytes * policy.maxImages + 65536) throw new CommunityMediaError(413, 'COMMUNITY_IMAGE_INVALID', 'The upload exceeds the permitted size.');
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { req.destroy(); reject(new CommunityMediaError(408, 'COMMUNITY_IMAGE_INVALID', 'Upload timed out.')); }, policy.uploadTimeoutMs);
        upload(req, res, (error) => { clearTimeout(timer); if (error) reject(error); else resolve(); });
      });
      fields(req.body, ['title', 'body', 'category'], ['body', 'category']);
      if (!req.files?.length) throw new CommunityMediaError(400, 'COMMUNITY_IMAGE_INVALID', 'Choose at least one image.');
      for (const file of req.files) {
        if (aborted) throw new Error('Upload cancelled');
        const image = await media.processor(file);
        try { image.storageKey = await media.store.write(image.buffer); prepared.push(image); }
        finally { image.buffer.fill(0); }
      }
      if (aborted) throw new Error('Upload cancelled');
      const result = await service.submit(req.user, { ...req.body, acknowledgementId }, prepared, policy);
      committed = !result.alreadySubmitted;
      if (result.alreadySubmitted) {
        for (const image of prepared) await media.store.remove(image.storageKey);
        prepared.length = 0;
      }
      res.json(result);
    } catch (error) { if (!aborted && !res.headersSent) respond(error, res, next); }
    finally {
      res.off('close', onClose);
      req.files?.forEach((file) => file.buffer?.fill(0));
      if (!committed) for (const image of prepared) await media.store.remove(image.storageKey).catch(() => {
        console.error(JSON.stringify({ level: 'ERROR', event: 'community_image_cleanup_failed' }));
      });
      active--;
    }
  });
}
