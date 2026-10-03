import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Resolve from this module so workspace and root commands load the same file.
// Node preserves injected environment variables over values in this file.
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

export function parseConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }
  const rawPort = env.PORT ?? '5000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host)) {
    throw new Error('HOST must be an explicit loopback or wildcard bind address.');
  }
  let origin;
  try {
    origin = new URL(env.FRONTEND_URL ?? 'http://localhost:5173');
  } catch {
    throw new Error('FRONTEND_URL must be a valid HTTP(S) origin.');
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('FRONTEND_URL must be an HTTP(S) origin without credentials, path, query, or fragment.');
  }
  if (nodeEnv === 'production' && origin.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must use HTTPS in production.');
  }
  return Object.freeze({ nodeEnv, port, host, frontendUrl: origin.origin });
}

export function databaseUrl(env = process.env) {
  try {
    const url = new URL(env.DATABASE_URL);
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
      throw new Error();
    }
    return env.DATABASE_URL;
  } catch {
    // Never include the supplied URL: it may contain database credentials.
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL with a database name.');
  }
}
