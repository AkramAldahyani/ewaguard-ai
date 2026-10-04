import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createDatabaseClient } from './config/database.js';
import { createAuthRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { createAuthenticate } from './middleware/authenticate.js';
import { requireRole } from './middleware/authorize.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

export function createApp(config, dependencies = {}) {
  const app = express();
  const database = dependencies.database ?? createDatabaseClient();
  app.locals.database = database;
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.trustedOrigins, credentials: true, methods: ['GET', 'POST', 'HEAD', 'OPTIONS'] }));
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use(cookieParser());
  app.use('/api/health', healthRouter);
  app.use('/api/auth', createAuthRouter({ database, config }));
  const authenticate = createAuthenticate({ database, config });
  const workspace = (area) => (_req, res) => res.set('Cache-Control', 'no-store').json({ area });
  app.get('/api/employee/workspace', authenticate, requireRole('EMPLOYEE'), workspace('employee'));
  app.get('/api/admin/workspace', authenticate, requireRole('IT_SECURITY_ADMIN'), workspace('admin'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
