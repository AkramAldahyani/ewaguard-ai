import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { databaseUrl, parseConfig } from '../src/config/env.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createTrustedOrigin } from '../src/middleware/trusted-origin.js';

const validSecret = 'test-secret-that-is-at-least-32-characters-long';
const configEnv = (overrides = {}) => ({ JWT_SECRET: validSecret, ...overrides });

test('origin validation permits same-origin browser reads without weakening write or cross-origin checks', () => {
  const trusted = 'https://ewaguard.example';
  const middleware = createTrustedOrigin([trusted]);
  for (const [method, origin, site, allowed] of [
    ['GET', undefined, 'same-origin', true],
    ['HEAD', undefined, 'same-origin', true],
    ['GET', undefined, 'same-site', false],
    ['GET', undefined, 'cross-site', false],
    ['GET', undefined, 'none', false],
    ['GET', 'https://evil.example', 'same-origin', false],
    ['GET', trusted, 'cross-site', false],
    ['POST', undefined, 'same-origin', false],
    ['POST', undefined, 'same-site', false],
    ['POST', trusted, 'same-origin', true],
    ['POST', trusted, 'same-site', true],
    ['POST', trusted, 'cross-site', false],
    ['PUT', undefined, 'same-origin', false],
    ['DELETE', undefined, 'same-origin', false],
    ['GET', undefined, undefined, true],
    ['POST', undefined, undefined, true],
  ]) {
    let passed = false;
    let status;
    const req = { method, get: (name) => ({ Origin: origin, 'Sec-Fetch-Site': site })[name] };
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(body) {
        assert.equal(body.error.code, 'UNTRUSTED_ORIGIN');
      },
    };
    middleware(req, res, () => {
      passed = true;
    });
    assert.equal(passed, allowed, `${method} Origin=${origin} Sec-Fetch-Site=${site}`);
    if (!allowed) assert.equal(status, 403);
  }
});

test('configuration accepts defaults and rejects invalid deployment settings', () => {
  assert.equal(parseConfig(configEnv()).port, 5000);
  assert.equal(parseConfig(configEnv()).host, '127.0.0.1');
  assert.equal(parseConfig(configEnv()).accessTokenTtlSeconds, 1800);
  assert.equal(
    parseConfig(configEnv({ PORT: '5432', FRONTEND_URL: 'https://example.com/' })).frontendUrl,
    'https://example.com',
  );
  for (const env of [
    { PORT: '' },
    { PORT: '0' },
    { PORT: '65536' },
    { PORT: '5e3' },
    { PORT: '5000x' },
    { NODE_ENV: 'invalid' },
    { HOST: 'example.com' },
    { FRONTEND_URL: '*' },
    { FRONTEND_URL: 'https://user:secret@example.com' },
    { FRONTEND_URL: 'https://example.com/path' },
    { FRONTEND_URL: 'https://example.com?secret=value' },
    { FRONTEND_URL: 'ftp://example.com' },
    { NODE_ENV: 'production', FRONTEND_URL: 'http://example.com' },
    { JWT_SECRET: 'short' },
    { JWT_SECRET: validSecret, JWT_ACCESS_TTL_SECONDS: '59' },
    { JWT_SECRET: validSecret, LOGIN_RATE_LIMIT_MAX: '0' },
    { TRUSTED_PROXY: 'true' },
    { TRUSTED_PROXY: '0.0.0.0/0' },
  ])
    assert.throws(() => parseConfig(configEnv(env)));
  assert.equal(
    parseConfig(configEnv({ NODE_ENV: 'production', FRONTEND_URL: 'https://example.com' })).nodeEnv,
    'production',
  );
});

test('development loopback aliases share CORS and CSRF allowlists without broadening production', async (t) => {
  const config = parseConfig(configEnv());
  assert.deepEqual(config.trustedOrigins, ['http://127.0.0.1:5173', 'http://localhost:5173']);
  assert.deepEqual(parseConfig(configEnv({ FRONTEND_URL: 'http://localhost:5173' })).trustedOrigins, [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  assert.deepEqual(
    parseConfig(configEnv({ NODE_ENV: 'production', FRONTEND_URL: 'https://127.0.0.1:5173' })).trustedOrigins,
    ['https://127.0.0.1:5173'],
  );
  assert.deepEqual(parseConfig(configEnv({ FRONTEND_URL: 'https://example.com' })).trustedOrigins, [
    'https://example.com',
  ]);
  const server = createApp(config, { database: {} }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const origin of [
    ...config.trustedOrigins,
    'http://localhost:5174',
    'https://localhost:5173',
    'http://localhost.attacker.example:5173',
  ]) {
    const allowed = config.trustedOrigins.includes(origin);
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, allowed ? 401 : 403);
    assert.equal(response.headers.get('access-control-allow-origin'), allowed ? origin : null);
    assert.equal((await response.json()).error.code, allowed ? 'INVALID_CREDENTIALS' : 'UNTRUSTED_ORIGIN');
  }
  const crossSite = await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Sec-Fetch-Site': 'cross-site' },
  });
  assert.equal(crossSite.status, 403);
});

test('development HTTPS tunnel is explicitly trusted while other origins remain blocked', async (t) => {
  const tunnel = 'https://dev-machine.example-tailnet.ts.net';
  const config = parseConfig(configEnv({ DEV_FRONTEND_URL: tunnel }));
  assert.deepEqual(config.trustedOrigins, ['http://127.0.0.1:5173', tunnel, 'http://localhost:5173']);
  for (const value of [
    '*',
    'https://*.example.com',
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com/path',
    'https://example.com?q=1',
    'https://example.com/#fragment',
  ]) {
    assert.throws(() => parseConfig(configEnv({ DEV_FRONTEND_URL: value })));
  }
  assert.throws(() =>
    parseConfig(configEnv({ NODE_ENV: 'production', FRONTEND_URL: 'https://example.com', DEV_FRONTEND_URL: tunnel })),
  );
  const server = createApp(config, { database: {} }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const origin of [tunnel, 'http://localhost:5173', `${tunnel}.attacker.example`]) {
    const allowed = config.trustedOrigins.includes(origin);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, allowed ? 401 : 403);
    assert.equal(response.headers.get('access-control-allow-origin'), allowed ? origin : null);
    assert.equal((await response.json()).error.code, allowed ? 'INVALID_CREDENTIALS' : 'UNTRUSTED_ORIGIN');
  }
});

test('Prisma URL validation requires PostgreSQL and never reflects credentials', () => {
  const url = 'postgresql://USER:PASSWORD@localhost:5432/ewaguard';
  assert.equal(databaseUrl({ DATABASE_URL: url }), url);
  for (const value of [undefined, '', 'mysql://user:secret@localhost/db', 'postgresql://localhost']) {
    assert.throws(() => databaseUrl({ DATABASE_URL: value }), {
      message: 'DATABASE_URL must be a PostgreSQL connection URL with a database name.',
    });
  }
});

test('HTTP foundation: health, CORS, security headers, 404, malformed and oversized JSON', async (t) => {
  const config = parseConfig(configEnv());
  const server = createApp(config, { database: {} }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/api/health`, { headers: { Origin: config.frontendUrl } });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'ewaguard-api' });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.headers.get('x-powered-by'), null);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('access-control-allow-origin'), config.frontendUrl);
  const foreign = await fetch(`${base}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
  assert.notEqual(foreign.headers.get('access-control-allow-origin'), 'https://untrusted.example');
  assert.notEqual(foreign.headers.get('access-control-allow-origin'), '*');
  const missing = await fetch(`${base}/api/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: { code: 'NOT_FOUND', message: 'API route not found.' } });
  const malformed = await fetch(`${base}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"secret":"DO_NOT_REFLECT",',
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' },
  });
  const oversized = await fetch(`${base}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(33000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'PAYLOAD_TOO_LARGE');
});

test('unexpected errors disclose neither stack nor sensitive payload in response or log', (t) => {
  const logger = t.mock.method(console, 'error', () => {});
  const response = {
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  errorHandler(new Error('secret://private-database'), {}, response, () => assert.fail('Unexpected next'));
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  assert.equal(logger.mock.callCount(), 1);
  assert.equal(JSON.stringify(logger.mock.calls).includes('secret://private-database'), false);
});
