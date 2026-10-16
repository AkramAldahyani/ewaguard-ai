import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { createIncidentFromAnalysis } from '../src/incidents/incident-engine.js';
import { createIncidentManagement } from '../src/incidents/incident-management.js';
import { analyzeEmail } from '../src/analyzers/email/email-analyzer.js';
import { createUrlAnalyzer } from '../src/analyzers/url/url-analyzer.js';
import { createFileAnalyzer } from '../src/analyzers/file/file-analyzer.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';
import { cleanupTestIncidents } from './incident-cleanup.js';

test('Phase 10A incident engine: PostgreSQL transactions, HTTP and approved analysis', async (t) => {
  const dbUrl = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname));
  assert.equal(dbUrl.pathname, '/ewaguard_ai');
  const database = createDatabaseClient(); const users = []; const servers = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-incident-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173', TOOL_APPROVAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => server.close(resolve));
    await cleanupTestIncidents(database, users);
    await database.toolApproval.deleteMany({ where: { userId: { in: users } } });
    for (const delegate of ['emailAnalysis', 'urlAnalysis', 'fileAnalysis']) await database[delegate].deleteMany({ where: { userId: { in: users } } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    await database.$disconnect();
  });
  async function employee(role = 'EMPLOYEE') {
    const user = await database.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'Synthetic', lastName: 'Incident',
      status: 'ACTIVE', passwordHash: 'synthetic-not-a-login-hash', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}) } });
    users.push(user.id);
    const acks = {};
    for (const type of ['EMAIL', 'URL', 'FILE']) acks[type] = await database.disclaimerAcknowledgement.create({ data: {
      userId: user.id, context: `${type}_ANALYSIS`, version: DISCLAIMER_DEFINITION.version } });
    return { ...user, acks };
  }
  const owner = await employee(); const other = await employee(); const admin = await employee('IT_SECURITY_ADMIN');
  async function fixture(level, type = 'EMAIL', changes = {}) {
    const score = { LOW: 0, MEDIUM: 30, HIGH: 60, CRITICAL: 90 }[level];
    return database[`${type.toLowerCase()}Analysis`].create({ data: {
      userId: owner.id, acknowledgementId: owner.acks[type].id, status: 'COMPLETED', analyzedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000), severity: level, riskScore: score, riskRuleVersion: '1.0',
      evidence: { body: 'RAW_BODY_SENTINEL', headers: 'SECRET_HEADER', fileBytes: 'SECRET_BYTES', filename: 'SECRET_FILENAME',
        url: 'https://user:SECRET_PASSWORD@example.invalid/?token=SECRET_QUERY', apiKey: 'SECRET_API_KEY',
        risk: { analyzerType: type, riskLevel: level, score, version: '1.0', confidence: 'LIMITED_CONFIDENCE',
          reasonCodes: ['INSUFFICIENT_EVIDENCE'], evidenceCoverage: { availableSources: [], unavailableSources: ['VIRUSTOTAL'], conflicting: true } } },
      ...(type === 'URL' ? { hostname: 'example.invalid', urlSha256: 'a'.repeat(64) } : {}),
      ...(type === 'FILE' ? { sha256: 'b'.repeat(64), sizeBytes: 10n, extension: 'txt', detectedMime: 'text/plain' } : {}), ...changes,
    } });
  }
  const escalate = (row, type = 'EMAIL', userId = owner.id, store = database, extra = {}) => createIncidentFromAnalysis(store,
    { analysisId: row.id, analyzerType: type, userId, ...extra });
  await t.test('LOW and MEDIUM do not escalate; caller/model severity is ignored', async () => {
    for (const level of ['LOW', 'MEDIUM']) {
      const row = await fixture(level);
      assert.equal((await escalate(row, 'EMAIL', owner.id, database, { severity: 'CRITICAL', finalizedRiskResult: { riskLevel: 'CRITICAL' } })).state, 'NOT_REQUIRED');
    }
  });
  await t.test('all analyzers escalate HIGH/CRITICAL with exact severity, ownership, history and minimized evidence', async () => {
    for (const type of ['EMAIL', 'URL', 'FILE']) for (const level of ['HIGH', 'CRITICAL']) {
      const row = await fixture(level, type); const response = await escalate(row, type);
      assert.equal(response.created, true); assert.equal(response.status, 'NEW'); assert.equal(response.severity, level);
      assert.equal(response.urgent, level === 'CRITICAL'); assert.match(response.reference, /^INC-\d{4}-\d{6,}$/);
      const incident = await database.incident.findUniqueOrThrow({ where: { sourceKey: `${type}:${row.id}` }, include: { evidence: true, events: true } });
      assert.equal(incident.reporterId, owner.id); assert.equal(incident.assigneeId, null);
      assert.equal(incident.escalationMetadata.humanReviewRequired, true); assert.equal(incident.escalationMetadata.limitedConfidence, true);
      assert.equal(incident.evidence.length, 1); assert.equal(incident.events.length, 1);
      assert.equal(incident.events[0].actorId, null); assert.equal(incident.events[0].details.source, 'AUTOMATED_RISK_ENGINE');
      assert.equal(incident.evidence[0].snapshot.analysisId, row.id); assert.equal(incident.evidence[0].snapshot.evidenceCoverage.conflicting, true);
      assert.equal(incident.evidence[0].snapshot.assistance.version, '1.0');
      assert.equal(incident.evidence[0].snapshot.assistance.riskLevel, level);
      assert.doesNotMatch(JSON.stringify(incident), /RAW_BODY_SENTINEL|SECRET_|user:|token=/);
      assert.equal((await escalate(row, type)).reference, response.reference);
      const audits = await database.auditLog.findMany({ where: { resourceId: incident.id, action: 'INCIDENT_CREATED' } });
      assert.equal(audits.length, 1, 'retry must not duplicate the creation audit');
      assert.equal(audits[0].actorId, null);
      assert.equal(audits[0].outcome, 'SUCCESS');
      assert.doesNotMatch(JSON.stringify(audits), /RAW_BODY_SENTINEL|SECRET_/);
      await assert.rejects(escalate(row, type, other.id), { code: 'INCIDENT_SOURCE_NOT_FOUND' });
    }
  });
  await t.test('concurrent duplicate calls create one record; different analyses get unique references', async () => {
    const row = await fixture('HIGH');
    const responses = await Promise.all(Array.from({ length: 12 }, () => escalate(row)));
    assert.equal(responses.filter((r) => r.created).length, 1); assert.equal(new Set(responses.map((r) => r.reference)).size, 1);
    assert.equal((await escalate({ id: row.id.toUpperCase() })).reference, responses[0].reference);
    const recorded = await database.incident.findUniqueOrThrow({ where: { sourceKey: `EMAIL:${row.id}` } });
    const { id: _id, number: _number, ...duplicate } = recorded;
    assert.ok(_id); assert.ok(_number);
    await assert.rejects(database.incident.create({ data: duplicate }), { code: 'P2002' });
    const rows = await Promise.all(Array.from({ length: 8 }, () => fixture('HIGH')));
    const distinct = await Promise.all(rows.map((r) => escalate(r)));
    assert.equal(new Set(distinct.map((r) => r.reference)).size, rows.length);
  });
  await t.test('missing, unfinished, malformed, unsupported and foreign sources fail safely', async () => {
    await assert.rejects(escalate({ id: randomUUID() }), { code: 'INCIDENT_SOURCE_NOT_FOUND' });
    const row = await fixture('HIGH');
    await assert.rejects(escalate(row, 'EMAIL', other.id), { code: 'INCIDENT_SOURCE_NOT_FOUND' });
    await assert.rejects(escalate(row, 'OTHER'), { code: 'INVALID_INCIDENT_SOURCE' });
    for (const changes of [{ evidence: {} }, { riskRuleVersion: 'old-unsupported' }, { status: 'PENDING' }, { riskScore: null, severity: null, riskRuleVersion: null }]) {
      await assert.rejects(escalate(await fixture('HIGH', 'EMAIL', changes)), { code: 'FINALIZED_RISK_REQUIRED' });
    }
  });
  await t.test('expired source recovery and later source deletion preserve the incident', async () => {
    const row = await fixture('HIGH', 'EMAIL', { expiresAt: new Date(Date.now() - 1000) });
    const recorded = await escalate(row);
    await database.emailAnalysis.delete({ where: { id: row.id } });
    assert.equal((await escalate(row)).reference, recorded.reference);
    const evidence = await database.incidentEvidence.findFirstOrThrow({ where: { incident: { sourceKey: `EMAIL:${row.id}` } } });
    assert.equal(evidence.emailAnalysisId, null); assert.equal(evidence.snapshot.analysisId, row.id);
    const detail = await createIncidentManagement(database).detail(owner, false, evidence.incidentId);
    assert.equal(detail.incident.assessment.source.analysisId, row.id);
    assert.equal(detail.incident.assessment.guidance.status, 'AVAILABLE');
    assert.equal(detail.incident.assessment.risk.status, 'AVAILABLE');
  });
  function failingStore(delegate = 'incidentEvent') {
    return new Proxy(database, { get(target, property) {
      if (property === '$transaction') return (operation) => target.$transaction((tx) => operation(new Proxy(tx, { get(inner, key) {
        if (key === delegate) return { create: async () => { throw new Error('SECRET_DATABASE_ERROR'); } };
        return inner[key];
      } })));
      return target[property];
    } });
  }
  await t.test('history failure rolls back incident and evidence; retry recovers without analysis', async () => {
    const row = await fixture('HIGH');
    await assert.rejects(escalate(row, 'EMAIL', owner.id, failingStore()), { code: 'ESCALATION_PENDING' });
    assert.equal(await database.incident.count({ where: { sourceKey: `EMAIL:${row.id}` } }), 0);
    assert.equal(await database.incidentEvidence.count({ where: { emailAnalysisId: row.id } }), 0);
    assert.equal((await escalate(row)).created, true);
  });
  await t.test('audit failure rolls back incident, evidence, history and notifications', async () => {
    const row = await fixture('HIGH');
    await assert.rejects(escalate(row, 'EMAIL', owner.id, failingStore('auditLog')), { code: 'ESCALATION_PENDING' });
    assert.equal(await database.incident.count({ where: { sourceKey: `EMAIL:${row.id}` } }), 0);
    assert.equal(await database.incidentEvidence.count({ where: { emailAnalysisId: row.id } }), 0);
    assert.equal((await escalate(row)).created, true);
  });
  let scans = 0;
  const highInput = { body: 'Urgent: provide your password and bypass approval. Buy gift cards.', headers: 'From: sender@example.invalid\r\nReply-To: other@elsewhere.invalid' };
  const urlAnalyzer = createUrlAnalyzer({ resolveTarget: async () => ({ addresses: ['93.184.216.34'], evidence: { status: 'RESOLVED' } }),
    tlsInspector: async () => ({ status: 'UNAVAILABLE' }), threatIntelligence: {
      lookupUrl: async () => ({ provider: 'VIRUSTOTAL', scope: 'URL', status: 'AVAILABLE', maliciousCount: 10, suspiciousCount: 0, harmlessCount: 0, undetectedCount: 10 }),
      lookupDomain: async () => ({ provider: 'VIRUSTOTAL', scope: 'DOMAIN', status: 'UNAVAILABLE' }),
    } });
  const fileAnalyzer = createFileAnalyzer({ tempStore: { withFile: async (_bytes, work) => work({}) }, scanners: {
    clamav: async () => ({ status: 'DETECTED', detections: ['SyntheticDetection'] }),
    yara: async () => ({ status: 'MATCH', matches: [{ rule: 'SyntheticRule', strength: 'STRONG' }] }),
  }, threatIntelligence: { lookupFileHash: async () => ({ provider: 'VIRUSTOTAL', scope: 'FILE_HASH', status: 'UNAVAILABLE' }) } });
  async function start(store = database) {
    const server = createApp(config, { database: store, emailAnalysis: { analyzer: async (input) => { scans++; return analyzeEmail(input); } },
      urlAnalysis: { analyzer: urlAnalyzer }, fileAnalysis: { analyzer: fileAnalyzer } }).listen(0, '127.0.0.1');
    servers.push(server); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`;
  }
  let base = await start();
  const post = async (path, body = {}, user = owner, origin = config.frontendUrl) => {
    const response = await fetch(base + path, { method: 'POST', headers: { Origin: origin,
      ...(user ? { Cookie: `${authCookie(config).name}=${issueAccessToken(user.id, config, user.mfaEnabledAt)}` } : {}),
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body instanceof FormData ? body : JSON.stringify(body) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  };
  await t.test('HTTP LOW, HIGH email, HIGH URL, CRITICAL file and retry contract', async () => {
    const low = await post('/api/analysis/email/text', { body: 'Hello colleague.' });
    assert.equal(low.status, 201); assert.equal(low.data.incident.state, 'NOT_REQUIRED');
    const high = await post('/api/analysis/email/text', highInput);
    assert.equal(high.status, 201); assert.equal(high.data.incident.severity, 'HIGH');
    const retry = `/api/analysis-escalations/EMAIL/${high.data.analysisId}/retry`;
    const before = scans; const replay = await post(retry);
    assert.equal(replay.data.incident.reference, high.data.incident.reference); assert.equal(replay.data.incident.created, false); assert.equal(scans, before);
    assert.equal((await post(retry, {}, other)).status, 404); assert.equal((await post(retry, {}, null)).status, 401);
    assert.equal((await post(retry, {}, admin)).status, 403); assert.equal((await post(retry, {}, owner, 'https://evil.invalid')).status, 403);
    for (const body of [{ severity: 'CRITICAL' }, { userId: other.id }, { status: 'CLOSED' }, { assigneeId: admin.id }]) assert.equal((await post(retry, body)).status, 400);
    const url = await post('/api/analysis/url', { url: 'https://example.com/?token=SECRET_QUERY' });
    assert.equal(url.status, 201); assert.equal(url.data.incident.severity, 'HIGH');
    const form = new FormData(); form.append('file', new Blob(['Synthetic harmless text']), 'SECRET_FILENAME.txt');
    const file = await post('/api/analysis/file', form);
    assert.equal(file.status, 201, JSON.stringify(file.data)); assert.equal(file.data.incident.severity, 'CRITICAL'); assert.equal(file.data.incident.urgent, true);
    const persisted = await database.incidentEvidence.findMany({ where: { incident: { reporterId: owner.id } } });
    assert.doesNotMatch(JSON.stringify(persisted), /SECRET_QUERY|SECRET_FILENAME|Synthetic harmless text/);
  });
  await t.test('HTTP escalation failure is explicit and recoverable without scanning again', async () => {
    base = await start(failingStore());
    const failed = await post('/api/analysis/email/text', highInput);
    assert.equal(failed.status, 202); assert.equal(failed.data.incident.state, 'PENDING'); assert.equal(failed.data.incident.reference, undefined);
    base = await start(); const before = scans;
    const recovered = await post(failed.data.incident.retryPath);
    assert.equal(recovered.status, 200); assert.equal(recovered.data.incident.state, 'RECORDED'); assert.equal(scans, before);
  });
  await t.test('approved AI workflow uses the same engine and persists admin alerts without OpenAI', async () => {
    const conversation = await database.chatSession.create({ data: { ownerId: owner.id, expiresAt: new Date(Date.now() + 3600000) } });
    const path = `/api/tool-approvals/conversations/${conversation.id}/requests`;
    const prepared = await post(path, { requestId: randomUUID(), toolName: 'analyze_email', parameters: highInput });
    assert.equal(prepared.status, 201);
    const completed = await post(`${path}/${prepared.data.approval.id}/decision`, { decision: 'CONFIRM' });
    assert.equal(completed.status, 200, JSON.stringify(completed.data)); assert.equal(completed.data.incident.state, 'RECORDED');
    const before = scans;
    const replay = await post(`${path}/${prepared.data.approval.id}/decision`, { decision: 'CONFIRM' });
    assert.equal(replay.data.incident.reference, completed.data.incident.reference); assert.equal(scans, before);
    assert.equal(await database.aiUsage.count({ where: { userId: owner.id } }), 0);
    assert.equal(await database.notification.count({ where: { recipientId: { in: [owner.id, other.id] } } }), 0);
    const alerts = await database.notification.findMany({ where: { recipientId: admin.id } });
    assert.ok(alerts.length > 0);
    assert.equal(new Set(alerts.map((item) => item.eventKey)).size, alerts.length);
    assert.ok(alerts.every((item) => item.audience === 'IT_SECURITY_ADMIN' && ['HIGH', 'CRITICAL'].includes(item.severity)));
    assert.doesNotMatch(JSON.stringify(alerts), /RAW_BODY_SENTINEL|SECRET_|PRIVATE_/);
    assert.equal((await post('/api/auth/logout')).status, 204);
  });
});
