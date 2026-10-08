import { createApp } from './app.js';
import { parseConfig } from './config/env.js';
import { createFileTempStore } from './analyzers/file/file-temp.js';

try {
  const config = parseConfig();
  await createFileTempStore().cleanupStale();
  const app = createApp(config);
  const server = app.listen(config.port, config.host, () => {
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
    console.info(JSON.stringify({ level: 'INFO', event: 'server_stopping' }));
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(async () => {
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
