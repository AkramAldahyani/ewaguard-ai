import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { createSecurityAnalytics, securityPeriod, SecurityAnalyticsError } from '../src/analytics/security-analytics.js';

test('Phase 13B1 UTC periods reject malformed, excessive and ambiguous ranges', () => {
  const now = new Date('2026-10-11T13:00:00.000Z');
  assert.deepEqual(securityPeriod({}, now), { period: '30d', start: new Date('2026-09-12T00:00:00.000Z'),
    endExclusive: new Date('2026-10-12T00:00:00.000Z'), days: 30 });
  assert.deepEqual(securityPeriod({ period: '7d' }, now), { period: '7d', start: new Date('2026-10-05T00:00:00.000Z'),
    endExclusive: new Date('2026-10-12T00:00:00.000Z'), days: 7 });
  for (const query of [{ period: 'yesterday' }, { start: '2026-10-01' }, { period: '7d', start: '2026-10-01' },
    { period: 'custom', start: '2026-02-30', end: '2026-03-01' },
    { period: 'custom', start: '2026-10-02', end: '2026-10-01' },
    { period: 'custom', start: '2026-01-01', end: '2026-04-01' },
    { period: 'custom', start: '2026-01-01T00:00:00Z', end: '2026-01-02' },
    { period: 'custom', start: '2026-01-01' }, { period: '30d', employeeId: randomUUID() }])
    assert.throws(() => securityPeriod(query, now), SecurityAnalyticsError);
});

test('Phase 13B1 empty analytics zero-fill all chart series and bound preview', async () => {
  let take;
  const incident = { groupBy: async () => [], count: async () => 0,
    findMany: async (args) => { take = args.take; return []; } };
  let rawCall = 0;
  const db = { incident, $queryRaw: async () => ++rawCall === 2 ? [{ count: 0, averageSeconds: null }] : [] };
  db.$transaction = (operation) => operation(db);
  const result = await createSecurityAnalytics(db).overview({ period: '7d' }, new Date('2026-10-11T13:00:00Z'));
  assert.equal(result.metrics.created, 0); assert.equal(result.metrics.openCurrent, 0);
  assert.equal(result.metrics.resolution.averageSeconds, null);
  assert.equal(result.distributions.severity.length, 4);
  assert.equal(result.distributions.currentStatus.length, 6);
  assert.equal(result.dailyCreated.length, 7);
  assert.ok(result.dailyCreated.every((day) => day.count === 0));
  assert.deepEqual(result.recentCreated, []); assert.equal(take, 8);
});

test('Phase 13B1 security analytics uses authorized, bounded PostgreSQL aggregates', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(), users = [], incidents = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-analytics-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    try {
      await db.incidentEvent.deleteMany({ where: { incidentId: { in: incidents } } });
      await db.incident.deleteMany({ where: { id: { in: incidents } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    } finally { await db.$disconnect(); }
  });
  async function user(role = 'EMPLOYEE', mfa = true) {
    const row = await db.user.create({ data: { firstName: 'Synthetic', lastName: role === 'EMPLOYEE' ? 'Employee' : 'Admin',
      email: `${randomUUID()}@example.invalid`, status: 'ACTIVE', passwordHash: 'synthetic',
      role: { connect: { name: role } }, ...(role === 'IT_SECURITY_ADMIN' && mfa ?
        { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}) } });
    users.push(row.id); return row;
  }
  const admin = await user('IT_SECURITY_ADMIN'), noMfa = await user('IT_SECURITY_ADMIN', false), employee = await user();
  async function request(query = '?period=custom&start=2091-01-01&end=2091-01-03', actor = admin, origin = config.frontendUrl, tokenMfa = true) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/analytics/security${query}`, {
      headers: { Origin: origin, ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, tokenMfa ? actor.mfaEnabledAt : null)}` } : {}) } });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  await t.test('administrator RBAC, MFA, origin and period validation', async () => {
    assert.equal((await request(undefined, null)).status, 401);
    assert.equal((await request(undefined, employee)).status, 403);
    assert.equal((await request(undefined, noMfa)).status, 401);
    assert.equal((await request(undefined, admin, config.frontendUrl, false)).status, 401);
    assert.equal((await request(undefined, admin, 'https://evil.invalid')).status, 403);
    assert.equal((await request('?period=custom&start=2091-01-01&end=2091-04-30')).status, 400);
    assert.equal((await request('?period=30d&employeeId=anything')).status, 400);
  });
  async function incident({ day, severity, status, type = 'SUSPICIOUS_ACTIVITY', source = 'MANUAL_REPORT',
    assigneeId = null, resolvedAt = null }) {
    const createdAt = new Date(`2091-01-${String(day).padStart(2, '0')}T08:00:00.000Z`);
    const row = await db.incident.create({ data: { reporterId: employee.id, assigneeId, createdAt,
      title: 'PRIVATE_ANALYTICS_TITLE', description: 'PRIVATE_ANALYTICS_BODY', aiSummary: 'PRIVATE_AI_SUMMARY',
      severity, riskScore: severity === 'CRITICAL' ? 90 : severity === 'HIGH' ? 70 : 20,
      riskRuleVersion: '1.0', type, detectionSource: source, status, resolvedAt } });
    incidents.push(row.id); return row;
  }
  const first = await incident({ day: 1, severity: 'LOW', status: 'NEW', type: 'PHISHING', source: 'EMAIL_ANALYSIS' });
  await incident({ day: 2, severity: 'HIGH', status: 'UNDER_INVESTIGATION', assigneeId: admin.id,
    type: 'MALWARE', source: 'FILE_ANALYSIS' });
  const resolved = await incident({ day: 3, severity: 'CRITICAL', status: 'RESOLVED', assigneeId: admin.id,
    type: 'PHISHING', source: 'EMAIL_ANALYSIS', resolvedAt: new Date('2091-01-03T10:00:00.000Z') });
  await incident({ day: 3, severity: 'MEDIUM', status: 'FALSE_POSITIVE', resolvedAt: new Date('2091-01-03T09:00:00.000Z') });
  await incident({ day: 4, severity: 'LOW', status: 'CLOSED', resolvedAt: new Date('2091-01-04T11:00:00.000Z') });
  await t.test('creation boundaries, current distributions, resolution and minimized preview', async () => {
    const response = await request(); assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.match(response.cache, /private.*no-store/);
    const { metrics, distributions, dailyCreated, recentCreated, range } = response.data;
    assert.deepEqual(range, { period: 'custom', start: '2091-01-01', end: '2091-01-03', timezone: 'UTC', days: 3 });
    assert.deepEqual(metrics, { created: 4, high: 1, critical: 1, openCurrent: 2,
      resolvedCurrent: 1, closedCurrent: 0, falsePositiveCurrent: 1,
      assignedCurrent: 2, unassignedCurrent: 2, resolution: { eligibleCount: 1, averageSeconds: 7200 } });
    assert.deepEqual(dailyCreated, [{ day: '2091-01-01', count: 1 }, { day: '2091-01-02', count: 1 },
      { day: '2091-01-03', count: 2 }]);
    assert.equal(distributions.severity.find((row) => row.value === 'CRITICAL').count, 1);
    assert.equal(distributions.currentStatus.find((row) => row.value === 'FALSE_POSITIVE').count, 1);
    assert.equal(distributions.category.find((row) => row.value === 'PHISHING').count, 2);
    assert.equal(distributions.detectionSource.find((row) => row.value === 'EMAIL_ANALYSIS').count, 2);
    assert.equal(recentCreated.length, 4); assert.ok(recentCreated.some((row) => row.id === resolved.id));
    assert.doesNotMatch(JSON.stringify(response.data), /PRIVATE_ANALYTICS|PRIVATE_AI_SUMMARY|reporterId|assigneeId|passwordHash/);
  });
  await t.test('end date is inclusive by UTC day and preview remains bounded', async () => {
    const response = await request('?period=custom&start=2091-01-01&end=2091-01-04');
    assert.equal(response.data.metrics.created, 5);
    assert.equal(response.data.metrics.closedCurrent, 1);
    assert.equal(response.data.metrics.resolution.eligibleCount, 1);
    assert.ok(response.data.recentCreated.length <= 8);
  });
  await t.test('current status reflects later changes without altering creation trend', async () => {
    await db.incident.update({ where: { id: first.id }, data: { status: 'RESOLVED', resolvedAt: new Date('2091-01-01T09:00:00.000Z') } });
    const response = await request();
    assert.equal(response.data.metrics.created, 4);
    assert.equal(response.data.metrics.openCurrent, 1);
    assert.equal(response.data.metrics.resolvedCurrent, 2);
    assert.deepEqual(response.data.dailyCreated.map((day) => day.count), [1, 1, 2]);
    assert.equal(response.data.metrics.resolution.averageSeconds, 5400);
  });
});
