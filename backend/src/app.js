import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { healthRouter } from './routes/health.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

export function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.frontendUrl, methods: ['GET', 'HEAD', 'OPTIONS'] }));
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use('/api/health', healthRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
