// Opt-in smoke test of the running local application. Uses a disposable employee
// and benign example.com only. Not part of the normal (mock-provider) test suite.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { hashPassword } from '../src/auth/auth-service.js';

const config = parseConfig();
const url = new URL(databaseUrl());
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
assert.equal(url.pathname, '/ewaguard_ai');
assert.equal(config.nodeEnv, 'development');
const database = createDatabaseClient();
let employee;
try {
  const role = await database.role.findUniqueOrThrow({ where: { name: 'EMPLOYEE' } });
  const password = `Smoke-${randomUUID()}!`;
  employee = await database.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'URL', lastName: 'Smoke',
    status: 'ACTIVE', roleId: role.id, passwordHash: await hashPassword(password) } });
  let cookie;
  const post = (path, body) => fetch(`http://127.0.0.1:${config.port}${path}`, { method: 'POST', headers: {
    Origin: config.frontendUrl, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
  }, body: JSON.stringify(body) });
  const login = await post('/api/auth/login', { email: employee.email, password });
  assert.equal(login.status, 200); cookie = login.headers.getSetCookie()[0].split(';')[0];
  assert.equal((await post('/api/disclaimers/acknowledge', { context: 'URL_ANALYSIS' })).status, 201);
  const benign = await post('/api/analysis/url', { url: 'https://example.com/' });
  assert.equal(benign.status, 201);
  const analysis = await benign.json();
  assert.equal(analysis.result.analyzer, 'URL');
  const row = await database.urlAnalysis.findUniqueOrThrow({ where: { id: analysis.analysisId } });
  assert.equal(row.userId, employee.id); assert.equal(row.riskScore, analysis.result.risk.score); assert.equal(row.severity, analysis.result.risk.riskLevel);
  for (const input of ['malformed', 'http://127.0.0.1/', 'https://localhost/']) assert.equal((await post('/api/analysis/url', { url: input })).status, 400);
  const minimized = await post('/api/analysis/url', { url: 'https://example.com/login?token=SMOKE_SECRET_VALUE' });
  assert.equal(minimized.status, 201);
  const projection = await minimized.json();
  const stored = await database.urlAnalysis.findUniqueOrThrow({ where: { id: projection.analysisId } });
  assert.doesNotMatch(JSON.stringify({ projection, stored }), /SMOKE_SECRET_VALUE/);
  assert.equal((await post('/api/auth/logout', {})).status, 204); cookie = null;
  assert.equal((await post('/api/analysis/url', { url: 'https://example.com/' })).status, 401);
  console.info(JSON.stringify({ login: 'PASS', benignAnalysis: 'PASS', malformedAndPrivateRejection: 'PASS', minimizedPersistence: 'PASS', logout: 'PASS',
    dns: analysis.result.dnsEvidence.status, tls: analysis.result.tlsEvidence.status,
    providers: analysis.result.threatIntelligence.map(({ scope, status }) => ({ scope, status })) }));
} finally {
  if (employee) {
    await database.urlAnalysis.deleteMany({ where: { userId: employee.id } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: employee.id } });
    await database.user.delete({ where: { id: employee.id } });
  }
  await database.$disconnect();
}
