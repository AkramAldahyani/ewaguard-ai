import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl, parseConfig } from '../src/config/env.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { CHAT_LIMITS, PRIVACY_NOTICE, modelPricing, ChatError } from '../src/ai/chat-policy.js';
import { createChatService, purgeExpiredChats } from '../src/ai/chat-service.js';
import { retentionPolicy } from '../src/privacy/retention-policy.js';

const ORIGIN = 'http://127.0.0.1:5173';
const answer = 'Use a second authentication factor and contact IT for help.';
const result = () => ({ model: 'gpt-6-luna', status: 'completed', service_tier: 'default',
  usage: { input_tokens: 100, output_tokens: 20 }, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer }] }] });

test('Phase 8A HTTP and PostgreSQL chat boundaries (mock provider, $0)', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const database = createDatabaseClient();
  const ids = [];
  const servers = [];
  const ledgerIds = [];
  const logs = [];
  for (const method of ['log', 'info', 'warn', 'error']) t.mock.method(console, method, (...args) => logs.push(args.join(' ')));
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => server.close(resolve));
    await database.aiUsage.deleteMany({ where: { OR: [{ userId: { in: ids } }, { id: { in: ledgerIds } }] } });
    await database.user.deleteMany({ where: { id: { in: ids } } });
    await database.$disconnect();
  });
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'chat-test-secret-long-enough-for-validation', FRONTEND_URL: ORIGIN,
    OPENAI_API_KEY: 'SyntheticApiKeySentinel8A', OPENAI_MODEL: 'gpt-6-luna' });
  async function user(role = 'EMPLOYEE') {
    const value = await database.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'Synthetic', lastName: 'Chat',
      passwordHash: 'synthetic-non-login-hash', status: 'ACTIVE', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}),
    } });
    ids.push(value.id); return value;
  }
  const employee = await user(); const other = await user(); const admin = await user('IT_SECURITY_ADMIN');
  const cookie = (u) => `${authCookie(config).name}=${issueAccessToken(u.id, config, u.mfaEnabledAt)}`;
  const requests = [];
  let respond = async () => result();
  const provider = { model: 'gpt-6-luna', verify: async () => modelPricing('gpt-6-luna'),
    respond: async (...args) => { requests.push(args); return respond(...args); } };
  async function start(extra = {}) {
    const server = createApp(config, { database, chat: { provider }, ...extra }).listen(0, '127.0.0.1');
    servers.push(server); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`;
  }
  let base = await start();
  const request = (path, body, u = employee, headers = {}) => fetch(`${base}/api/chat${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(u ? { Cookie: cookie(u) } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  async function conversation(u = employee) {
    const response = await request('/conversations', {}, u); assert.equal(response.status, 201);
    return (await response.json()).conversation;
  }
  const payload = (overrides = {}) => ({ content: 'How does MFA protect an account? SyntheticMessageSentinel8A', requestId: randomUUID(), privacyNoticeVersion: PRIVACY_NOTICE.version, ...overrides });
  let session;
  await t.test('authenticated employee creates conversation and reads versioned notice', async () => {
    session = await conversation();
    assert.equal((await database.chatSession.findUnique({ where: { id: session.id } })).ownerId, employee.id);
    assert.ok(new Date(session.expiresAt) > new Date());
    const notice = await (await request('/privacy')).json(); assert.equal(notice.privacyNotice.version, PRIVACY_NOTICE.version);
  });
  await t.test('anonymous, admin, disabled account, cross-user and CSRF rejected', async () => {
    assert.equal((await request('/conversations', {}, null)).status, 401);
    assert.equal((await request('/conversations', {}, admin)).status, 403);
    assert.equal((await request(`/conversations/${session.id}`, undefined, other)).status, 404);
    assert.equal((await request(`/conversations/${session.id}/messages`, payload(), other)).status, 404);
    assert.equal((await request('/conversations', {}, employee, { Origin: 'https://evil.invalid' })).status, 403);
    await database.user.update({ where: { id: employee.id }, data: { status: 'SUSPENDED' } });
    assert.equal((await request('/conversations', {})).status, 401);
    await database.user.update({ where: { id: employee.id }, data: { status: 'ACTIVE' } });
    assert.equal(requests.length, 0);
  });
  await t.test('strict roles, oversized messages, secrets and acknowledgement rejected before provider', async () => {
    for (const role of ['user', 'system', 'developer', 'assistant', 'tool']) assert.equal((await request(`/conversations/${session.id}/messages`, payload({ role }))).status, 400);
    for (const value of [payload({ content: 'x'.repeat(2001) }), payload({ content: 'password: SyntheticSecret8A' }), payload({ content: 'https://example.invalid/?token=secret' }), payload({ privacyNoticeVersion: 'old' }), payload({ tools: [] }), payload({ ownerId: other.id })]) {
      assert.ok([400, 413].includes((await request(`/conversations/${session.id}/messages`, value)).status));
    }
    assert.equal(requests.length, 0);
  });
  base = await start();
  await t.test('mock response and atomic ordered history; idempotent replay is free', async () => {
    const data = payload();
    const response = await request(`/conversations/${session.id}/messages`, data); assert.equal(response.status, 201);
    const body = await response.json(); assert.equal(body.messages[1].content, answer);
    assert.deepEqual(body.messages.map((m) => m.role), ['USER', 'ASSISTANT']);
    assert.ok(body.messages.every((m) => m.id));
    const replay = await request(`/conversations/${session.id}/messages`, data); assert.equal(replay.status, 200);
    assert.deepEqual((await replay.json()).messages, body.messages);
    assert.equal(requests.length, 1);
    const stored = await database.aiUsage.findUnique({ where: { userId_requestId: { userId: employee.id, requestId: data.requestId } } });
    assert.equal(stored.status, 'COMPLETED'); assert.equal(stored.inputTokens, 100); assert.equal(stored.outputTokens, 20);
    assert.ok(stored.chargedMicros < stored.reservedMicros);
    const history = await (await request(`/conversations/${session.id}`)).json(); assert.equal(history.messages.length, 2);
    assert.equal(history.requests.length, 1);
    assert.equal(history.requests[0].requestId, data.requestId);
    assert.deepEqual(Object.keys(history.requests[0]).sort(), ['requestId', 'status', 'toolMetadata', 'userSequence']);
    assert.equal(history.requests[0].status, 'COMPLETED');
    assert.equal(JSON.stringify(history).includes('SyntheticApiKeySentinel8A'), false);
    assert.equal((await (await request('/conversations', undefined, other)).json()).conversations.some((c) => c.id === session.id), false);
  });
  await t.test('only last eight messages supplied; bounded chronological pagination', async () => {
    await database.chatMessage.createMany({ data: Array.from({ length: 54 }, (_, i) => ({ sessionId: session.id, role: i % 2 ? 'ASSISTANT' : 'USER', content: `Synthetic history ${i}`, sequence: i + 2, expiresAt: new Date(session.expiresAt) })) });
    assert.equal((await request(`/conversations/${session.id}/messages`, payload())).status, 201);
    const input = requests.at(-1)[0]; assert.equal(input.length, 9); assert.equal(input[0].content, 'Synthetic history 46');
    assert.ok(input.every((m) => ['user', 'assistant'].includes(m.role)));
    const page = await (await request(`/conversations/${session.id}`)).json(); assert.equal(page.messages.length, 50);
    assert.ok(page.messages.every((m, i, a) => i === 0 || m.sequence > a[i - 1].sequence));
    const older = await (await request(`/conversations/${session.id}?before=${page.nextBefore}`)).json(); assert.equal(older.messages.length, 8);
  });
  async function entry(overrides = {}) {
    const row = await database.aiUsage.create({ data: { userId: other.id, requestId: randomUUID(), model: 'gpt-6-luna', pricingVersion: 'synthetic', instructionVersion: 'synthetic', privacyNoticeVersion: PRIVACY_NOTICE.version,
      inputTokenBound: 10000, outputTokenBound: 500, reservedMicros: 1, chargedMicros: 0, status: 'FAILED', ...overrides } });
    ledgerIds.push(row.id); return row;
  }
  await t.test('daily limit persists across app instances and counts attempts', async () => {
    for (let i = 0; i < CHAT_LIMITS.dailyRequests; i++) await entry();
    const own = await conversation(other); base = await start();
    const r = await request(`/conversations/${own.id}/messages`, payload(), other);
    assert.equal(r.status, 429); assert.equal((await r.json()).error.code, 'CHAT_DAILY_LIMIT');
    await database.aiUsage.deleteMany({ where: { id: { in: ledgerIds } } });
  });
  await t.test('budget is reserved atomically across simultaneous admissions', async () => {
    // Preserve the real ledger. Reserve relative to existing usage, not an
    // assumption that this shared development database has never been used.
    const existing = await database.aiUsage.aggregate({ _sum: { chargedMicros: true } });
    const blocker = await entry({ chargedMicros: CHAT_LIMITS.budgetMicros - (existing._sum.chargedMicros ?? 0) - 1500 });
    let release; const gate = new Promise((resolve) => { release = resolve; });
    let entered; const started = new Promise((resolve) => { entered = resolve; });
    respond = async () => { entered(); await gate; return result(); };
    const a = await conversation(); const b = await conversation(other);
    const serviceA = createChatService({ database, provider }); const serviceB = createChatService({ database, provider });
    const first = serviceA.send({ userId: employee.id, sessionId: a.id, content: 'What is phishing?', requestId: randomUUID() });
    await started;
    try {
      await assert.rejects(serviceB.send({ userId: other.id, sessionId: b.id, content: 'What is phishing?', requestId: randomUUID() }), { code: 'AI_BUDGET_EXHAUSTED' });
    } finally { release(); await first; respond = async () => result(); await database.aiUsage.delete({ where: { id: blocker.id } }); }
  });
  await t.test('two global slots and single conversation slot survive multiple services', async () => {
    const a = await entry({ status: 'RESERVED', sessionId: session.id });
    let r = await request(`/conversations/${session.id}/messages`, payload()); assert.equal((await r.json()).error.code, 'CHAT_BUSY');
    const b = await entry({ status: 'RESERVED' });
    r = await request(`/conversations/${session.id}/messages`, payload()); assert.equal((await r.json()).error.code, 'AI_BUSY');
    await database.aiUsage.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  });
  await t.test('ambiguous usage, provider failures and stale reservations fail closed', async () => {
    for (const error of [new ChatError(504, 'AI_TIMEOUT', 'Timeout.'), new ChatError(429, 'AI_RATE_LIMITED', 'Rate limited.'), new ChatError(503, 'AI_CREDITS_UNAVAILABLE', 'Credits unavailable.')]) {
      respond = async () => { throw error; };
      const r = await request(`/conversations/${session.id}/messages`, payload()); assert.equal(r.status, error.status);
      assert.equal((await r.json()).error.code, error.code);
      const blocked = await request(`/conversations/${session.id}/messages`, payload()); assert.equal((await blocked.json()).error.code, 'AI_USAGE_REVIEW_REQUIRED');
      await database.aiUsage.deleteMany({ where: { userId: employee.id, status: 'UNKNOWN' } });
    }
    respond = async () => ({ ...result(), usage: null });
    assert.equal((await request(`/conversations/${session.id}/messages`, payload())).status, 503);
    await database.aiUsage.deleteMany({ where: { userId: employee.id, status: 'UNKNOWN' } });
    const stale = await entry({ status: 'RESERVED', createdAt: new Date(Date.now() - 120000) });
    const r = await request(`/conversations/${session.id}/messages`, payload()); assert.equal((await r.json()).error.code, 'AI_USAGE_REVIEW_REQUIRED');
    await database.aiUsage.delete({ where: { id: stale.id } }); respond = async () => result();
  });
  base = await start();
  await t.test('malformed response charges known usage but stores no message or tools', async () => {
    const count = await database.chatMessage.count({ where: { sessionId: session.id } });
    respond = async () => ({ ...result(), output: [{ type: 'function_call', name: 'create_security_incident', arguments: '{}' }] });
    const r = await request(`/conversations/${session.id}/messages`, payload()); assert.equal(r.status, 502);
    assert.equal(await database.chatMessage.count({ where: { sessionId: session.id } }), count);
    respond = async () => result();
  });
  await t.test('storage failure rolls back both messages and retains known charge', async () => {
    const original = database.$transaction.bind(database);
    let creates = 0;
    const wrapped = new Proxy(database, { get(target, key) {
      if (key === '$transaction') return (operation, options) => original((tx) => operation(new Proxy(tx, { get(inner, prop) {
        if (prop === 'chatMessage') return new Proxy(inner.chatMessage, { get(delegate, method) {
          if (method === 'create') return async (args) => { if (++creates === 2) throw new Error('SyntheticStorageSecret8A'); return delegate.create(args); };
          return delegate[method];
        } });
        return inner[prop];
      } })), options);
      return target[key];
    } });
    const service = createChatService({ database: wrapped, provider });
    const count = await database.chatMessage.count({ where: { sessionId: session.id } });
    await assert.rejects(service.send({ userId: employee.id, sessionId: session.id, requestId: randomUUID(), content: 'What is phishing?' }));
    assert.equal(await database.chatMessage.count({ where: { sessionId: session.id } }), count);
    assert.equal(await database.aiUsage.count({ where: { userId: employee.id, status: 'RESERVED' } }), 0);
  });
  await t.test('missing configuration returns safe error without creating usage', async () => {
    base = await start({ chat: { provider: undefined } });
    // Isolated app gets a missing-key config, never the local real key.
    const server = createApp({ ...config, openaiApiKey: null }, { database }).listen(0, '127.0.0.1');
    servers.push(server); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
    const r = await request(`/conversations/${session.id}/messages`, payload()); assert.equal(r.status, 503); assert.equal((await r.json()).error.code, 'AI_NOT_CONFIGURED');
  });
  await t.test('expiry removes access and purge preserves costs', async () => {
    await database.chatSession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await request(`/conversations/${session.id}`)).status, 404);
    const before = await database.aiUsage.aggregate({ where: { userId: employee.id }, _sum: { chargedMicros: true } });
    const cleanup = await purgeExpiredChats(database, new Date(), employee.id, {
      apply: true, policy: retentionPolicy({ RETENTION_ENABLED: 'true' }) });
    await database.auditLog.deleteMany({ where: { resourceId: cleanup.runId } });
    assert.equal(cleanup.status, 'COMPLETED');
    assert.equal(await database.chatMessage.count({ where: { sessionId: session.id } }), 0);
    assert.deepEqual(await database.aiUsage.aggregate({ where: { userId: employee.id }, _sum: { chargedMicros: true } }), before);
  });
  await t.test('logs contain no messages, response text, keys, cookies or headers', () => {
    const output = logs.join('\n');
    for (const secret of ['SyntheticMessageSentinel8A', answer, config.openaiApiKey, 'SyntheticSecret8A', cookie(employee)]) assert.equal(output.includes(secret), false);
  });
});
