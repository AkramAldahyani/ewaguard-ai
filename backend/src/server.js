import { createApp } from './app.js';
import { parseConfig } from './config/env.js';

try {
  const config = parseConfig();
  const server = createApp(config).listen(config.port, config.host, () => {
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
    server.close(() => { clearTimeout(deadline); });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch {
  console.error(JSON.stringify({ level: 'ERROR', event: 'invalid_configuration',
    message: 'Check NODE_ENV, PORT, HOST, and FRONTEND_URL against .env.example.' }));
  process.exitCode = 1;
}
