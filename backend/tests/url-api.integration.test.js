import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { hashPassword } from '../src/auth/auth-service.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { createUrlAnalyzer } from '../src/analyzers/url/url-analyzer.js';
import { createThreatIntelligence } from '../src/services/threat-intelligence.js';
import { URL_SUBMISSION_LIMIT } from '../src/routes/url-analysis.js';

test('Phase 6B authenticated HTTP and PostgreSQL integration', async (t) => {
  const dbUrl = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname)); assert.equal(dbUrl.pathname, '/ewaguard_ai');
  const database = createDatabaseClient();
  const users = []; const servers = []; const logs = [];
  for (const method of ['log', 'error', 'warn', 'info']) t.mock.method(console, method, (...args) => logs.push(args.join(' ')));
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => server.close(resolve));
    await database.urlAnalysis.deleteMany({ where: { userId: { in: users } } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    await database.$disconnect();
  });
  const password = `Synthetic-${randomUUID()}!`;
  const roles = await database.role.findMany();
  async function user(role) {
    const result = await database.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'URL', lastName: 'Test', status: 'ACTIVE',
      passwordHash: await hashPassword(password), roleId: roles.find((r) => r.name === role).id,
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'test-only', mfaLastCounter: 0n } : {}),
    } });
    users.push(result.id); return result;
  }
  const employee = await user('EMPLOYEE'); const admin = await user('IT_SECURITY_ADMIN');
  const config = parseConfig({ NODE_ENV: 'test', FRONTEND_URL: 'http://127.0.0.1:5173', JWT_SECRET: 'url-test-secret-with-sufficient-entropy', VIRUSTOTAL_API_KEY: 'KEY_SENTINEL_6B' });
  const token = (u) => `${authCookie(config).name}=${issueAccessToken(u.id, config, u.mfaEnabledAt)}`;
  let cookie = token(employee); let base; let networkCalls = 0;
  const analyzer = createUrlAnalyzer({
    resolveTarget: async () => { networkCalls++; return { addresses: ['8.8.8.8'], evidence: { status: 'RESOLVED', publicAddressesOnly: true, resolvedIpCount: 1 } }; },
    tlsInspector: async () => ({ status: 'UNAVAILABLE' }),
    threatIntelligence: createThreatIntelligence({ apiKey: config.virusTotalApiKey, fetchImpl: async () => Response.json({ data: { attributes: {
      last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 60, undetected: 5 }, raw: 'RAW_PROVIDER_SENTINEL_6B',
    } } }) }),
  });
  const start = async (dependencies = {}) => {
    const server = createApp(config, { database, urlAnalysis: { analyzer }, ...dependencies }).listen(0, '127.0.0.1');
    servers.push(server); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
  };
  const post = (path, data, auth = cookie, origin = config.frontendUrl) => fetch(`${base}${path}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: origin, ...(auth ? { Cookie: auth } : {}),
  }, body: JSON.stringify(data) });
  const submit = (data = { url: 'https://example.com/' }, auth = cookie, origin) => post('/api/analysis/url', data, auth, origin);
  await start();
  await t.test('anonymous, admin, wrong origin, and missing acknowledgement rejected', async () => {
    assert.equal((await submit(undefined, null)).status, 401);
    assert.equal((await submit(undefined, token(admin))).status, 403);
    assert.equal((await submit(undefined, cookie, 'https://elsewhere.com')).status, 403);
    assert.equal((await submit()).status, 403); assert.equal(networkCalls, 0);
  });
  await t.test('employee login and active acknowledgement', async () => {
    const response = await post('/api/auth/login', { email: employee.email, password }, null);
    assert.equal(response.status, 200); cookie = response.headers.getSetCookie().find((c) => c.startsWith(authCookie(config).name + '=')).split(';')[0];
    assert.equal((await post('/api/disclaimers/acknowledge', { context: 'URL_ANALYSIS' })).status, 201);
  });
  await start();
  await t.test('reject unknown fields, wrong types, malformed/internal URLs before network', async () => {
    for (const data of [{ url: 'https://example.com', userId: admin.id }, {}, { url: null }, { url: 7 }, { url: '' },
      { url: 'javascript:alert(1)' }, { url: 'https://127.0.0.1' }, { url: 'http://localhost' }, { url: 'https://user:password@example.com' }, { url: 'https://example.com/' + 'a'.repeat(4096) }]) {
      assert.equal((await submit(data)).status, 400);
    }
    assert.equal(networkCalls, 0);
  });
  await start();
  await t.test('benign analysis persisted to session owner with normalized provider evidence', async () => {
    const response = await submit(); assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.equal(data.result.threatIntelligence[0].status, 'AVAILABLE');
    const row = await database.urlAnalysis.findUniqueOrThrow({ where: { id: data.analysisId } });
    assert.equal(row.userId, employee.id); assert.equal(row.status, 'COMPLETED'); assert.equal(row.severity, null); assert.equal(row.riskScore, null);
    assert.deepEqual(row.evidence, data.result); assert.equal(row.expiresAt - row.analyzedAt, 30 * 86400_000);
    assert.doesNotMatch(JSON.stringify(row), /KEY_SENTINEL_6B|RAW_PROVIDER_SENTINEL_6B|last_analysis_stats/);
  });
  await t.test('path, unknown query names, query values, fragments not persisted or returned', async () => {
    const response = await submit({ url: 'https://example.com/PATH_SENTINEL_6B?token=VALUE_SENTINEL_6B&NAME_SENTINEL_6B=OTHER_SENTINEL_6B#FRAGMENT_SENTINEL_6B' });
    assert.equal(response.status, 201); const data = await response.json();
    const row = await database.urlAnalysis.findUniqueOrThrow({ where: { id: data.analysisId } });
    assert.doesNotMatch(JSON.stringify({ data, row }), /PATH_SENTINEL|VALUE_SENTINEL|NAME_SENTINEL|OTHER_SENTINEL|FRAGMENT_SENTINEL/);
    assert.equal(data.result.threatIntelligence[0].status, 'SKIPPED_PRIVACY');
  });
  await t.test('missing provider key still completes and persists local analysis', async () => {
    await start({ urlAnalysis: { analyzer: createUrlAnalyzer({ resolveTarget: async () => ({ addresses: ['8.8.8.8'], evidence: { status: 'RESOLVED' } }), tlsInspector: async () => ({ status: 'UNAVAILABLE' }) }) } });
    const response = await submit(); assert.equal(response.status, 201);
    assert.equal((await response.json()).result.threatIntelligence[0].status, 'NOT_CONFIGURED');
  });
  await t.test('database failure is sanitized and creates no partial row', async () => {
    const count = await database.urlAnalysis.count({ where: { userId: employee.id } });
    await start({ database: { user: database.user, disclaimerAcknowledgement: database.disclaimerAcknowledgement,
      urlAnalysis: { create: async () => { throw new Error('KEY_SENTINEL_6B SQL path'); } } } });
    const response = await submit(); assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
    assert.equal(await database.urlAnalysis.count({ where: { userId: employee.id } }), count);
  });
  await t.test('rate limiting per employee', async () => {
    await start();
    for (let i = 0; i < URL_SUBMISSION_LIMIT; i++) assert.equal((await submit({ url: '' })).status, 400);
    assert.equal((await submit()).status, 429);
  });
  await t.test('concurrency remains bounded until analysis completes', async () => {
    let release; let ready;
    const gate = new Promise((resolve) => { release = resolve; });
    const allEntered = new Promise((resolve) => { ready = resolve; });
    let active = 0;
    await start({ urlAnalysis: { analyzer: async (input) => { active++; if (active === 4) ready(); await gate; return analyzer(input); } } });
    const pending = Array.from({ length: 4 }, () => submit());
    try { await allEntered; assert.equal((await submit()).status, 503); }
    finally { release(); }
    for (const response of await Promise.all(pending)) assert.equal(response.status, 201);
    assert.equal((await submit()).status, 201);
  });
  await t.test('expired and future URL acknowledgements cannot authorize submission', async () => {
    await start();
    for (const createdAt of [new Date(Date.now() - 16 * 60_000), new Date(Date.now() + 60_000)]) {
      await database.disclaimerAcknowledgement.updateMany({ where: { userId: employee.id, context: 'URL_ANALYSIS' }, data: { createdAt } });
      assert.equal((await submit()).status, 403);
    }
    await database.disclaimerAcknowledgement.updateMany({ where: { userId: employee.id }, data: { createdAt: new Date() } });
  });
  await t.test('logout and no analysis history route', async () => {
    await start(); assert.equal((await fetch(`${base}/api/analysis/url/${randomUUID()}`, { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await post('/api/auth/logout', {})).status, 204); assert.equal((await submit(undefined, null)).status, 401);
  });
  assert.doesNotMatch(logs.join('\n'), /KEY_SENTINEL_6B|RAW_PROVIDER_SENTINEL_6B|VALUE_SENTINEL_6B|PATH_SENTINEL_6B/);
});
