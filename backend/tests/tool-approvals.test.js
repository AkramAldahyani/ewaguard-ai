import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl, parseConfig } from '../src/config/env.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { analyzeEmail } from '../src/analyzers/email/email-analyzer.js';
import { createUrlAnalyzer } from '../src/analyzers/url/url-analyzer.js';
import { approvalProtection } from '../src/ai/tools/approval-crypto.js';
import { purgeExpiredApprovals } from '../src/ai/tools/approval-service.js';
import { retentionPolicy } from '../src/privacy/retention-policy.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';

test('approval ciphertext binds identity, operation, acknowledgement and exact expiry', () => {
  const protection = approvalProtection({ toolApprovalEncryptionKey: randomBytes(32).toString('hex') });
  const parameters = { body: 'Synthetic private email body', headers: '' };
  const row = { id: randomUUID(), userId: randomUUID(), conversationId: randomUUID(), acknowledgementId: randomUUID(),
    toolName: 'analyze_email', createdAt: new Date(), expiresAt: new Date(Date.now() + 300000) };
  row.parameterDigest = protection.digest(row.userId, row.conversationId, row.toolName, parameters);
  row.encryptedParameters = protection.seal(row, parameters);
  assert.deepEqual(JSON.parse(protection.open(row)), parameters);
  assert.equal(row.encryptedParameters.includes(parameters.body), false);
  assert.equal(protection.digest(row.userId, row.conversationId, row.toolName, { headers: '', body: parameters.body }), row.parameterDigest);
  for (const key of ['id', 'userId', 'conversationId', 'acknowledgementId', 'toolName', 'parameterDigest']) {
    assert.throws(() => protection.open({ ...row, [key]: randomUUID() }), { code: 'TOOL_APPROVAL_INVALID' });
  }
  assert.throws(() => protection.open({ ...row, expiresAt: new Date(row.expiresAt.getTime() + 1) }), { code: 'TOOL_APPROVAL_INVALID' });
  assert.throws(() => approvalProtection({}), { code: 'TOOL_APPROVALS_NOT_CONFIGURED' });
  assert.throws(() => parseConfig({ JWT_SECRET: 'x'.repeat(64), TOOL_APPROVAL_ENCRYPTION_KEY: 'x'.repeat(64) }));
  assert.throws(() => parseConfig({ JWT_SECRET: 'a'.repeat(64), TOOL_APPROVAL_ENCRYPTION_KEY: 'a'.repeat(64) }));
});

test('8B2A durable approval HTTP boundaries with synthetic analyzers and no paid calls', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const database = createDatabaseClient(); const users = []; const servers = []; const logs = [];
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (target, options) => {
    assert.equal(new URL(target).hostname, '127.0.0.1', 'External requests are forbidden');
    return realFetch(target, options);
  });
  for (const name of ['log', 'info', 'warn', 'error']) t.mock.method(console, name, (...args) => logs.push(args.join(' ')));
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => server.close(resolve));
    await database.toolApproval.deleteMany({ where: { userId: { in: users } } });
    for (const delegate of ['emailAnalysis', 'urlAnalysis']) await database[delegate].deleteMany({ where: { userId: { in: users } } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    await database.$disconnect();
  });
  const origin = 'http://127.0.0.1:5173';
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-approval-session-secret-at-least-32', FRONTEND_URL: origin,
    TOOL_APPROVAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  async function employee(role = 'EMPLOYEE') {
    const value = await database.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'Synthetic', lastName: 'Approval',
      passwordHash: 'not-a-login-hash', status: 'ACTIVE', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}) } });
    users.push(value.id);
    const conversation = await database.chatSession.create({ data: { ownerId: value.id, expiresAt: new Date(Date.now() + 3600000) } });
    const acks = {};
    for (const type of ['EMAIL', 'URL']) acks[type] = await database.disclaimerAcknowledgement.create({ data: {
      userId: value.id, context: `${type}_ANALYSIS`, version: DISCLAIMER_DEFINITION.version } });
    return { ...value, conversation, acks };
  }
  const owner = await employee(); const other = await employee(); const admin = await employee('IT_SECURITY_ADMIN');
  let scans = 0; let network = 0;
  const urlAnalyzer = createUrlAnalyzer({ resolveTarget: async () => { network++; return { addresses: [], evidence: { status: 'UNAVAILABLE' } }; },
    tlsInspector: async () => ({ status: 'UNAVAILABLE' }) });
  let analyze = async (input) => { scans++; return analyzeEmail(input); };
  async function start(overrides = {}, store = database) {
    const server = createApp({ ...config, ...overrides }, { database: store,
      emailAnalysis: { analyzer: (...args) => analyze(...args) }, urlAnalysis: { analyzer: urlAnalyzer },
      chat: { provider: { verify: () => assert.fail('No OpenAI call is allowed') } } }).listen(0, '127.0.0.1');
    servers.push(server); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`;
  }
  let base = await start();
  const cookie = (u) => `${authCookie(config).name}=${issueAccessToken(u.id, config, u.mfaEnabledAt)}`;
  const path = (u = owner) => `/api/tool-approvals/conversations/${u.conversation.id}/requests`;
  const send = async (endpoint, body, u = owner, headers = {}, server = base) => {
    const response = await fetch(server + endpoint, { method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(u ? { Cookie: cookie(u) } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  const input = (type = 'EMAIL') => ({ requestId: randomUUID(), toolName: type === 'EMAIL' ? 'analyze_email' : 'analyze_url',
    parameters: type === 'EMAIL' ? { body: 'SyntheticPrivateBody8B2 unexpected invitation.', headers: '' } : { url: 'https://example.com/' } });
  const prepare = async (data = input(), u = owner) => {
    const response = await send(path(u), data, u); assert.equal(response.status, 201, JSON.stringify(response.data)); return response.data.approval;
  };
  const decision = (row, value = 'CONFIRM', u = owner, server = base) => send(`${path(u)}/${row.id}/decision`, { decision: value }, u, {}, server);
  const run = async (name, work) => { base = await start(); await t.test(name, work); };
  await run('authentication, administrator, ownership and CSRF boundaries apply before preparation', async () => {
    assert.equal((await send(path(), input(), null)).status, 401);
    assert.equal((await send(path(admin), input(), admin)).status, 403);
    assert.equal((await send(path(), input(), other)).status, 404);
    assert.equal((await send(path(), input(), owner, { Origin: 'https://evil.invalid' })).status, 403);
    for (const extra of [{ userId: other.id }, { confirmed: true }, { riskScore: 100 }]) assert.equal((await send(path(), { ...input(), ...extra })).status, 400);
  });
  await run('pending approval is durable, encrypted, idempotent and does not scan', async () => {
    const before = scans; const data = input(); const row = await prepare(data);
    const stored = await database.toolApproval.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(scans, before); assert.equal(stored.status, 'PENDING');
    assert.equal(stored.expiresAt - stored.createdAt, 300000);
    assert.equal(JSON.stringify(stored).includes(data.parameters.body), false);
    assert.equal(JSON.stringify(row).includes(data.parameters.body), false);
    const second = await send(path(), data); assert.equal(second.status, 200); assert.equal(second.data.approval.id, row.id);
    const changed = await send(path(), { ...data, parameters: { body: 'Changed operation', headers: '' } }); assert.equal(changed.status, 409);
    const server = await start();
    const review = await send(`${path()}/${row.id}/review`, undefined, owner, {}, server);
    assert.equal(review.status, 200); assert.deepEqual(review.data.parameters, data.parameters); assert.equal(review.headers.get('cache-control'), 'no-store');
    const status = await send(`${path()}/${row.id}`); assert.equal(status.data.parameters, undefined);
    assert.equal((await send(`${path()}/${row.id}/review`, undefined, other)).status, 404);
    assert.equal((await send(`${path(other)}/${row.id}/review`, undefined, other)).status, 404);
    await decision(row, 'REJECT');
  });
  await run('explicit approval runs one email scan and returns a durable sanitized result', async () => {
    const row = await prepare(); const before = scans;
    const response = await decision(row); assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(scans, before + 1); assert.equal(response.data.approval.status, 'COMPLETED');
    assert.equal(response.data.result.trust, 'UNTRUSTED_DATA');
    assert.equal(JSON.stringify(response.data).includes('SyntheticPrivateBody8B2'), false);
    const stored = await database.toolApproval.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(stored.encryptedParameters, null); assert.ok(stored.emailAnalysisId);
    assert.equal((await database.emailAnalysis.findUniqueOrThrow({ where: { id: stored.emailAnalysisId } })).userId, owner.id);
    const replay = await decision(row); assert.equal(replay.status, 200); assert.equal(replay.data.replayed, true);
    assert.equal(replay.data.approval.analysisId, stored.emailAnalysisId); assert.equal(scans, before + 1);
    assert.equal((await decision(row, 'REJECT')).status, 409);
    assert.ok((await send(`${path()}/${row.id}`)).data.result);
  });
  await run('URL network analysis starts only on explicit confirmation', async () => {
    const before = network; const row = await prepare(input('URL')); assert.equal(network, before);
    const response = await decision(row); assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(network, before + 1); assert.equal(response.data.result.data.analyzerType, 'URL');
    const stored = await database.toolApproval.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal((await database.urlAnalysis.findUniqueOrThrow({ where: { id: stored.urlAnalysisId } })).userId, owner.id);
    assert.equal(JSON.stringify(response.data).includes('example.com'), false);
    await decision(row); assert.equal(network, before + 1);
    for (const url of ['file:///etc/passwd', 'http://127.0.0.1', 'http://2130706433', 'http://[::1]', 'https://example.com/?token=secret']) {
      assert.equal((await send(path(), { ...input('URL'), parameters: { url } })).status, 400);
    }
    assert.equal(network, before + 1);
  });
  await run('reject, expiry and attempts to change parameters cannot execute', async () => {
    const before = scans; const rejected = await prepare();
    assert.equal((await decision(rejected, 'REJECT')).data.approval.status, 'REJECTED');
    assert.equal((await decision(rejected, 'REJECT')).data.replayed, true);
    assert.equal((await decision(rejected)).status, 409);
    const expired = await prepare();
    await database.toolApproval.update({ where: { id: expired.id }, data: { createdAt: new Date(Date.now() - 360000), expiresAt: new Date(Date.now() - 60000) } });
    assert.equal((await decision(expired)).status, 410);
    assert.equal((await database.toolApproval.findUniqueOrThrow({ where: { id: expired.id } })).encryptedParameters, null);
    const changed = await prepare();
    assert.equal((await send(`${path()}/${changed.id}/decision`, { decision: 'CONFIRM', parameters: { body: 'changed' } })).status, 400);
    assert.equal((await send(`${path()}/${changed.id}/decision`, { decision: 'CONFIRM', userId: other.id })).status, 400);
    assert.equal(scans, before); await decision(changed, 'REJECT');
  });
  await run('current role, account, conversation and original acknowledgement are revalidated', async () => {
    const before = scans; const row = await prepare();
    await database.user.update({ where: { id: owner.id }, data: { status: 'SUSPENDED' } });
    assert.equal((await decision(row)).status, 401);
    await database.user.update({ where: { id: owner.id }, data: { status: 'ACTIVE', role: { connect: { name: 'IT_SECURITY_ADMIN' } } } });
    assert.ok([401, 403].includes((await decision(row)).status));
    await database.user.update({ where: { id: owner.id }, data: { role: { connect: { name: 'EMPLOYEE' } } } });
    await database.chatSession.update({ where: { id: owner.conversation.id }, data: { closedAt: new Date() } });
    assert.equal((await decision(row)).status, 404);
    await database.chatSession.update({ where: { id: owner.conversation.id }, data: { closedAt: null } });
    for (const patch of [{ createdAt: new Date(Date.now() - 16 * 60000) }, { createdAt: new Date(Date.now() + 60000) }]) {
      await database.disclaimerAcknowledgement.update({ where: { id: owner.acks.EMAIL.id }, data: patch });
      assert.equal((await decision(row)).status, 403);
    }
    // The existing database also prohibits changing the version of historical acknowledgements.
    await assert.rejects(database.disclaimerAcknowledgement.update({ where: { id: owner.acks.EMAIL.id }, data: { version: 'old' } }));
    await database.disclaimerAcknowledgement.update({ where: { id: owner.acks.EMAIL.id }, data: { createdAt: new Date(), version: DISCLAIMER_DEFINITION.version } });
    assert.equal(scans, before); await decision(row, 'REJECT');
  });
  await run('simultaneous confirmations across app instances consume only once', async () => {
    const row = await prepare(); const before = scans; const server = await start();
    let release; let entered;
    const started = new Promise((resolve) => { entered = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    analyze = async (value) => { scans++; entered(); await gate; return analyzeEmail(value); };
    const first = decision(row);
    try {
      await started;
      assert.equal((await decision(row, 'CONFIRM', owner, server)).status, 409);
    } finally { release(); }
    assert.equal((await first).status, 200); assert.equal(scans, before + 1);
    assert.equal((await decision(row, 'CONFIRM', owner, server)).data.replayed, true);
    analyze = async (value) => { scans++; return analyzeEmail(value); };
  });
  await run('failure is consumed and cannot be retried; errors disclose no raw content', async () => {
    const row = await prepare(); const before = scans;
    analyze = async () => { scans++; throw new Error('SyntheticPrivateBody8B2 secret://scanner'); };
    const failed = await decision(row); assert.equal(failed.status, 502); assert.equal(failed.data.error.code, 'TOOL_ANALYSIS_FAILED');
    assert.equal((await decision(row)).status, 409); assert.equal(scans, before + 1);
    assert.equal((await database.toolApproval.findUniqueOrThrow({ where: { id: row.id } })).encryptedParameters, null);
    analyze = async (value) => { scans++; return analyzeEmail(value); };
  });
  await run('successful result survives lost conversation access before the response', async () => {
    const row = await prepare();
    analyze = async (value) => {
      scans++;
      await database.chatSession.update({ where: { id: owner.conversation.id }, data: { closedAt: new Date() } });
      return analyzeEmail(value);
    };
    assert.equal((await decision(row)).status, 404);
    const stored = await database.toolApproval.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(stored.status, 'COMPLETED'); assert.ok(stored.emailAnalysisId);
    await database.chatSession.update({ where: { id: owner.conversation.id }, data: { closedAt: null } });
    const before = scans;
    const retrieved = await decision(row); assert.equal(retrieved.status, 200); assert.ok(retrieved.data.result);
    assert.equal(scans, before);
    analyze = async (value) => { scans++; return analyzeEmail(value); };
  });
  await run('interrupted executions remain consumed after a service restart', async () => {
    const row = await prepare(); const before = scans;
    await database.toolApproval.update({ where: { id: row.id }, data: { status: 'EXECUTING', encryptedParameters: null, decidedAt: new Date() } });
    const server = await start();
    assert.equal((await decision(row, 'CONFIRM', owner, server)).status, 409); assert.equal(scans, before);
    // Remove only this synthetic interrupted fixture; production never auto-retries it.
    await database.toolApproval.delete({ where: { id: row.id } });
  });
  await run('analysis and completion receipt roll back together when persistence fails', async () => {
    const row = await prepare(); const count = await database.emailAnalysis.count({ where: { userId: owner.id } });
    const original = database.$transaction.bind(database);
    const store = new Proxy(database, { get(target, key) {
      if (key === '$transaction') return (operation, options) => original((tx) => operation(new Proxy(tx, { get(inner, property) {
        if (property === 'toolApproval') return new Proxy(inner.toolApproval, { get(delegate, method) {
          if (method === 'update') return async (args) => {
            if (args.data.status === 'COMPLETED') throw new Error('SyntheticReceiptFailure');
            return delegate.update(args);
          };
          return delegate[method];
        } });
        return inner[property];
      } })), options);
      return target[key];
    } });
    const server = await start({}, store);
    assert.equal((await decision(row, 'CONFIRM', owner, server)).status, 502);
    assert.equal(await database.emailAnalysis.count({ where: { userId: owner.id } }), count);
    const stored = await database.toolApproval.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(stored.status, 'FAILED'); assert.equal(stored.emailAnalysisId, null);
    const before = scans; assert.equal((await decision(row)).status, 409); assert.equal(scans, before);
  });
  await run('persistent execution admission cap survives separate app instances', async () => {
    const row = await prepare(); const template = await database.toolApproval.findUniqueOrThrow({ where: { id: row.id } });
    const fixtures = Array.from({ length: 4 }, () => ({ ...template, id: randomUUID(), requestId: randomUUID(),
      encryptedParameters: null, status: 'EXECUTING', decidedAt: new Date() }));
    await database.toolApproval.createMany({ data: fixtures });
    try {
      const before = scans; const server = await start();
      assert.equal((await decision(row, 'CONFIRM', owner, server)).status, 503); assert.equal(scans, before);
      assert.equal((await database.toolApproval.findUniqueOrThrow({ where: { id: row.id } })).status, 'PENDING');
    } finally { await database.toolApproval.deleteMany({ where: { id: { in: fixtures.map((value) => value.id) } } }); }
    await decision(row, 'REJECT');
  });
  await run('tampering ciphertext or authenticated parameters fails before scanning', async () => {
    const row = await prepare(); const before = scans;
    await database.toolApproval.update({ where: { id: row.id }, data: { parameterDigest: 'a'.repeat(64) } });
    assert.equal((await decision(row)).status, 409); assert.equal(scans, before);
    await decision(row, 'REJECT');
  });
  await run('shared direct/approval rate limit cannot be bypassed', async () => {
    const row = await prepare(input('URL'));
    for (let i = 0; i < 10; i++) assert.equal((await send('/api/analysis/url', { url: '' })).status, 400);
    const before = network; assert.equal((await decision(row)).status, 429); assert.equal(network, before);
    await decision(row, 'REJECT');
  });
  await run('shared direct/approval concurrency holds until scans finish', async () => {
    const row = await prepare();
    let release; let entered = 0; let ready;
    const gate = new Promise((resolve) => { release = resolve; }); const allEntered = new Promise((resolve) => { ready = resolve; });
    analyze = async (value) => { if (++entered === 4) ready(); await gate; scans++; return analyzeEmail(value); };
    const direct = Array.from({ length: 4 }, () => send('/api/analysis/email/text', { body: 'Synthetic invitation.', headers: '' }));
    try { await allEntered; assert.equal((await decision(row)).status, 503); }
    finally { release(); }
    for (const result of await Promise.all(direct)) assert.equal(result.status, 201);
    analyze = async (value) => { scans++; return analyzeEmail(value); };
    await decision(row, 'REJECT');
  });
  await run('missing configuration, pending cap and expiry cleanup fail safely', async () => {
    const server = await start({ toolApprovalEncryptionKey: null });
    assert.equal((await send(path(), input(), owner, {}, server)).data.error.code, 'TOOL_APPROVALS_NOT_CONFIGURED');
    const pending = [];
    for (let i = 0; i < 5; i++) pending.push(await prepare(input(), other));
    assert.equal((await send(path(other), input(), other)).status, 429);
    for (const row of pending) await database.toolApproval.update({ where: { id: row.id },
      data: { createdAt: new Date(Date.now() - 360000), expiresAt: new Date(Date.now() - 60000) } });
    const cleanup = await purgeExpiredApprovals(database, new Date(), { ownerId: other.id,
      apply: true, policy: retentionPolicy({ RETENTION_ENABLED: 'true' }) });
    assert.equal(cleanup.status, 'COMPLETED');
    await database.auditLog.deleteMany({ where: { resourceId: cleanup.runId } });
    assert.equal(await database.toolApproval.count({ where: { userId: other.id, encryptedParameters: { not: null } } }), 0);
  });
  await run('no incident, model usage or sensitive operational log is produced', async () => {
    assert.equal(await database.incident.count({ where: { reporterId: { in: users } } }), 0);
    assert.equal(await database.aiUsage.count({ where: { userId: { in: users } } }), 0);
    for (const sentinel of ['SyntheticPrivateBody8B2', config.toolApprovalEncryptionKey, cookie(owner), 'secret://scanner']) assert.equal(logs.join('\n').includes(sentinel), false);
  });
});
