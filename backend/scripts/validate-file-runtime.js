// Explicit opt-in smoke test against the running local development application.
// Creates/removes one synthetic employee; sends one harmless file's HASH to VT.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { hashPassword } from '../src/auth/auth-service.js';
import { FILE_MAX_BYTES, FILE_TEMP_ROOT } from '../src/analyzers/file/file-policy.js';

const config = parseConfig(); const url = new URL(databaseUrl());
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai'); assert.equal(config.nodeEnv, 'development');
const database = createDatabaseClient(); let employee;
const before = (await readdir(FILE_TEMP_ROOT)).sort();
try {
  const password = `Smoke-${randomUUID()}!`;
  const role = await database.role.findUniqueOrThrow({ where: { name: 'EMPLOYEE' } });
  employee = await database.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'File', lastName: 'Smoke',
    status: 'ACTIVE', roleId: role.id, passwordHash: await hashPassword(password) } });
  let cookie;
  const post = (route, body) => fetch(`http://127.0.0.1:${config.port}${route}`, { method: 'POST', headers: {
    Origin: config.frontendUrl, ...(cookie ? { Cookie: cookie } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
  }, body: body instanceof FormData ? body : JSON.stringify(body) });
  const form = (bytes) => { const body = new FormData(); body.append('file', new Blob([bytes], { type: 'text/plain' }), 'PRIVATE_SMOKE_NAME.txt'); return body; };
  const login = await post('/api/auth/login', { email: employee.email, password }); assert.equal(login.status, 200);
  cookie = login.headers.getSetCookie()[0].split(';')[0];
  assert.equal((await post('/api/disclaimers/acknowledge', { context: 'FILE_ANALYSIS' })).status, 201);
  const bytes = 'EWAGuard harmless file analyzer verification.\n';
  const response = await post('/api/analysis/file', form(bytes)); assert.equal(response.status, 201);
  const analysis = await response.json(); const r = analysis.result;
  assert.equal(r.clamav.status, 'CLEAN'); assert.equal(r.yara.status, 'NO_MATCH');
  assert.ok(config.virusTotalApiKey ? ['AVAILABLE', 'NO_REPORT'].includes(r.threatIntelligence.status) : r.threatIntelligence.status === 'NOT_CONFIGURED');
  const row = await database.fileAnalysis.findUniqueOrThrow({ where: { id: analysis.analysisId } });
  assert.equal(row.userId, employee.id); assert.equal(row.storageKey, null); assert.ok(row.deletedAt); assert.equal(row.riskScore, r.risk.score); assert.equal(row.severity, r.risk.riskLevel);
  const serialized = JSON.stringify({ ...row, sizeBytes: Number(row.sizeBytes) });
  assert.ok(!serialized.includes(bytes)); assert.ok(!serialized.includes('PRIVATE_SMOKE_NAME'));
  assert.ok(!config.virusTotalApiKey || !serialized.includes(config.virusTotalApiKey));
  assert.equal((await post('/api/analysis/file', form(Buffer.alloc(FILE_MAX_BYTES + 1)))).status, 413);
  assert.deepEqual((await readdir(FILE_TEMP_ROOT)).sort(), before);
  assert.equal((await post('/api/auth/logout', {})).status, 204); cookie = null;
  assert.equal((await post('/api/analysis/file', form(bytes))).status, 401);
  console.info(JSON.stringify({ employeeLogin: 'PASS', acknowledgement: 'PASS', benignAnalysis: 'PASS', clamav: r.clamav.status, yara: r.yara.status,
    hashReputation: r.threatIntelligence.status, oversizedRejection: 'PASS', minimizedPersistence: 'PASS', temporaryCleanup: 'PASS', logout: 'PASS', fileUploadedToVirusTotal: false }));
} finally {
  if (employee) {
    await database.fileAnalysis.deleteMany({ where: { userId: employee.id } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: employee.id } });
    await database.user.delete({ where: { id: employee.id } });
  }
  await database.$disconnect();
}
