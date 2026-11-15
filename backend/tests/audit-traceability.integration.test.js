import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl, parseConfig } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { auditFilters, listAuditLogs } from '../src/routes/audit.js';
import { createIncidentManagement } from '../src/incidents/incident-management.js';
import { actorKind } from '../src/users/user-identity.js';

test('unknown actors cannot be inferred from subjects or null foreign keys', async () => {
  assert.equal(actorKind(null, undefined), 'UNKNOWN');
  assert.equal(actorKind(null, 'AUTOMATED_RISK_ENGINE'), 'SYSTEM');
  assert.equal(actorKind(null, 'RETENTION_WORKER'), 'SYSTEM');
  assert.equal(actorKind('known-id', 'AUTOMATED_RISK_ENGINE'), 'USER');
  const db = {
    auditLog: {
      count: async () => 1,
      findMany: async () => [
        {
          id: 'legacy',
          actorId: null,
          actor: null,
          resourceId: 'affected-user',
          metadata: { subjectUserId: 'affected-user', secret: 'PRIVATE' },
        },
      ],
    },
  };
  const result = await listAuditLogs(db, {});
  assert.equal(result.total, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.items[0].actorKind, 'UNKNOWN');
  assert.equal(result.items[0].actor, null);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|metadata|subjectUserId/);
});

test('audit filters are bounded and translated to database predicates', async () => {
  for (const query of [
    { outcome: 'MAYBE' },
    { actorScope: 'ADMIN' },
    { start: '2026-02-30' },
    { start: '2025-01-01', end: '2026-02-01' },
    { action: '' },
    { resourceType: 'x'.repeat(81) },
  ])
    assert.equal(auditFilters(query), null);
  const filters = auditFilters({
    page: '2',
    pageSize: '50',
    action: 'user_',
    resourceType: 'user',
    outcome: 'DENIED',
    actorScope: 'USER',
    start: '2026-01-01',
    end: '2026-01-31',
  });
  assert.equal(filters.page, 2);
  assert.equal(filters.pageSize, 50);
  assert.deepEqual(filters.where.action, { contains: 'user_', mode: 'insensitive' });
  assert.deepEqual(filters.where.resourceType, { contains: 'user', mode: 'insensitive' });
  assert.equal(filters.where.outcome, 'DENIED');
  assert.deepEqual(filters.where.actorId, { not: null });
  assert.equal(filters.where.createdAt.gte.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(filters.where.createdAt.lt.toISOString(), '2026-02-01T00:00:00.000Z');
});

test('audit and incident traceability, deactivated/deleted identities and administrator authorization', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(),
    users = [],
    logs = [],
    incidents = [];
  const config = parseConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-traceability-secret-at-least-32-chars',
    FRONTEND_URL: 'http://127.0.0.1:5173',
  });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    try {
      await db.incidentEvent.deleteMany({ where: { incidentId: { in: incidents } } });
      await db.incident.deleteMany({ where: { id: { in: incidents } } });
      await db.urlAnalysis.deleteMany({ where: { userId: { in: users } } });
      await db.auditLog.deleteMany({ where: { OR: [{ id: { in: logs } }, { actorId: { in: users } }] } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    } finally {
      await db.$disconnect();
    }
  });
  async function user(role, mfa = false) {
    const row = await db.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: role,
        email: `${randomUUID()}@example.invalid`,
        status: 'ACTIVE',
        passwordHash: 'PRIVATE_HASH',
        role: { connect: { name: role } },
        ...(mfa ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'PRIVATE_MFA', mfaLastCounter: 0n } : {}),
      },
    });
    users.push(row.id);
    return row;
  }
  const admin = await user('IT_SECURITY_ADMIN', true),
    employee = await user('EMPLOYEE');
  const noMfa = await user('IT_SECURITY_ADMIN'),
    deleted = await user('EMPLOYEE');
  async function log(actorId, metadata = {}) {
    const row = await db.auditLog.create({
      data: {
        actorId,
        action: 'INCIDENT_VIEWED',
        resourceType: 'USER',
        resourceId: employee.id,
        outcome: 'SUCCESS',
        metadata,
        createdAt: new Date('2099-01-01T00:00:00Z'),
        retentionUntil: new Date('2099-04-01T00:00:00Z'),
      },
    });
    logs.push(row.id);
    return row;
  }
  const human = await log(admin.id, { secret: 'PRIVATE_METADATA', subjectUserId: employee.id });
  const system = await log(null, { system: 'AUTOMATED_RISK_ENGINE' });
  const unknown = await log(null),
    removed = await log(deleted.id);
  const deactivated = await log(employee.id);
  await db.user.delete({ where: { id: deleted.id } });
  async function request(
    actor = admin,
    suffix = '',
    origin = config.frontendUrl,
    mfa = true,
    route = '/api/admin/audit',
  ) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}${suffix}`, {
      headers: {
        Origin: origin,
        ...(actor
          ? {
              Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, mfa ? actor.mfaEnabledAt : null)}`,
            }
          : {}),
      },
    });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  await t.test('anonymous, employee, missing MFA and foreign origin cannot read identities', async () => {
    assert.equal((await request(null)).status, 401);
    assert.equal((await request(employee)).status, 403);
    assert.equal((await request(noMfa)).status, 401);
    assert.equal((await request(admin, '', config.frontendUrl, false)).status, 401);
    assert.equal((await request(admin, '', 'https://evil.invalid')).status, 403);
    for (const query of [
      '?page=0',
      '?pageSize=101',
      '?actorId=spoof',
      '?page=1&page=2',
      '?outcome=MAYBE',
      '?actorScope=SYSTEM',
      '?start=2099-02-30',
      '?start=2098-01-01&end=2099-12-31',
    ])
      assert.equal((await request(admin, query)).status, 400);
  });
  await db.user.update({ where: { id: employee.id }, data: { deactivatedAt: new Date() } });
  await t.test('recent analysis identity is administrator-only and survives account deactivation', async () => {
    const scan = await db.urlAnalysis.create({
      data: {
        userId: employee.id,
        hostname: 'example.invalid',
        urlSha256: 'a'.repeat(64),
        status: 'COMPLETED',
        severity: 'LOW',
        riskScore: 0,
        riskRuleVersion: '1.0',
        analyzedAt: new Date('2098-01-01T12:00:00Z'),
        expiresAt: new Date('2098-02-01T00:00:00Z'),
      },
    });
    const route = '/api/admin/analytics/security',
      query = '?period=custom&start=2098-01-01&end=2098-01-01';
    assert.equal((await request(noMfa, query, config.frontendUrl, true, route)).status, 401);
    // A still-active employee cannot access the administrator analytics endpoint.
    const other = await user('EMPLOYEE');
    assert.equal((await request(other, query, config.frontendUrl, true, route)).status, 403);
    const result = await request(admin, query, config.frontendUrl, true, route);
    assert.equal(result.status, 200);
    const found = result.data.analyses.recent.find((row) => row.id === scan.id);
    assert.equal(found.userId, employee.id);
    assert.equal(found.submittedBy.id, employee.id);
    assert.equal(found.incidentId, null);
    assert.doesNotMatch(JSON.stringify(result.data), /PRIVATE|passwordHash|mfaSecret|hostname|urlSha256/);
  });
  await t.test('only safe actor fields are returned; deletion preserves the log as unknown', async () => {
    const response = await request();
    assert.equal(response.status, 200);
    assert.match(response.cache, /no-store/);
    const find = (row) => response.data.items.find((item) => item.id === row.id);
    assert.equal(find(human).actorId, admin.id);
    assert.equal(find(human).resourceId, employee.id);
    assert.equal(find(human).actor.role.name, 'IT_SECURITY_ADMIN');
    assert.equal(find(system).actorKind, 'SYSTEM');
    assert.equal(find(unknown).actorKind, 'UNKNOWN');
    assert.equal(find(removed).actorKind, 'UNKNOWN');
    assert.equal(find(removed).actorId, null);
    assert.equal(find(deactivated).actor.id, employee.id);
    assert.doesNotMatch(JSON.stringify(response.data), /PRIVATE|passwordHash|mfaSecret|metadata|email|subjectUserId/);
    const first = await request(admin, '?pageSize=1'),
      second = await request(admin, '?pageSize=1&page=2');
    assert.equal(first.data.hasMore, true);
    assert.equal(first.data.totalPages, first.data.total);
    assert.ok(first.data.totalPages >= 2);
    assert.notEqual(first.data.items[0].id, second.data.items[0].id);
  });
  await t.test('action, resource, outcome, actor and inclusive UTC dates filter before pagination', async () => {
    const common = '&action=viewed&resourceType=user&outcome=SUCCESS&start=2099-01-01&end=2099-01-01';
    const usersOnly = await request(admin, `?actorScope=USER${common}`);
    assert.equal(usersOnly.status, 200);
    assert.ok(usersOnly.data.items.length >= 2);
    assert.ok(
      usersOnly.data.items.every(
        (row) => row.actorKind === 'USER' && row.action === 'INCIDENT_VIEWED' && row.resourceType === 'USER',
      ),
    );
    const nonUsers = await request(admin, `?actorScope=NON_USER${common}`);
    assert.equal(nonUsers.status, 200);
    assert.ok(nonUsers.data.items.length >= 2);
    assert.ok(nonUsers.data.items.every((row) => row.actorId === null));
    const outside = await request(admin, '?start=2099-01-02&end=2099-01-02');
    assert.equal(outside.status, 200);
    assert.equal(
      outside.data.items.some((row) => logs.includes(row.id)),
      false,
    );
  });
  await t.test(
    'deactivated incident originator is distinct from investigator; system timeline is explicit',
    async () => {
      const incident = await db.incident.create({
        data: {
          reporterId: employee.id,
          assigneeId: admin.id,
          title: 'Synthetic traceability',
          description: 'Synthetic',
          severity: 'HIGH',
          riskScore: 60,
          riskRuleVersion: '1.0',
          type: 'SUSPICIOUS_ACTIVITY',
          detectionSource: 'MANUAL_REPORT',
        },
      });
      incidents.push(incident.id);
      await db.incidentEvent.createMany({
        data: [
          { incidentId: incident.id, type: 'CREATED', details: { source: 'AUTOMATED_RISK_ENGINE' } },
          { incidentId: incident.id, type: 'CREATED', details: {} },
        ],
      });
      const service = createIncidentManagement(db);
      const detail = await service.detail(admin, true, incident.id);
      assert.equal(detail.incident.reporter.id, employee.id);
      assert.equal(detail.incident.assignee.id, admin.id);
      const history = await service.history(admin, true, incident.id, {});
      assert.deepEqual(new Set(history.items.map((item) => item.actorKind)), new Set(['SYSTEM', 'UNKNOWN']));
      const privateHistory = await service.history(employee, false, incident.id, {});
      assert.doesNotMatch(JSON.stringify(privateHistory), /actorId|actorKind|AUTOMATED_RISK_ENGINE/);
    },
  );
});
