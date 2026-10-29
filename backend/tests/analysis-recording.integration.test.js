import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl } from '../src/config/env.js';
import { submitOnce } from '../src/analyzers/submission-idempotency.js';
import { analysisOverview } from '../src/analytics/analysis-analytics.js';
import { securityPeriod } from '../src/analytics/security-analytics.js';
import { completeAnalysisEscalation } from '../src/incidents/incident-engine.js';
import { cleanupTestIncidents } from './incident-cleanup.js';

test('analysis records, retry uniqueness and PostgreSQL analytics across all severities', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient();
  const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'Synthetic', lastName: 'Analysis', role: { connect: { name: 'EMPLOYEE' } } } });
  t.after(async () => {
    try {
      await cleanupTestIncidents(db, [user.id]);
      for (const model of ['emailAnalysis', 'urlAnalysis', 'fileAnalysis']) await db[model].deleteMany({ where: { userId: user.id } });
      await db.disclaimerAcknowledgement.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    } finally { await db.$disconnect(); }
  });
  const ack = await db.disclaimerAcknowledgement.create({ data: { userId: user.id, context: 'EMAIL_ANALYSIS', version: 'synthetic-test' } });
  const date = new Date('2093-02-01T12:00:00Z');
  const range = securityPeriod({ period: 'custom', start: '2093-02-01', end: '2093-02-02' });
  const secret = 'synthetic-test-secret-not-production';
  let calls = 0;
  function submission(type, severity, key = randomUUID(), payload = 'synthetic input') {
    const score = { LOW: 0, MEDIUM: 30, HIGH: 60, CRITICAL: 90 }[severity];
    return submitOnce(db, { type, key, payload, userId: user.id, secret }, async (store) => {
      calls++;
      const row = await store[`${type.toLowerCase()}Analysis`].create({ data: {
        userId: user.id, acknowledgementId: ack.id, status: 'COMPLETED', severity, riskScore: score,
        analyzedAt: date, expiresAt: new Date('2093-03-01T00:00:00Z'), riskRuleVersion: '1.0',
        evidence: { risk: { analyzerType: type, riskLevel: severity, score, version: '1.0', confidence: 'LIMITED_CONFIDENCE',
          reasonCodes: ['INSUFFICIENT_EVIDENCE'], evidenceCoverage: { availableSources: [], unavailableSources: ['VIRUSTOTAL'], conflicting: false } } },
        ...(type === 'URL' ? { hostname: 'example.invalid', urlSha256: 'a'.repeat(64) } : {}),
        ...(type === 'FILE' ? { sha256: 'b'.repeat(64), sizeBytes: 5n, extension: 'txt', detectedMime: 'text/plain' } : {}),
      } });
      return { analysisId: row.id, incident: await completeAnalysisEscalation(db, { userId: user.id, analyzerType: type, analysisId: row.id }) };
    });
  }
  await t.test('all four severities persist for all three analyzers; only high and critical escalate', async () => {
    for (const type of ['EMAIL', 'URL', 'FILE']) for (const level of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
      const key = randomUUID();
      const first = await submission(type, level, key);
      assert.equal(first.incident.state, ['LOW', 'MEDIUM'].includes(level) ? 'NOT_REQUIRED' : 'RECORDED');
      const before = calls;
      const retry = await submission(type, level, key);
      assert.equal(retry.analysisId, first.analysisId); assert.equal(retry.replayed, true); assert.equal(calls, before);
      assert.equal(retry.severity, level);
    }
    assert.equal(await db.incident.count({ where: { reporterId: user.id } }), 6);
  });
  await t.test('database aggregation agrees across totals, daily series, types, severity and incident links', async () => {
    const result = await analysisOverview(db, range);
    assert.equal(result.total, 12);
    assert.deepEqual(result.severity.map((r) => r.count), [3, 3, 3, 3]);
    assert.deepEqual(result.byType.map((r) => r.count), [4, 4, 4, 0]);
    assert.deepEqual(result.daily.map((r) => r.count), [12, 0]);
    assert.equal(result.recent.filter((r) => r.incidentId).length, 6);
    for (const row of result.recent) {
      assert.equal(row.userId, user.id);
      assert.equal(row.submittedBy.id, user.id);
      assert.equal(row.submittedBy.firstName, 'Synthetic');
    }
    assert.doesNotMatch(JSON.stringify(result), /synthetic input|submissionDigest|hostname|sha256|evidence|passwordHash|email/);
    assert.equal((await analysisOverview(db, securityPeriod({ period: 'custom', start: '2093-02-02', end: '2093-02-02' }))).total, 0);
  });
  await t.test('concurrent submissions use primary-key uniqueness and different keys remain separate', async () => {
    const key = randomUUID();
    const results = await Promise.all([submission('URL', 'LOW', key), submission('URL', 'LOW', key)]);
    assert.equal(new Set(results.map((r) => r.analysisId)).size, 1);
    await assert.rejects(submission('URL', 'LOW', key, 'different content'), { code: 'SUBMISSION_KEY_CONFLICT' });
    await assert.rejects(submission('URL', 'LOW', 'bad-key'), { code: 'INVALID_SUBMISSION_KEY' });
    assert.notEqual((await submission('URL', 'LOW')).analysisId, results[0].analysisId);
  });
  await t.test('unclassified and failed records never become low; recent preview is bounded', async () => {
    await db.urlAnalysis.createMany({ data: [
      ...Array.from({ length: 22 }, () => ({ status: 'COMPLETED', severity: 'LOW', riskScore: 0, riskRuleVersion: '1.0' })),
      { status: 'COMPLETED', severity: null, riskScore: null }, { status: 'ERROR', severity: null, riskScore: null },
    ].map((fields) => ({ ...fields, userId: user.id, analyzedAt: date, hostname: 'example.invalid', urlSha256: 'a'.repeat(64), expiresAt: date })) });
    const result = await analysisOverview(db, range);
    assert.equal(result.unclassified, 1); assert.equal(result.failed, 1); assert.equal(result.total, 36);
    assert.equal(result.recent.length, 20);
  });
  await t.test('failed work saves no completed result and the same submission key can recover', async () => {
    const key = randomUUID();
    const before = await db.urlAnalysis.count({ where: { userId: user.id } });
    await assert.rejects(submitOnce(db, { key, userId: user.id, type: 'URL', payload: 'synthetic input', secret }, async () => { throw new Error('synthetic failure'); }));
    assert.equal(await db.urlAnalysis.count({ where: { userId: user.id } }), before);
    await submission('URL', 'LOW', key);
    assert.equal(await db.urlAnalysis.count({ where: { userId: user.id } }), before + 1);
  });
});
