import { buildIncidentAssistance } from '../src/assistance/incident-assistance.js';
import { cleanupTestIncidents } from './incident-cleanup.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { projectIncidentDetail } from '../src/incidents/incident-detail.js';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { hashPassword } from '../src/auth/auth-service.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { analyzeEmail } from '../src/analyzers/email/email-analyzer.js';
import { minimizeEmailEvidence } from '../src/analyzers/email/email-privacy.js';
import { EMAIL_LIMITS, EmailAnalysisError } from '../src/analyzers/email/email-policy.js';
import { EMAIL_ACKNOWLEDGEMENT_MAX_AGE_MS, EMAIL_SUBMISSION_LIMIT } from '../src/routes/email-analysis.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';

const ORIGIN = 'http://127.0.0.1:5173';
const SENTINELS = ['BodySentinel6A2', 'HeaderSentinel6A2', 'PasswordSentinel6A2', 'BearerSentinel6A2', 'ApiKeySentinel6A2', 'PrivateKeySentinel6A2'];
const body = `${SENTINELS[0]} urgent: provide your password. password: ${SENTINELS[2]}\nBearer ${SENTINELS[3]}\napi_key: ${SENTINELS[4]}\n-----BEGIN PRIVATE KEY-----\n${SENTINELS[5]}\n-----END PRIVATE KEY-----`;
const headers = `From: person@example.invalid\r\nSubject: ${SENTINELS[1]}\r\nReply-To: other@elsewhere.invalid`;
const eml = `${headers}\r\n\r\n${body}`;

test('Phase 6A2 HTTP and real PostgreSQL privacy boundaries', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const database = createDatabaseClient();
  const ids = [];
  const servers = [];
  const logs = [];
  for (const method of ['info', 'warn', 'error', 'log']) t.mock.method(console, method, (...args) => logs.push(args.join(' ')));
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => server.close(resolve));
    await cleanupTestIncidents(database, ids);
    await database.emailAnalysis.deleteMany({ where: { userId: { in: ids } } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: ids } } });
    await database.user.deleteMany({ where: { id: { in: ids } } });
    await database.$disconnect();
  });
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'email-api-test-secret-with-sufficient-entropy', FRONTEND_URL: ORIGIN });
  const password = `Synthetic-${randomUUID()}!`;
  const roles = await database.role.findMany();
  async function user(role = 'EMPLOYEE') {
    const value = await database.user.create({ data: {
      email: `${randomUUID()}@example.invalid`, firstName: 'Email', lastName: 'Test',
      status: 'ACTIVE', passwordHash: await hashPassword(password),
      roleId: roles.find((r) => r.name === role).id,
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'test-only', mfaLastCounter: 0n } : {}),
    } });
    ids.push(value.id);
    return value;
  }
  const employee = await user();
  const other = await user();
  const admin = await user('IT_SECURITY_ADMIN');
  const token = (u) => `${authCookie(config).name}=${issueAccessToken(u.id, config, u.mfaEnabledAt)}`;
  async function start(dependencies = {}) {
    const server = createApp(config, { database, ...dependencies }).listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  }
  let base = await start();
  let cookie = token(employee);
  const post = (path, data, auth = cookie, extraHeaders = {}) => fetch(`${base}${path}`, {
    method: 'POST', headers: { Origin: ORIGIN, ...(auth ? { Cookie: auth } : {}),
      ...(data instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
  const text = (data = { body, headers }, auth = cookie, extraHeaders) => post('/api/analysis/email/text', data, auth, extraHeaders);
  const form = (content = eml, name = 'email.eml', type = 'message/rfc822', field = 'file') => {
    const value = new FormData();
    value.append(field, new Blob([content], { type }), name);
    return value;
  };
  const upload = (data = form(), auth = cookie) => post('/api/analysis/email/eml', data, auth);
  const acknowledgement = (overrides = {}) => database.disclaimerAcknowledgement.create({ data: {
    userId: employee.id, version: DISCLAIMER_DEFINITION.version, context: 'EMAIL_ANALYSIS', ...overrides,
  } });
  const resetAcknowledgements = () => database.disclaimerAcknowledgement.deleteMany({ where: { userId: employee.id } });

  await t.test('anonymous and MFA-authenticated admin denied in both modes', async () => {
    for (const submit of [text, upload]) {
      assert.equal((await submit(undefined, null)).status, 401);
      assert.equal((await submit(undefined, token(admin))).status, 403);
    }
  });
  await t.test('missing, wrong context, version, expired, future and foreign acknowledgements denied', async () => {
    assert.equal((await text()).status, 403);
    for (const overrides of [
      { context: 'FILE_ANALYSIS' }, { version: 'obsolete' }, { userId: other.id },
      { createdAt: new Date(Date.now() - EMAIL_ACKNOWLEDGEMENT_MAX_AGE_MS - 1000) },
      { createdAt: new Date(Date.now() + 60_000) },
    ]) {
      const ack = await acknowledgement(overrides);
      assert.equal((await text()).status, 403);
      assert.equal((await upload()).status, 403);
      await database.disclaimerAcknowledgement.delete({ where: { id: ack.id } });
    }
  });
  await t.test('live employee login and acknowledgement through existing APIs', async () => {
    const login = await post('/api/auth/login', { email: employee.email, password }, null);
    assert.equal(login.status, 200);
    cookie = login.headers.getSetCookie().find((v) => v.startsWith(`${authCookie(config).name}=`)).split(';')[0];
    const ack = await post('/api/disclaimers/acknowledge', { context: 'EMAIL_ANALYSIS' });
    assert.equal(ack.status, 201);
  });
  await t.test('DB status and role are authoritative for existing session', async () => {
    await database.user.update({ where: { id: employee.id }, data: { status: 'SUSPENDED' } });
    assert.equal((await text()).status, 401);
    await database.user.update({ where: { id: employee.id }, data: { status: 'ACTIVE', roleId: admin.roleId } });
    assert.equal((await text()).status, 401);
    await database.user.update({ where: { id: employee.id }, data: { roleId: other.roleId } });
  });
  await t.test('untrusted origin denied before processing', async () => {
    assert.equal((await text(undefined, cookie, { Origin: 'https://untrusted.invalid' })).status, 403);
  });

  // New app instances use independent real limiter stores, keeping each group below 30.
  base = await start();
  await t.test('strict JSON contract, unknown identity/ack fields, types and sizes', async () => {
    for (const data of [
      { body, userId: other.id }, { body, inputType: 'EML' }, { body, acknowledgementId: randomUUID() },
      { body, version: DISCLAIMER_DEFINITION.version }, { body, unknown: true }, { body, riskLevel: 'LOW' }, { body, score: 0 }, { body, confidence: 'HIGH_CONFIDENCE' }, {}, [],
      { body: '  \n\t' }, { body: 123 }, { body, headers: null },
    ]) assert.equal((await text(data)).status, 400);
    for (const data of [
      { body: 'x'.repeat(EMAIL_LIMITS.bodyBytes + 1) },
      { body, headers: 'X: ' + 'x'.repeat(EMAIL_LIMITS.headerBytes) },
      { body, headers: '\n'.repeat(EMAIL_LIMITS.headerBytes + 1) },
    ]) assert.equal((await text(data)).status, 413);
    const malformed = await fetch(`${base}/api/analysis/email/text`, {
      method: 'POST', headers: { Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{ invalid',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
    assert.equal((await text({ body }, cookie, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal(await database.emailAnalysis.count({ where: { userId: employee.id } }), 0);
  });
  base = await start();
  await t.test('HTML-only phishing upload persists HIGH and automatically creates its incident', async () => {
    const content = await readFile(new URL('./fixtures/reported-paypal-phishing.eml', import.meta.url), 'utf8');
    const response = await upload(form(content));
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.result.risk.riskLevel, 'HIGH');
    assert.equal(payload.result.risk.score, 67);
    assert.equal(payload.incident.state, 'RECORDED');
    assert.equal(payload.incident.severity, 'HIGH');
    const stored = await database.emailAnalysis.findUnique({ where: { id: payload.analysisId } });
    assert.equal(stored.severity, 'HIGH');
    assert.equal(stored.riskScore, 67);
    const incident = await database.incident.findUnique({ where: { sourceKey: `EMAIL:${payload.analysisId}` }, include: { evidence: true } });
    assert.equal(incident.severity, 'HIGH');
    assert.equal(incident.reporterId, employee.id);
    assert.equal(incident.status, 'NEW');
    assert.equal(projectIncidentDetail(incident, true).risk.status, 'AVAILABLE');
    assert.equal(projectIncidentDetail(incident, true).guidance.status, 'AVAILABLE');
  });
  await t.test('assistance and exposure fields cannot be supplied by clients', async () => {
    for (const key of ['assistance', 'evidenceContext', 'credentialsExposed', 'suspectedExecution']) {
      const data = { body: 'Hello', [key]: true };
      assert.equal((await text(data)).status, 400);
    }
  });
  base = await start();
  await t.test('both modes persist only the existing minimized projection and return safe metadata', async () => {
    for (const [submit, inputType] of [[text, 'PASTED'], [upload, 'EML']]) {
      const response = await submit();
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const data = await response.json();
      assert.deepEqual(Object.keys(data).sort(), ['analysisId', 'createdAt', 'incident', 'result']);
      assert.equal(data.result.analyzer, 'EMAIL');
      assert.equal(data.result.inputType, inputType);
      assert.equal(data.result.provisionalClassification, 'SUSPICIOUS');
      const row = await database.emailAnalysis.findUniqueOrThrow({ where: { id: data.analysisId } });
      assert.equal(row.userId, employee.id);
      assert.equal(row.status, 'COMPLETED');
      assert.equal(row.riskScore, data.result.risk.score);
      assert.equal(row.severity, data.result.risk.riskLevel);
      assert.equal(row.riskRuleVersion, data.result.risk.version);
      assert.equal(row.evidence.risk.confidence, data.result.risk.confidence);
      assert.deepEqual(row.evidence.risk.reasonCodes, data.result.risk.reasons.map((r) => r.code));
      assert.equal(row.createdAt.toISOString(), data.createdAt);
      assert.ok(row.analyzedAt);
      assert.equal(row.expiresAt - row.analyzedAt, 30 * 86400_000);
      assert.deepEqual(row.evidence, minimizeEmailEvidence(data.result));
      assert.equal(row.evidence.assistance, undefined);
      assert.deepEqual(data.result.assistance, buildIncidentAssistance({ analyzerType: 'EMAIL', riskResult: row.evidence.risk }));
      assert.equal(data.incident.state, 'RECORDED');
      for (const key of ['senderDomain', 'replyToDomain']) assert.equal(row[key], null);
      const ack = await database.disclaimerAcknowledgement.findUniqueOrThrow({ where: { id: row.acknowledgementId } });
      assert.equal(ack.context, 'EMAIL_ANALYSIS');
      assert.equal(ack.userId, employee.id);
      const serialized = JSON.stringify(row);
      for (const sentinel of [...SENTINELS, body, headers, eml, 'example.invalid', 'elsewhere.invalid']) assert.ok(!serialized.includes(sentinel));
      for (const key of ['userId', 'acknowledgementId', 'evidence', 'expiresAt', 'passwordHash']) assert.ok(!Object.hasOwn(data, key));
    }
  });
  await t.test('maximum decoded JSON bounds work even when JSON escaping expands wire bytes', async () => {
    const response = await text({ body: '\t'.repeat(EMAIL_LIMITS.bodyBytes - 1) + 'x', headers: 'X-Test: ' + 'x'.repeat(EMAIL_LIMITS.headerBytes - 8) });
    assert.equal(response.status, 201);
  });
  base = await start();
  await t.test('upload rejects wrong extension/MIME, missing/wrong file, multiple files, fields and malformed messages', async () => {
    const before = await database.emailAnalysis.count({ where: { userId: employee.id } });
    const multiple = form();
    multiple.append('file', new Blob([eml]), 'second.eml');
    const extraField = form();
    extraField.append('userId', other.id);
    const nestedField = form();
    nestedField.append('x[999999999]', 'value');
    for (const data of [form(eml, 'email.txt'), form(eml, 'email.eml', 'image/png'),
      form('not an email'), form('From: a@example.invalid\r\nContent-Type: multipart/mixed; boundary=missing\r\n\r\nno closing boundary'),
      form('', 'empty.eml'), form(eml, 'email.eml', 'message/rfc822', 'unexpected'), new FormData(), multiple, extraField, nestedField,
    ]) assert.equal((await upload(data)).status, 400);
    assert.equal((await upload(form('x'.repeat(EMAIL_LIMITS.emlBytes + 1)))).status, 413);
    assert.equal((await upload({ body })).status, 415);
    const malformed = await fetch(`${base}/api/analysis/email/eml`, {
      method: 'POST', headers: { Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'multipart/form-data; boundary=broken' }, body: '--broken\r\n',
    });
    assert.equal(malformed.status, 400);
    assert.equal(await database.emailAnalysis.count({ where: { userId: employee.id } }), before);
  });
  await t.test('exact 1 MiB upload accepted; MIME fallback is still parsed', async () => {
    const prefix = 'From: person@example.invalid\r\n\r\n';
    assert.equal((await upload(form(prefix + 'x'.repeat(EMAIL_LIMITS.emlBytes - Buffer.byteLength(prefix)), 'test.EML', 'application/octet-stream'))).status, 201);
    assert.equal((await upload(form(eml, 'test.eml', 'text/plain'))).status, 201);
  });
  await t.test('rejected submissions create no partial rows; parser and database failures stay generic', async () => {
    const before = await database.emailAnalysis.count({ where: { userId: employee.id } });
    base = await start({ emailAnalysis: { analyzer: async () => { throw new EmailAnalysisError('EMAIL_PARSE_FAILED'); } } });
    const parser = await text();
    assert.equal(parser.status, 400);
    assert.deepEqual(await parser.json(), { error: { code: 'EMAIL_PARSE_FAILED', message: 'The email could not be parsed. Try a plain-text copy of the message.' } });
    base = await start({ emailAnalysis: { analyzer: async () => { throw new Error(`SQL path stack ${SENTINELS.join(' ')}`); } } });
    assert.deepEqual(await (await text()).json(), { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
    // Inject only the failing write; authentication, acknowledgements and HTTP remain real.
    base = await start({ database: { user: database.user, disclaimerAcknowledgement: database.disclaimerAcknowledgement,
      emailAnalysis: { create: async () => { throw new Error(`Prisma ${SENTINELS.join(' ')}`); } } } });
    const failedWrite = await text();
    assert.equal(failedWrite.status, 500);
    assert.deepEqual(await failedWrite.json(), { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
    assert.equal(await database.emailAnalysis.count({ where: { userId: employee.id } }), before);
  });
  await t.test('per-employee rate limit shared by text and upload', async () => {
    base = await start();
    for (let index = 0; index < EMAIL_SUBMISSION_LIMIT; index += 1) assert.equal((await text({ body: '' })).status, 400);
    const limited = await upload();
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('retry-after'));
    assert.equal((await text({ body: '' }, token(other))).status, 403);
  });
  await t.test('four active submissions bound concurrency and release after completion', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let entered = 0;
    let ready;
    const allEntered = new Promise((resolve) => { ready = resolve; });
    base = await start({ emailAnalysis: { analyzer: async (input) => {
      entered += 1;
      if (entered === 4) ready();
      await gate;
      return analyzeEmail(input);
    } } });
    const pending = Array.from({ length: 4 }, () => text({ body: 'Hello' }));
    try {
      await allEntered;
      assert.equal((await text()).status, 503);
    } finally { release(); }
    for (const response of await Promise.all(pending)) assert.equal(response.status, 201);
    assert.equal((await text()).status, 201);
  });
  await t.test('no history endpoint; logout clears cookie and anonymous submission fails', async () => {
    assert.equal((await fetch(`${base}/api/analysis/email/${randomUUID()}`, { headers: { Cookie: cookie } })).status, 404);
    const logout = await post('/api/auth/logout', {});
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
    assert.equal((await text(undefined, null)).status, 401);
  });
  await t.test('operational logs and persistent authentication audits contain no submitted content', async () => {
    assert.ok(logs.some((line) => line.includes('request_failed')));
    const audits = await database.auditLog.findMany({ where: { actorId: employee.id, resourceType: 'AUTHENTICATION' } });
    assert.ok(audits.some((row) => row.action === 'LOGIN_SUCCEEDED' && row.outcome === 'SUCCESS'));
    const output = logs.join('\n') + JSON.stringify(audits);
    for (const sentinel of [...SENTINELS, body, headers, eml, password]) assert.ok(!output.includes(sentinel));
  });
  // Cleanup also runs in t.after if a test fails.
  await database.emailAnalysis.deleteMany({ where: { userId: employee.id } });
  await resetAcknowledgements();
});
