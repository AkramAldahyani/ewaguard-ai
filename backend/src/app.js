import express from 'express';
import { createNotificationRouter } from './routes/notifications.js';
import { createIncidentRouter } from './routes/incidents.js';
import { createAnalysisEscalationRouter } from './routes/analysis-escalations.js';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createDatabaseClient } from './config/database.js';
import { createAuthRouter } from './routes/auth.js';
import { createDisclaimerRouter } from './routes/disclaimers.js';
import { createEmailAnalysisRouter } from './routes/email-analysis.js';
import { createUrlAnalysisRouter } from './routes/url-analysis.js';
import { createFileAnalysisRouter } from './routes/file-analysis.js';
import { createChatRouter } from './routes/chat.js';
import { createToolApprovalRouter } from './routes/tool-approvals.js';
import { createApprovalService } from './ai/tools/approval-service.js';
import { createAnalysisGate } from './analyzers/analysis-gate.js';
import { createThreatIntelligence } from './services/threat-intelligence.js';
import { healthRouter } from './routes/health.js';
import { createAuthenticate } from './middleware/authenticate.js';
import { requireRole } from './middleware/authorize.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

export function createApp(config, dependencies = {}) {
  const app = express();
  const database = dependencies.database ?? createDatabaseClient();
  const threatIntelligence = createThreatIntelligence({ apiKey: config.virusTotalApiKey });
  const gates = { EMAIL: createAnalysisGate('EMAIL'), URL: createAnalysisGate('URL') };
  app.locals.database = database;
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.trustedOrigins, credentials: true, methods: ['GET', 'POST', 'HEAD', 'OPTIONS'] }));
  app.use(cookieParser());
  app.use('/api/notifications', createNotificationRouter({ database, config }));
  app.use('/api/admin/incidents', createIncidentRouter({ database, config, admin: true }));
  app.use('/api/incidents', createIncidentRouter({ database, config }));
  app.use('/api/analysis-escalations', createAnalysisEscalationRouter({ database, config }));
  // Email has its own bounded parser after authentication and acknowledgement.
  app.use('/api/analysis/email', createEmailAnalysisRouter({ database, config, ...dependencies.emailAnalysis, gate: gates.EMAIL }));
  app.use('/api/analysis/url', createUrlAnalysisRouter({ database, config, threatIntelligence, ...dependencies.urlAnalysis, gate: gates.URL }));
  app.use('/api/analysis/file', createFileAnalysisRouter({ database, config, threatIntelligence, ...dependencies.fileAnalysis }));
  const approvalOptions = { database, config, gates, threatIntelligence,
    emailAnalyzer: dependencies.emailAnalysis?.analyzer, urlAnalyzer: dependencies.urlAnalysis?.analyzer };
  const approvals = createApprovalService(approvalOptions);
  app.use('/api/chat', createChatRouter({ database, config, ...dependencies.chat, approvals }));
  app.use('/api/tool-approvals', createToolApprovalRouter({ ...approvalOptions, service: approvals }));
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use('/api/health', healthRouter);
  app.use('/api/auth', createAuthRouter({ database, config }));
  app.use('/api/disclaimers', createDisclaimerRouter({ database, config }));
  const authenticate = createAuthenticate({ database, config });
  const workspace = (area) => (_req, res) => res.set('Cache-Control', 'no-store').json({ area });
  app.get('/api/employee/workspace', authenticate, requireRole('EMPLOYEE'), workspace('employee'));
  app.get('/api/admin/workspace', authenticate, requireRole('IT_SECURITY_ADMIN'), workspace('admin'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
