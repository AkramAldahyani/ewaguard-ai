import { createApp } from './app.js';
import { parseConfig } from './config/env.js';
import { createFileTempStore } from './analyzers/file/file-temp.js';
import { purgeExpiredChats } from './ai/chat-service.js';
import { purgeExpiredApprovals } from './ai/tools/approval-service.js';

import { createServer } from 'node:http';
import { attachRealtime } from './notifications/realtime.js';

try {
  const config = parseConfig();
  await createFileTempStore().cleanupStale();
  const app = createApp(config);
  const cleanupChats = () => purgeExpiredChats(app.locals.database).catch(() => {
    console.error(JSON.stringify({ level: 'ERROR', event: 'chat_retention_failed' }));
  });
  void cleanupChats();
  const chatRetentionTimer = setInterval(cleanupChats, 60 * 60_000);
  chatRetentionTimer.unref();
  const cleanupApprovals = () => purgeExpiredApprovals(app.locals.database).catch(() => {
    console.error(JSON.stringify({ level: 'ERROR', event: 'approval_retention_failed' }));
  });
  void cleanupApprovals();
  const approvalRetentionTimer = setInterval(cleanupApprovals, 60_000);
  approvalRetentionTimer.unref();
  const server = createServer(app);
  const realtime = attachRealtime(server, { database: app.locals.database, config });
  app.locals.realtime = realtime;
  server.listen(config.port, config.host, () => {
    console.info(JSON.stringify({ level: 'INFO', event: 'server_started', port: config.port }));
  });
  server.on('error', () => {
    console.error(JSON.stringify({ level: 'ERROR', event: 'server_start_failed' }));
    process.exitCode = 1;
  });
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    clearInterval(chatRetentionTimer);
    clearInterval(approvalRetentionTimer);
    console.info(JSON.stringify({ level: 'INFO', event: 'server_stopping' }));
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    void realtime.close().then(async () => {
      clearTimeout(deadline);
      await app.locals.database.$disconnect();
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch {
  console.error(JSON.stringify({ level: 'ERROR', event: 'invalid_configuration',
    message: 'Check application and authentication settings against .env.example.' }));
  process.exitCode = 1;
}
