import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { createTrustedOrigin } from '../middleware/trusted-origin.js';
import { createCertificateService } from '../certificates/certificate-service.js';
import { renderCertificatePdf } from '../certificates/certificate-pdf.js';
import { TrainingError, fields } from '../training/training-policy.js';

export function createCertificateRouter({ database, config, admin = false }) {
  const router = Router();
  const service = createCertificateService(database);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store, max-age=0');
    next();
  });
  router.use(
    createAuthenticate({ database, config }),
    requireRole(admin ? 'IT_SECURITY_ADMIN' : 'EMPLOYEE'),
    createTrustedOrigin(config.trustedOrigins),
  );
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      keyGenerator: (req) => req.user.id,
      message: { error: { code: 'CERTIFICATE_RATE_LIMIT', message: 'Too many requests. Try again shortly.' } },
    }),
  );
  const handle = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (error instanceof TrainingError)
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      next(error);
    }
  };
  router.get(
    '/',
    handle((req) => (admin ? service.adminList(req.query) : service.mine(req.user, req.query))),
  );
  if (admin)
    router.get(
      '/verify/:number',
      handle((req) => {
        fields(req.query, []);
        return service.verify(req.params.number);
      }),
    );
  router.get('/:id/pdf', async (req, res, next) => {
    try {
      fields(req.query, []);
      const { certificate } = await service.detail(req.user, req.params.id, admin);
      if (certificate.status !== 'ISSUED')
        return res
          .status(409)
          .json({ error: { code: 'CERTIFICATE_REVOKED', message: 'This certificate is revoked.' } });
      const pdf = await renderCertificatePdf(certificate, process.env.CERTIFICATE_ORGANIZATION_NAME ?? '');
      res.set('Content-Type', 'application/pdf');
      res.set(
        'Content-Disposition',
        `attachment; filename="ewaguard-certificate-${certificate.certificateNumber}.pdf"`,
      );
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Length', String(pdf.length));
      res.send(pdf);
    } catch (error) {
      if (error instanceof TrainingError)
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      next(error);
    }
  });
  router.get(
    '/:id',
    handle((req) => {
      fields(req.query, []);
      return service.detail(req.user, req.params.id, admin);
    }),
  );
  return router;
}
