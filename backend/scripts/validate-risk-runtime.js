// Opt-in live smoke against the running local app. Uses synthetic email/text and
// example.com. Existing analyzers may query approved reputation providers.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { hashPassword } from '../src/auth/auth-service.js';
import { evaluateRisk } from '../src/risk/risk-engine.js';
import { buildIncidentAssistance } from '../src/assistance/incident-assistance.js';

const config = parseConfig();
const target = new URL(databaseUrl());
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.equal(target.pathname, '/ewaguard_ai');
assert.equal(config.nodeEnv, 'development');
const database = createDatabaseClient();
let employee;
try {
  const incidentsBefore = await database.incident.count();
  const password = `Smoke-${randomUUID()}!`;
  const role = await database.role.findUniqueOrThrow({ where: { name: 'EMPLOYEE' } });
  employee = await database.user.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      firstName: 'Risk',
      lastName: 'Smoke',
      status: 'ACTIVE',
      roleId: role.id,
      passwordHash: await hashPassword(password),
    },
  });
  let cookie;
  const post = (route, body) =>
    fetch(`http://127.0.0.1:${config.port}${route}`, {
      method: 'POST',
      headers: {
        Origin: config.frontendUrl,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  const login = await post('/api/auth/login', { email: employee.email, password });
  assert.equal(login.status, 200);
  cookie = login.headers.getSetCookie()[0].split(';')[0];
  const summaries = [];
  async function analyze(type, route, body, expected) {
    const ack = await post('/api/disclaimers/acknowledge', { context: `${type}_ANALYSIS` });
    assert.ok([200, 201].includes(ack.status));
    const response = await post(route, body);
    assert.equal(response.status, 201);
    const { analysisId, result } = await response.json();
    const r = result.risk;
    assert.deepEqual(r, evaluateRisk({ analyzerType: type, evidence: result, evaluatedAt: r.evaluatedAt }));
    if (expected) assert.equal(r.riskLevel, expected);
    assert.ok(result.provisionalClassification);
    const model = { EMAIL: database.emailAnalysis, URL: database.urlAnalysis, FILE: database.fileAnalysis }[type];
    const row = await model.findUniqueOrThrow({ where: { id: analysisId } });
    assert.equal(row.userId, employee.id);
    assert.equal(row.riskScore, r.score);
    assert.equal(row.severity, r.riskLevel);
    assert.equal(row.riskRuleVersion, r.version);
    assert.equal(row.evidence.risk.confidence, r.confidence);
    assert.equal(row.evidence.risk.evaluatedAt, r.evaluatedAt);
    const codes = row.evidence.risk.reasonCodes ?? row.evidence.risk.reasons.map(({ code }) => code);
    assert.deepEqual(
      codes,
      r.reasons.map(({ code }) => code),
    );
    assert.equal(row.evidence.assistance, undefined);
    assert.deepEqual(
      result.assistance,
      buildIncidentAssistance({ analyzerType: type, riskResult: row.evidence.risk, version: '1.0' }),
    );
    assert.equal(await database.incident.count({ where: { reporterId: employee.id } }), 0);
    summaries.push({
      type,
      finding: result.provisionalClassification,
      score: r.score,
      riskLevel: r.riskLevel,
      confidence: r.confidence,
      urgency: result.assistance.urgency,
      escalation: result.assistance.escalationRecommendation.level,
      ...(type === 'FILE'
        ? { clamav: result.clamav.status, yara: result.yara.status, provider: result.threatIntelligence.status }
        : {}),
      ...(type === 'URL'
        ? {
            dns: result.dnsEvidence.status,
            tls: result.tlsEvidence.status,
            providers: result.threatIntelligence.map(({ status }) => status),
          }
        : {}),
    });
  }
  await analyze(
    'EMAIL',
    '/api/analysis/email/text',
    { body: 'The meeting agenda is ready. Thank you.', headers: 'From: colleague@example.invalid' },
    'LOW',
  );
  await analyze(
    'EMAIL',
    '/api/analysis/email/text',
    {
      body: 'Please provide your password.',
      headers: 'From: colleague@example.invalid\r\nReply-To: stranger@elsewhere.invalid',
    },
    'HIGH',
  );
  await analyze('URL', '/api/analysis/url', { url: 'https://example.com/' });
  const form = new FormData();
  form.append(
    'file',
    new Blob(['Harmless EWAGuard risk verification text.\n'], { type: 'text/plain' }),
    'synthetic.txt',
  );
  await analyze('FILE', '/api/analysis/file', form);
  assert.equal((await post('/api/auth/logout', {})).status, 204);
  cookie = null;
  assert.equal((await post('/api/analysis/email/text', { body: 'Hello' })).status, 401);
  assert.equal(await database.incident.count(), incidentsBefore);
  console.info(
    JSON.stringify({
      employeeLogin: 'PASS',
      results: summaries,
      persistedRisk: 'PASS',
      derivedAssistance: 'PASS',
      noIncidentCreated: 'PASS',
      logout: 'PASS',
    }),
  );
} finally {
  if (employee) {
    for (const model of [database.emailAnalysis, database.urlAnalysis, database.fileAnalysis])
      await model.deleteMany({ where: { userId: employee.id } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: employee.id } });
    await database.user.delete({ where: { id: employee.id } });
  }
  await database.$disconnect();
}
