import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { parseConfig } from '../src/config/env.js';

// Synthetic database: malformed sign-ins fail validation before any account lookup.
const database = { auditLog: { create: async () => ({}) } };

async function start(t, overrides = {}) {
  const config = parseConfig({
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    LOGIN_RATE_LIMIT_MAX: '2',
    ...overrides,
  });
  const server = createApp(config, { database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return async (forwardedFor) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
      },
      body: '{}',
    });
    await response.arrayBuffer();
    return response.status;
  };
}

test('a trusted same-host proxy gives each client its own sign-in limit', async (t) => {
  const login = await start(t, { TRUSTED_PROXY: 'loopback' });
  assert.deepEqual([await login('203.0.113.1'), await login('203.0.113.1')], [401, 401]);
  assert.equal(await login('203.0.113.1'), 429);
  assert.equal(await login('203.0.113.2'), 401);
});

test('a client cannot evade its limit by prepending forged addresses through the proxy', async (t) => {
  const login = await start(t, { TRUSTED_PROXY: 'loopback' });
  for (const forged of ['198.51.100.1', '198.51.100.2']) assert.equal(await login(`${forged}, 203.0.113.1`), 401);
  assert.equal(await login('198.51.100.3, 203.0.113.1'), 429);
});

test('forwarded addresses are ignored unless the proxy is explicitly trusted', async (t) => {
  // express-rate-limit warns once about the untrusted header; that is expected here.
  t.mock.method(console, 'error', () => {});
  const login = await start(t);
  assert.deepEqual([await login('203.0.113.1'), await login('203.0.113.2')], [401, 401]);
  assert.equal(await login('203.0.113.3'), 429);
});
