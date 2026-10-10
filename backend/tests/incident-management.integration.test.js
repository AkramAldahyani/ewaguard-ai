import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { createIncidentManagement } from '../src/incidents/incident-management.js';
import { NOTE_NOTICE } from '../src/incidents/management-policy.js';

test('Phase 10B1 incident management: PostgreSQL and HTTP authorization', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const database = createDatabaseClient(); const users = []; const incidents = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-management-secret-at-least-32-characters', FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.auditLog.deleteMany({ where: { actorId: { in: users } } });
    for (const table of ['incidentComment', 'incidentEvent']) await database[table].deleteMany({ where: { incidentId: { in: incidents } } });
    await database.incident.deleteMany({ where: { id: { in: incidents } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    await database.$disconnect();
  });
  async function user(role = 'EMPLOYEE', changes = {}) {
    const row = await database.user.create({ data: { firstName: 'Synthetic', lastName: 'Management', email: `${randomUUID()}@example.invalid`,
      status: 'ACTIVE', passwordHash: 'synthetic-not-a-login-hash', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}), ...changes } });
    users.push(row.id); return row;
  }
  const owner = await user(); const other = await user(); const admin = await user('IT_SECURITY_ADMIN');
  const noMfa = await user('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
  const suspended = await user('IT_SECURITY_ADMIN', { status: 'SUSPENDED' });
  async function incident(reporterId = owner.id) {
    const row = await database.incident.create({ data: { reporterId, title: 'Synthetic incident', description: 'INTERNAL_DESCRIPTION_SENTINEL',
      severity: 'HIGH', riskScore: 60, riskRuleVersion: '1.0', type: 'SUSPICIOUS_ACTIVITY', detectionSource: 'EMAIL_ANALYSIS',
      aiSummary: 'PRIVATE_AI_SENTINEL', indicators: { secret: 'PRIVATE_INDICATOR_SENTINEL' } } });
    incidents.push(row.id);
    await database.incidentEvent.create({ data: { incidentId: row.id, type: 'CREATED', details: { status: 'NEW', secret: 'HISTORY_SECRET_SENTINEL' } } });
    return row;
  }
  const row = await incident(); const foreign = await incident(other.id);
  const root = '/api/admin/incidents'; const own = '/api/incidents';
  async function request(path, { actor = admin, method = 'GET', body, origin = config.frontendUrl, mfa = true, contentType = 'application/json' } = {}) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: {
      Origin: origin, ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, mfa ? actor.mfaEnabledAt : null)}` } : {}),
      ...(body !== undefined ? { 'Content-Type': contentType } : {}),
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json(), cache: res.headers.get('cache-control') };
  }
  const current = async () => (await request(`${root}/${row.id}`)).data.incident.updatedAt;
  const write = async (operation, data, options = {}) => request(`${root}/${row.id}/${operation}`,
    { method: 'POST', body: { expectedUpdatedAt: await current(), ...data }, ...options });

  await t.test('authentication, current RBAC, administrator MFA and origin protections apply', async () => {
    for (const path of [root, `${root}/${row.id}`, `${root}/${row.id}/history`, `${root}/${row.id}/notes`, `${root}/assignees`]) {
      assert.equal((await request(path, { actor: null })).status, 401);
      assert.equal((await request(path, { actor: owner })).status, 403);
      assert.equal((await request(path, { actor: noMfa })).status, 401);
      assert.equal((await request(path, { mfa: false })).status, 401);
      assert.equal((await request(path, { actor: suspended })).status, 401);
    }
    assert.equal((await request(root, { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await write('status', { status: 'UNDER_INVESTIGATION' }, { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await write('status', { status: 'UNDER_INVESTIGATION' }, { actor: owner })).status, 403);
    assert.equal((await request(own)).status, 403);
  });
  await t.test('employee scope, field minimization, strict filters and bounded pages', async () => {
    const list = await request(own, { actor: owner });
    assert.equal(list.status, 200); assert.equal(list.cache, 'no-store');
    assert.deepEqual(list.data.items.map((item) => item.id), [row.id]);
    for (const suffix of ['', '/history', '/notes']) {
      assert.equal((await request(`${own}/${foreign.id}${suffix}`, { actor: owner })).status, 404);
      assert.equal((await request(`${own}/${randomUUID()}${suffix}`, { actor: owner })).status, 404);
    }
    const detail = await request(`${own}/${row.id}`, { actor: owner });
    assert.doesNotMatch(JSON.stringify(detail.data), /SENTINEL|reporter|assignee|description|indicators|aiSummary/);
    for (const query of ['pageSize=101', 'page=0', 'status=INVALID', 'status=NEW&status=CLOSED', 'reporterId=' + other.id, 'search=anything', 'createdFrom=2026-02-30T00:00:00.000Z']) {
      assert.equal((await request(`${own}?${query}`, { actor: owner })).status, 400, query);
    }
    const listed = await request(`${root}?reporterId=${owner.id}&severity=HIGH&status=NEW&pageSize=1`);
    assert.equal(listed.data.items.length, 1);
    assert.equal((await request(`${root}?reference=${detail.data.incident.reference}`)).data.items[0].id, row.id);
    assert.equal((await request(`${root}?reporterId=${owner.id}&status=CLOSED`)).data.items.length, 0);
    const extra = await incident();
    const pageOne = await request(`${own}?pageSize=1`, { actor: owner });
    const pageTwo = await request(`${own}?pageSize=1&page=2`, { actor: owner });
    assert.equal(pageOne.data.hasMore, true); assert.equal(pageTwo.data.hasMore, false);
    assert.deepEqual(new Set([pageOne.data.items[0].id, pageTwo.data.items[0].id]), new Set([row.id, extra.id]));
    assert.equal((await request(`${root}/not-a-uuid`)).status, 400);
    assert.equal((await request(`${root}/${row.id}?include=chat`)).status, 400);
  });
  await t.test('assignment accepts only active MFA administrators and records real changes', async () => {
    const eligible = await request(`${root}/assignees?pageSize=100`);
    assert.ok(eligible.data.items.some((item) => item.id === admin.id));
    assert.ok(!eligible.data.items.some((item) => [noMfa.id, suspended.id, owner.id].includes(item.id)));
    assert.doesNotMatch(JSON.stringify(eligible.data), /email|password|mfa/);
    for (const assigneeId of [owner.id, noMfa.id, suspended.id, randomUUID()]) assert.equal((await write('assignment', { assigneeId })).status, 400);
    assert.equal((await write('assignment', { assigneeId: admin.id })).status, 200);
    assert.equal((await write('assignment', { assigneeId: null })).status, 200);
    assert.equal((await database.incidentEvent.count({ where: { incidentId: row.id, type: 'ASSIGNED' } })), 2);
    const history = await request(`${root}/${row.id}/history`);
    assert.ok(history.data.items.some((item) => item.assignment?.assigneeId === admin.id));
  });
  await t.test('strict mutations reject mass assignment, invalid bodies and oversized notes', async () => {
    assert.equal((await write('status', { status: 'UNDER_INVESTIGATION', severity: 'CRITICAL' })).status, 400);
    assert.equal((await write('status', { status: 'UNDER_INVESTIGATION', reporterId: other.id })).status, 400);
    assert.equal((await write('status', { status: 'UNDER_INVESTIGATION', expectedUpdatedAt: 'yesterday' })).status, 400);
    assert.equal((await write('status', { status: 'UNDER_INVESTIGATION' }, { contentType: 'text/plain' })).status, 415);
    assert.equal((await request(`${root}/${row.id}/notes`, { method: 'POST', body: { body: 'x'.repeat(21000) } })).status, 413);
    assert.equal((await request(`${root}/${row.id}/status`, { method: 'POST', body: [] })).status, 400);
  });
  await t.test('status policy, timestamps, stale writes, and reopening are consistent', async () => {
    assert.equal((await write('status', { status: 'CLOSED' })).status, 409);
    const version = await current();
    const responses = await Promise.all(['UNDER_INVESTIGATION', 'FALSE_POSITIVE'].map((status) =>
      request(`${root}/${row.id}/status`, { method: 'POST', body: { status, expectedUpdatedAt: version } })));
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const persisted = await database.incident.findUnique({ where: { id: row.id } });
    if (persisted.status === 'FALSE_POSITIVE') assert.equal((await write('status', { status: 'UNDER_INVESTIGATION' })).status, 200);
    for (const status of ['CONTAINED', 'RESOLVED', 'CLOSED', 'UNDER_INVESTIGATION']) {
      const res = await write('status', { status }); assert.equal(res.status, 200);
      if (status === 'RESOLVED') assert.ok(res.data.incident.resolvedAt);
      if (status === 'CLOSED') assert.ok(res.data.incident.closedAt);
      if (status === 'UNDER_INVESTIGATION') { assert.equal(res.data.incident.closedAt, null); assert.equal(res.data.incident.resolvedAt, null); }
    }
    const history = await request(`${own}/${row.id}/history`, { actor: owner });
    assert.ok(history.data.items.some((item) => item.type === 'STATUS_CHANGED'));
    assert.ok(history.data.items.every((item) => ['CREATED', 'STATUS_CHANGED'].includes(item.type)));
    assert.doesNotMatch(JSON.stringify(history.data), /SENTINEL|actor|assignee/);
  });
  await t.test('private notes stay private, reporter updates are explicit, acknowledgements and audits are minimized', async () => {
    const note = { body: 'INTERNAL_NOTE_SENTINEL', visibility: 'SECURITY_TEAM', acknowledged: true, noticeVersion: NOTE_NOTICE.version };
    assert.equal((await write('notes', { ...note, acknowledged: false })).status, 400);
    assert.equal((await write('notes', { ...note, noticeVersion: 'old' })).status, 400);
    assert.equal((await write('notes', { ...note, body: 'x'.repeat(4001) })).status, 400);
    assert.equal((await write('notes', { ...note, body: 'Control\u0000character' })).status, 400);
    assert.equal((await write('notes', note)).status, 200);
    assert.equal((await write('notes', { ...note, body: 'Your report is under review.', visibility: 'REPORTER' })).status, 200);
    const redacted = await database.incidentComment.create({ data: { incidentId: row.id, authorId: admin.id, visibility: 'REPORTER', body: 'REDACTED_SENTINEL', redactedAt: new Date() } });
    assert.ok(redacted.id);
    const employee = await request(`${own}/${row.id}/notes`, { actor: owner });
    assert.equal(employee.data.items.length, 1); assert.equal(employee.data.items[0].body, 'Your report is under review.');
    assert.doesNotMatch(JSON.stringify(employee.data), /SENTINEL|author|visibility/);
    const internal = await request(`${root}/${row.id}/notes`);
    assert.equal(internal.data.items.length, 2);
    assert.equal((await request(`${own}/${row.id}/notes`, { actor: owner, method: 'POST', body: note })).status, 404);
    const audit = await database.auditLog.findMany({ where: { resourceId: row.id } });
    assert.ok(audit.some((item) => item.action === 'INCIDENT_NOTE_ADDED' && item.metadata.noticeVersion === NOTE_NOTICE.version));
    assert.doesNotMatch(JSON.stringify(audit), /INTERNAL_NOTE_SENTINEL|Your report is under review/);
  });
  await t.test('audit failure rolls back note, status and history atomically', async () => {
    const store = new Proxy(database, { get(target, key) {
      if (key === '$transaction') return (work) => target.$transaction((tx) => work(new Proxy(tx, { get(inner, prop) {
        if (prop === 'auditLog') return { create: async () => { throw new Error('Synthetic audit failure'); } };
        return inner[prop];
      } })));
      return target[key];
    } });
    const service = createIncidentManagement(store); const version = await current();
    const before = await database.incidentEvent.count({ where: { incidentId: row.id } });
    await assert.rejects(service.mutate(admin, row.id, 'status', { status: 'CONTAINED', expectedUpdatedAt: version }));
    await assert.rejects(service.mutate(admin, row.id, 'notes', { body: 'ROLLBACK_SENTINEL', visibility: 'SECURITY_TEAM', acknowledged: true, noticeVersion: NOTE_NOTICE.version, expectedUpdatedAt: version }));
    assert.equal(await current(), version);
    assert.equal(await database.incidentEvent.count({ where: { incidentId: row.id } }), before);
    assert.equal(await database.incidentComment.count({ where: { incidentId: row.id, body: 'ROLLBACK_SENTINEL' } }), 0);
    assert.equal(await database.notification.count({ where: { incidentId: row.id } }), 0);
  });
  await t.test('read and write rate limits return consistent bounded errors', async () => {
    const limiterAdmin = await user('IT_SECURITY_ADMIN');
    for (let i = 0; i < 60; i++) assert.equal((await request(`${root}/${row.id}/status`, {
      actor: limiterAdmin, method: 'POST', body: { status: 'INVALID' },
    })).status, 400);
    const limited = await request(`${root}/${row.id}/status`, { actor: limiterAdmin, method: 'POST', body: {} });
    assert.equal(limited.status, 429); assert.equal(limited.data.error.code, 'INCIDENT_WRITE_LIMIT');
    const reader = await user();
    for (let i = 0; i < 180; i++) assert.equal((await request(own, { actor: reader })).status, 200);
    const reads = await request(own, { actor: reader });
    assert.equal(reads.status, 429); assert.equal(reads.data.error.code, 'INCIDENT_RATE_LIMIT');
  });
});
