import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl } from '../src/config/env.js';
import { submitHashAnalysis, hashLookupReceipt } from '../src/analyzers/file/hash-analysis.js';
import { submitOnce } from '../src/analyzers/submission-idempotency.js';
import { analysisOverview } from '../src/analytics/analysis-analytics.js';
import { securityPeriod } from '../src/analytics/security-analytics.js';

test('hash checks persist across severities and count in admin statistics without duplicate retries', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient();
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      firstName: 'Synthetic',
      lastName: 'Hash',
      role: { connect: { name: 'EMPLOYEE' } },
    },
  });
  t.after(async () => {
    try {
      await db.fileAnalysis.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    } finally {
      await db.$disconnect();
    }
  });
  const range = securityPeriod({ period: 'custom', start: '2094-03-01', end: '2094-03-02' });
  const date = new Date('2094-03-01T12:00:00Z');
  let calls = 0;
  const ids = [];
  for (const [index, maliciousCount, expected] of [
    [0, 0, 'LOW'],
    [1, 2, 'MEDIUM'],
    [2, 15, 'HIGH'],
    [3, null, 'LOW'],
  ]) {
    const sha256 = String(index).repeat(64),
      key = randomUUID();
    const options = {
      type: 'FILE_HASH',
      key,
      userId: user.id,
      payload: sha256,
      secret: 'synthetic-hash-test-secret',
      onReplay: hashLookupReceipt,
    };
    const provider = {
      lookupFileHash: async () => {
        calls++;
        return maliciousCount === null
          ? { provider: 'VIRUSTOTAL', scope: 'FILE_HASH', status: 'NO_REPORT' }
          : {
              provider: 'VIRUSTOTAL',
              scope: 'FILE_HASH',
              status: 'AVAILABLE',
              maliciousCount,
              suspiciousCount: 0,
              harmlessCount: 0,
              undetectedCount: 60 - maliciousCount,
              lastAnalysisDate: new Date().toISOString(),
            };
      },
    };
    const run = () =>
      submitOnce(db, options, (store) => submitHashAnalysis(store, { userId: user.id, sha256 }, provider));
    const first = await run();
    assert.equal(first.risk.riskLevel, expected);
    assert.deepEqual(await run(), first);
    assert.equal(calls, index + 1);
    ids.push(first.analysisId);
    await db.fileAnalysis.update({ where: { id: first.analysisId }, data: { analyzedAt: date } });
  }
  const stats = await analysisOverview(db, range);
  assert.equal(stats.total, 4);
  assert.deepEqual(
    stats.byType.map(({ count }) => count),
    [0, 0, 0, 4],
  );
  assert.deepEqual(
    stats.severity.map(({ count }) => count),
    [2, 1, 1, 0],
  );
  assert.deepEqual(
    stats.daily.map(({ count }) => count),
    [4, 0],
  );
  assert.equal(stats.recent.length, 4);
  for (const row of stats.recent) {
    assert.equal(row.type, 'FILE_HASH');
    assert.equal(row.userId, user.id);
    assert.ok(ids.includes(row.id));
    assert.equal(row.incidentId, null);
  }
  assert.doesNotMatch(JSON.stringify(stats), /sha256|submissionDigest|threatIntelligence/);
  assert.equal(await db.incident.count({ where: { reporterId: user.id } }), 0);
});
