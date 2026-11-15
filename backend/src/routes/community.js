import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { CommunityError, createCommunityService } from '../community/community-service.js';
import { TrainingError, fields } from '../training/training-policy.js';
import { mountCommunityMediaReads, mountCommunityMediaUploads } from './community-media.js';
import { createCommentService } from '../community/comment-service.js';
import { createReportService } from '../community/report-service.js';

export function createCommunityRouter({ database, config, media }) {
  const router = Router(),
    service = createCommunityService(database);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store, max-age=0');
    next();
  });
  router.use(
    createAuthenticate({ database, config }),
    requireRole('EMPLOYEE'),
    createTrustedOrigin(config.trustedOrigins),
  );
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      keyGenerator: (req) => req.user.id,
      message: { error: { code: 'COMMUNITY_RATE_LIMIT', message: 'Too many requests. Try again shortly.' } },
    }),
  );
  const writeLimit = rateLimit({
    windowMs: 60000,
    limit: 30,
    keyGenerator: (req) => req.user.id,
    message: { error: { code: 'COMMUNITY_WRITE_LIMIT', message: 'Too many submissions. Try again shortly.' } },
  });
  const handle = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (error instanceof CommunityError)
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      if (error instanceof TrainingError)
        return res
          .status(error.status)
          .json({ error: { code: 'COMMUNITY_INVALID', message: 'Invalid community request.' } });
      next(error);
    }
  };
  mountCommunityMediaReads(router, media);
  const reports = createReportService(database, media);
  router.post(
    '/reports',
    rateLimit({
      windowMs: 60000,
      limit: 5,
      keyGenerator: (req) => req.user.id,
      message: { error: { code: 'COMMUNITY_RATE_LIMIT', message: 'Too many reports. Try again shortly.' } },
    }),
    json({ limit: '8kb', inflate: false }),
    handle((req) => {
      fields(req.query, []);
      if (!req.is('application/json')) throw new CommunityError(415, 'COMMUNITY_CONTENT_TYPE', 'Use application/json.');
      return reports.submit(req.user, req.body);
    }),
  );
  mountCommunityMediaUploads(router, { database, service, media });
  const comments = createCommentService(database);
  const commentLimit = rateLimit({
    windowMs: 60000,
    limit: 10,
    keyGenerator: (req) => req.user.id,
    message: { error: { code: 'COMMUNITY_RATE_LIMIT', message: 'Too many comments. Try again shortly.' } },
  });
  router.get(
    '/:id/comments',
    handle((req) => comments.list(req.user, req.params.id, req.query)),
  );
  router.post(
    '/:id/comments',
    commentLimit,
    json({ limit: '12kb', inflate: false }),
    handle((req) => {
      fields(req.query, []);
      if (!req.is('application/json')) throw new CommunityError(415, 'COMMUNITY_CONTENT_TYPE', 'Use application/json.');
      return comments.submit(req.user, req.params.id, req.body);
    }),
  );
  router.delete(
    '/comments/:id',
    writeLimit,
    handle((req) => {
      fields(req.query, []);
      return comments.removeOwn(req.user, req.params.id);
    }),
  );
  router.delete(
    '/:id',
    writeLimit,
    handle((req) => {
      fields(req.query, []);
      return service.deleteOwn(req.user, req.params.id);
    }),
  );
  router.get(
    '/',
    handle((req) => service.approved(req.query, req.user)),
  );
  router.get(
    '/saved',
    handle((req) => service.saved(req.user, req.query)),
  );
  router.get(
    '/mine',
    handle((req) => service.mine(req.user, req.query)),
  );
  router.get(
    '/mine/:id',
    handle((req) => {
      fields(req.query, []);
      return service.ownDetail(req.user, req.params.id);
    }),
  );
  router.get(
    '/:id',
    handle((req) => {
      fields(req.query, []);
      return service.approvedDetail(req.params.id, req.user);
    }),
  );
  router.put(
    '/:id/:engagement',
    writeLimit,
    json({ limit: '1kb', inflate: false }),
    handle((req) => {
      fields(req.query, []);
      if (!req.is('application/json')) throw new CommunityError(415, 'COMMUNITY_CONTENT_TYPE', 'Use application/json.');
      return service.setEngagement(req.user, req.params.id, req.params.engagement, req.body);
    }),
  );
  router.post(
    '/',
    writeLimit,
    json({ limit: '16kb', inflate: false }),
    handle((req) => {
      fields(req.query, []);
      if (!req.is('application/json')) throw new CommunityError(415, 'COMMUNITY_CONTENT_TYPE', 'Use application/json.');
      return service.submit(req.user, req.body);
    }),
  );
  return router;
}
