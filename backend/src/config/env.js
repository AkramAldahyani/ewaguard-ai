import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_YARA_RULES } from '../analyzers/file/file-policy.js';

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
    origin = new URL(env.FRONTEND_URL ?? 'http://127.0.0.1:5173');
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
  const jwtSecret = env.JWT_SECRET;
  if (typeof jwtSecret !== 'string' || jwtSecret.length < 32 || jwtSecret === 'CHANGE_ME') {
    throw new Error('JWT_SECRET must contain at least 32 characters and must not use the placeholder.');
  }
  const accessTokenTtlSeconds = positiveInteger(env.JWT_ACCESS_TTL_SECONDS ?? '900', 'JWT_ACCESS_TTL_SECONDS', 60, 3600);
  const mfaEncryptionKey = env.MFA_ENCRYPTION_KEY || null;
  if (mfaEncryptionKey && !/^[a-f0-9]{64}$/i.test(mfaEncryptionKey)) {
    throw new Error('MFA_ENCRYPTION_KEY must be a dedicated 32-byte hexadecimal key.');
  }
  const mfaIssuer = env.MFA_TOTP_ISSUER ?? 'EWAGuard AI';
  if (!mfaIssuer.trim() || mfaIssuer.length > 80 || [...mfaIssuer].some((char) => char === ':' || char.charCodeAt(0) < 32)) throw new Error('Invalid MFA issuer.');
  const mfaChallengeTtlSeconds = positiveInteger(env.MFA_CHALLENGE_TTL_SECONDS ?? '300', 'MFA_CHALLENGE_TTL_SECONDS', 60, 600);
  const loginRateLimitWindowMinutes = positiveInteger(env.LOGIN_RATE_LIMIT_WINDOW_MINUTES ?? '15', 'LOGIN_RATE_LIMIT_WINDOW_MINUTES', 1, 60);
  const loginRateLimitMax = positiveInteger(env.LOGIN_RATE_LIMIT_MAX ?? '10', 'LOGIN_RATE_LIMIT_MAX', 1, 100);
  const trustedOrigins = [origin.origin];
  // Vite's same-origin proxy supports either loopback hostname during development.
  // Preserve the configured scheme/port; never expand production or remote origins.
  if (nodeEnv === 'development' && ['localhost', '127.0.0.1'].includes(origin.hostname)) {
    const alias = new URL(origin.origin);
    alias.hostname = origin.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    trustedOrigins.push(alias.origin);
  }
  return Object.freeze({
    nodeEnv, port, host, frontendUrl: origin.origin, jwtSecret,
    trustedOrigins: Object.freeze(trustedOrigins),
    accessTokenTtlSeconds, loginRateLimitWindowMinutes, loginRateLimitMax,
    mfaEncryptionKey, mfaIssuer, mfaChallengeTtlSeconds,
    virusTotalApiKey: env.VIRUSTOTAL_API_KEY?.trim() || null,
    clamavPath: env.CLAMAV_PATH?.trim() || null,
    yaraPath: env.YARA_PATH?.trim() || null,
    yaraRulesPath: env.YARA_RULES_PATH?.trim() || (nodeEnv === 'development' ? DEFAULT_YARA_RULES : null),
  });
}

function positiveInteger(raw, name, minimum, maximum) {
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
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
