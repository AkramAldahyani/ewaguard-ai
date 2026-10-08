import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { hashPassword } from '../src/auth/auth-service.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { createFileAnalyzer } from '../src/analyzers/file/file-analyzer.js';
import { createFileTempStore } from '../src/analyzers/file/file-temp.js';
import { FILE_MAX_BYTES, FILE_LIMITS } from '../src/analyzers/file/file-policy.js';
import { createThreatIntelligence } from '../src/services/threat-intelligence.js';

test('Phase 6C authenticated multipart API and minimized PostgreSQL persistence', async (t) => {
  const dbUrl = new URL(databaseUrl()); assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname)); assert.equal(dbUrl.pathname, '/ewaguard_ai');
  const database = createDatabaseClient(); const users = []; const servers = []; const logs = [];
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ewaguard-file-api-'));
  for (const method of ['log', 'info', 'warn', 'error']) t.mock.method(console, method, (...args) => logs.push(args.join(' ')));
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => server.close(resolve));
    await database.fileAnalysis.deleteMany({ where: { userId: { in: users } } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } }); await database.$disconnect();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); await fs.rm(root, { recursive: true, force: true });
  });
  const roles = await database.role.findMany(); const password = `Synthetic-${randomUUID()}!`;
  async function user(role) {
    const value = await database.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'File', lastName: 'Fixture', status: 'ACTIVE',
      passwordHash: await hashPassword(password), roleId: roles.find((r) => r.name === role).id,
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'test-only', mfaLastCounter: 0n } : {}),
    } }); users.push(value.id); return value;
  }
  const employee = await user('EMPLOYEE'); const other = await user('EMPLOYEE'); const admin = await user('IT_SECURITY_ADMIN');
  const config = parseConfig({ NODE_ENV: 'test', FRONTEND_URL: 'http://127.0.0.1:5173', JWT_SECRET: 'file-integration-test-with-sufficient-entropy' });
  const token = (u) => `${authCookie(config).name}=${issueAccessToken(u.id, config, u.mfaEnabledAt)}`;
  let cookie = token(employee); let base; let scanCalls = 0; const diskPaths = [];
  const scanners = {
    clamav: async (file) => { scanCalls++; diskPaths.push(file.filename); return { status: 'CLEAN', detections: [] }; },
    yara: async () => ({ status: 'NO_MATCH', matches: [] }),
  };
  const tempStore = createFileTempStore(root);
  const threatIntelligence = createThreatIntelligence({ apiKey: 'FILE_API_KEY_SENTINEL', fetchImpl: async () => Response.json({ data: { attributes: {
    last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 3, undetected: 4 }, names: ['RAW_PROVIDER_SENTINEL'],
  } } }) });
  const analyzer = createFileAnalyzer({ tempStore, scanners, threatIntelligence });
  const start = async (dependencies = {}) => {
    const server = createApp(config, { database, fileAnalysis: { analyzer }, ...dependencies }).listen(0, '127.0.0.1');
    servers.push(server); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
  };
  const post = (route, body, auth = cookie, origin = config.frontendUrl) => fetch(`${base}${route}`, { method: 'POST', headers: {
    Origin: origin, ...(auth ? { Cookie: auth } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
  }, body: body instanceof FormData ? body : JSON.stringify(body) });
  const content = 'FILE_CONTENT_SENTINEL harmless test text';
  const form = (bytes = content, name = 'SECRET_FILENAME.txt', mime = 'text/plain') => { const data = new FormData(); data.append('file', new Blob([bytes], { type: mime }), name); return data; };
  const submit = (body = form(), auth = cookie, origin) => post('/api/analysis/file', body, auth, origin);
  await start();
  await t.test('anonymous, admin, wrong origin, missing acknowledgement rejected before scanning', async () => {
    assert.equal((await submit(undefined, null)).status, 401); assert.equal((await submit(undefined, token(admin))).status, 403);
    assert.equal((await submit(undefined, cookie, 'https://untrusted.example')).status, 403); assert.equal((await submit()).status, 403); assert.equal(scanCalls, 0);
  });
  await t.test('employee login and FILE_ANALYSIS acknowledgement use existing APIs', async () => {
    const login = await post('/api/auth/login', { email: employee.email, password }, null); assert.equal(login.status, 200);
    cookie = login.headers.getSetCookie().find((v) => v.startsWith(authCookie(config).name + '=')).split(';')[0];
    assert.equal((await post('/api/disclaimers/acknowledge', { context: 'FILE_ANALYSIS' })).status, 201);
  });
  await start();
  await t.test('expired, future, wrong-context, obsolete, and foreign acknowledgements denied', async () => {
    const ack = await database.disclaimerAcknowledgement.findFirstOrThrow({ where: { userId: employee.id } });
    await database.disclaimerAcknowledgement.delete({ where: { id: ack.id } });
    for (const changes of [{ createdAt: new Date(Date.now() - 16 * 60_000) }, { createdAt: new Date(Date.now() + 60_000) }, { context: 'EMAIL_ANALYSIS' }, { version: 'obsolete' }, { userId: other.id }]) {
      const invalid = await database.disclaimerAcknowledgement.create({ data: { userId: employee.id, context: 'FILE_ANALYSIS', version: ack.version, createdAt: new Date(), ...changes } });
      try { assert.equal((await submit()).status, 403); }
      finally { await database.disclaimerAcknowledgement.delete({ where: { id: invalid.id } }); }
    }
    await database.disclaimerAcknowledgement.create({ data: { userId: employee.id, context: 'FILE_ANALYSIS', version: ack.version } });
  });
  await start();
  await t.test('one file only: missing file, multiple files, unexpected text and wrong file field rejected', async () => {
    const multiple = form(); multiple.append('file', new Blob(['test']), 'other.txt');
    const extra = form(); extra.append('userId', other.id);
    const wrong = new FormData(); wrong.append('other', new Blob(['test']), 'fixture.txt');
    for (const data of [new FormData(), multiple, extra, wrong]) assert.equal((await submit(data)).status, 400);
    assert.equal(scanCalls, 0); assert.deepEqual(await fs.readdir(root), []);
  });
  await start();
  await t.test('empty, oversized, unsupported file and wrong content type rejected', async () => {
    assert.equal((await submit(form(''))).status, 400);
    assert.equal((await submit(form(Buffer.alloc(FILE_MAX_BYTES + 1)))).status, 413);
    assert.equal((await submit(form('text', 'image.iso'))).status, 400);
    assert.equal((await submit({ file: 'wrong' })).status, 415);
    assert.equal(scanCalls, 0); assert.equal(await database.fileAnalysis.count({ where: { userId: employee.id } }), 0);
  });
  await start();
  await t.test('successful analysis persists authenticated owner, safe evidence and no raw bytes/payload', async () => {
    const response = await submit(); assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json(); assert.equal(data.result.analyzer, 'FILE');
    const row = await database.fileAnalysis.findUniqueOrThrow({ where: { id: data.analysisId } });
    assert.equal(row.userId, employee.id); assert.equal(row.sha256, createHash('sha256').update(content).digest('hex')); assert.equal(row.sizeBytes, BigInt(Buffer.byteLength(content)));
    assert.equal(row.clamavStatus, 'NO_KNOWN_DETECTION'); assert.equal(row.yaraStatus, 'NO_KNOWN_DETECTION'); assert.equal(row.storageKey, null);
    assert.equal(row.riskScore, null); assert.equal(row.severity, null); assert.ok(row.deletedAt); assert.equal(row.expiresAt - row.analyzedAt, 30 * 86400_000);
    assert.deepEqual(row.evidence, data.result);
    const serialized = JSON.stringify({ ...row, sizeBytes: Number(row.sizeBytes) });
    assert.doesNotMatch(serialized, /FILE_CONTENT_SENTINEL|SECRET_FILENAME|RAW_PROVIDER_SENTINEL|FILE_API_KEY_SENTINEL|stdout|stderr/);
    assert.deepEqual(await fs.readdir(root), []);
  });
  await t.test('dangerous traversal filename has no influence on disk path', async () => {
    const response = await submit(form(content, '../../injected;COMMAND.txt')); assert.equal(response.status, 201);
    const data = await response.json(); assert.equal(data.result.validation.suspiciousFilename, true);
    assert.equal(data.result.file.displayName, 'Submitted file.txt');
    assert.ok(diskPaths.every((name) => name.startsWith(root + path.sep) && !/injected|COMMAND|\.\./.test(name)));
    assert.deepEqual(await fs.readdir(root), []);
  });
  await t.test('type mismatch accepted as evidence; source content never executed', async () => {
    const response = await submit(form(content, 'invoice.pdf', 'application/pdf')); assert.equal(response.status, 201);
    const data = await response.json(); assert.equal(data.result.validation.extensionMismatch, true); assert.equal(data.result.provisionalClassification, 'SUSPICIOUS');
  });
  await start();
  await t.test('unavailable scanners/providers still return partial structured evidence', async () => {
    await start({ fileAnalysis: { analyzer: createFileAnalyzer({ tempStore, scanners: {
      clamav: async () => ({ status: 'UNAVAILABLE', detections: [] }), yara: async () => ({ status: 'TIMEOUT', matches: [] }),
    } }) } });
    const response = await submit(); assert.equal(response.status, 201); const data = await response.json();
    assert.equal(data.result.coverage, 'PARTIAL_EVIDENCE'); assert.equal(data.result.threatIntelligence.status, 'NOT_CONFIGURED');
  });
  await t.test('database error is sanitized after cleanup; no partial row', async () => {
    const count = await database.fileAnalysis.count({ where: { userId: employee.id } });
    await start({ database: { user: database.user, disclaimerAcknowledgement: database.disclaimerAcknowledgement,
      fileAnalysis: { create: async () => { throw new Error('FILE_CONTENT_SENTINEL SQL PRIVATE_PATH'); } } } });
    const response = await submit(); assert.equal(response.status, 500); assert.equal((await response.json()).error.code, 'INTERNAL_ERROR');
    assert.equal(await database.fileAnalysis.count({ where: { userId: employee.id } }), count); assert.deepEqual(await fs.readdir(root), []);
  });
  await t.test('application concurrency and per-employee rate limit are enforced', async () => {
    let release; let ready; let entered = 0;
    const gate = new Promise((resolve) => { release = resolve; }); const allEntered = new Promise((resolve) => { ready = resolve; });
    await start({ fileAnalysis: { analyzer: async (file) => { entered++; if (entered === 2) ready(); await gate; return analyzer(file); } } });
    const pending = [submit(), submit()];
    let deadline;
    try { await Promise.race([allEntered, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Workers did not enter analyzer')), 5000); })]); assert.equal((await submit()).status, 503); }
    finally { clearTimeout(deadline); release(); }
    for (const response of await Promise.all(pending)) assert.equal(response.status, 201);
    await start();
    for (let i = 0; i < FILE_LIMITS.submissionsPerMinute; i++) assert.equal((await submit(new FormData())).status, 400);
    assert.equal((await submit()).status, 429); assert.equal((await submit(undefined, token(other))).status, 403);
  });
  await t.test('logout and no download/history route', async () => {
    await start(); assert.equal((await fetch(`${base}/api/analysis/file/${randomUUID()}`, { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await post('/api/auth/logout', {})).status, 204); assert.equal((await submit(undefined, null)).status, 401);
  });
  assert.doesNotMatch(logs.join('\n'), /FILE_CONTENT_SENTINEL|SECRET_FILENAME|FILE_API_KEY_SENTINEL|RAW_PROVIDER_SENTINEL/);
});
