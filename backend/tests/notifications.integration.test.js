import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { io as connect } from 'socket.io-client';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken, verifyAccessToken } from '../src/auth/auth-token.js';
import { attachRealtime } from '../src/notifications/realtime.js';
import { persistIncidentNotifications } from '../src/notifications/notification-service.js';
import { createIncidentManagement } from '../src/incidents/incident-management.js';
import { NOTE_NOTICE } from '../src/incidents/management-policy.js';

test('Phase 10C1 authenticated notifications and durable recovery', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const database = createDatabaseClient(); const users = []; const incidents = []; const sockets = []; const tokenIds = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-notification-secret-more-than-32-characters', FRONTEND_URL: 'http://127.0.0.1:5173' });
  const app = createApp(config, { database }); const server = createServer(app);
  const realtime = attachRealtime(server, { database, config, pollIntervalMs: 30 }); app.locals.realtime = realtime;
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    for (const socket of sockets) socket.disconnect();
    await realtime.close();
    await database.auditLog.deleteMany({ where: { actorId: { in: users } } });
    for (const table of ['notification', 'incidentComment', 'incidentEvent', 'incidentEvidence']) await database[table].deleteMany({ where: { incidentId: { in: incidents } } });
    await database.incident.deleteMany({ where: { id: { in: incidents } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    await database.revokedSession.deleteMany({ where: { id: { in: tokenIds } } });
    await database.$disconnect();
  });
  async function user(role = 'EMPLOYEE', changes = {}) {
    const row = await database.user.create({ data: { firstName: 'Synthetic', lastName: 'Notification', email: `${randomUUID()}@example.invalid`,
      status: 'ACTIVE', passwordHash: 'synthetic-not-a-login-hash', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}), ...changes } });
    users.push(row.id); return row;
  }
  const owner = await user(); const other = await user(); const admin = await user('IT_SECURITY_ADMIN');
  const noMfa = await user('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
  const token = (actor, options = {}) => {
    const value = issueAccessToken(actor.id, { ...config, ...options }, actor.mfaEnabledAt);
    if ((options.accessTokenTtlSeconds ?? 900) > 0) tokenIds.push(verifyAccessToken(value, config).jti);
    return value;
  };
  async function api(path = '', { actor = owner, auth = actor ? token(actor) : null, method = 'GET', body, origin = config.frontendUrl } = {}) {
    const response = await fetch(`${base}/api/${path}`, { method, headers: { Origin: origin,
      ...(auth ? { Cookie: `${authCookie(config).name}=${auth}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }
  function socket(auth, options = {}) {
    const item = connect(base, { path: '/api/realtime', transports: ['websocket'], reconnection: false, autoConnect: false,
      extraHeaders: { Origin: config.frontendUrl, ...(auth ? { Cookie: `${authCookie(config).name}=${auth}` } : {}) }, ...options });
    sockets.push(item); return item;
  }
  const event = (item, name) => once(item, name, { signal: AbortSignal.timeout(4000) });
  async function ready(actor, options) { const item = socket(token(actor), options); const waiting = event(item, 'notifications:ready'); item.connect(); await waiting; return item; }
  async function denied(auth, options) { const item = socket(auth, options); const waiting = event(item, 'connect_error'); item.connect(); await waiting; assert.equal(item.connected, false); item.disconnect(); }
  async function incident() {
    const row = await database.incident.create({ data: { reporterId: owner.id, title: 'PRIVATE_TITLE', description: 'RAW_SECRET_BODY',
      severity: 'CRITICAL', riskScore: 90, riskRuleVersion: '1.0', type: 'SUSPICIOUS_ACTIVITY', detectionSource: 'EMAIL_ANALYSIS' } });
    incidents.push(row.id); return row;
  }
  const row = await incident(); const management = createIncidentManagement(database);
  async function mutate(operation, input) {
    const current = await database.incident.findUniqueOrThrow({ where: { id: row.id } });
    return management.mutate(admin, row.id, operation, { expectedUpdatedAt: current.updatedAt.toISOString(), ...input });
  }
  const note = (visibility) => ({ body: 'PRIVATE_NOTE_SENTINEL', visibility, noticeVersion: NOTE_NOTICE.version, acknowledged: true });

  await t.test('anonymous, invalid, expired, MFA-less and untrusted-origin sockets are rejected', async () => {
    await denied(null); await denied('invalid'); await denied(token(owner, { accessTokenTtlSeconds: -1 }));
    await denied(token(noMfa)); await denied(issueAccessToken(admin.id, config));
    await denied(token(owner), { extraHeaders: { Origin: 'https://attacker.invalid' } });
    await denied(token(owner), { auth: { role: 'IT_SECURITY_ADMIN', userId: admin.id } });
    await denied(token(owner), { query: { token: 'never-accept-url-credentials' } });
  });
  let employeeSocket; let adminSocket; let otherSocket;
  await t.test('cookie authentication joins only server-selected rooms and supports polling transport', async () => {
    employeeSocket = await ready(owner); adminSocket = await ready(admin); otherSocket = await ready(other, { transports: ['polling'] });
    assert.ok(realtime.io.sockets.adapter.rooms.get(`user:${owner.id}`).has(employeeSocket.id));
    assert.ok(realtime.io.sockets.adapter.rooms.get('verified-administrators').has(adminSocket.id));
    assert.equal(realtime.io.sockets.adapter.rooms.get('verified-administrators').has(employeeSocket.id), false);
  });
  const changes = { owner: 0, other: 0 };
  await t.test('committed critical alerts reach admins only and duplicate persistence is suppressed', async () => {
    employeeSocket.on('notifications:changed', () => changes.owner++); otherSocket.on('notifications:changed', () => changes.other++);
    const changed = event(adminSocket, 'notifications:changed');
    await database.$transaction(async (tx) => {
      await persistIncidentNotifications(tx, row, 'INCIDENT_CREATED', `created:${row.id}`);
      await persistIncidentNotifications(tx, row, 'INCIDENT_CREATED', `created:${row.id}`);
    });
    await changed;
    const list = await api('notifications', { actor: admin });
    assert.equal(list.status, 200); assert.equal(list.body.items.length, 1); assert.equal(list.body.items[0].urgent, true);
    assert.equal(list.body.items[0].kind, 'INCIDENT_CREATED');
    assert.doesNotMatch(JSON.stringify(list.body), /PRIVATE_|RAW_SECRET|reporterId|assigneeId/);
    assert.equal(changes.owner, 0); assert.equal(changes.other, 0);
    assert.equal((await api('notifications')).body.items.length, 0);
  });
  await t.test('assignment notifies the assigned admin and assignment no-ops do not duplicate', async () => {
    await mutate('assignment', { assigneeId: admin.id }); await mutate('assignment', { assigneeId: admin.id });
    assert.equal(await database.notification.count({ where: { incidentId: row.id, kind: 'INCIDENT_ASSIGNED', recipientId: admin.id } }), 1);
    assert.equal((await api('notifications')).body.items.length, 0);
  });
  await t.test('internal notes never signal employees or appear in notification payloads', async () => {
    let incidentChanges = 0; employeeSocket.on('incidents:changed', () => incidentChanges++);
    await delay(100); const before = changes.owner;
    const changed = event(adminSocket, 'notifications:changed'); await mutate('notes', note('SECURITY_TEAM')); await changed;
    await delay(100); assert.equal(changes.owner, before); assert.equal(incidentChanges, 0);
    assert.doesNotMatch(JSON.stringify((await api('notifications', { actor: admin })).body), /PRIVATE_NOTE_SENTINEL/);
  });
  await t.test('status and explicit employee updates notify only the owner and contain no note text', async () => {
    let changed = event(employeeSocket, 'notifications:changed');
    await mutate('status', { status: 'UNDER_INVESTIGATION' }); await changed;
    changed = event(employeeSocket, 'notifications:changed'); await mutate('notes', note('REPORTER')); await changed;
    const list = (await api('notifications')).body;
    assert.deepEqual(new Set(list.items.map((item) => item.kind)), new Set(['STATUS_CHANGED', 'EMPLOYEE_UPDATE']));
    assert.doesNotMatch(JSON.stringify(list), /PRIVATE_NOTE|RAW_SECRET|PRIVATE_TITLE/);
    assert.equal(changes.other, 0);
  });
  await t.test('own read operations are idempotent, audited and inaccessible to other users', async () => {
    const id = (await api('notifications')).body.items[0].id;
    assert.equal((await api(`notifications/${id}/read`, { actor: other, method: 'POST', body: {} })).status, 404);
    assert.equal((await api(`notifications/${id}/read`, { actor: admin, method: 'POST', body: {} })).status, 404);
    assert.equal((await api('notifications/unread-count')).body.unreadCount, 2);
    assert.equal((await api(`notifications/${id}/read`, { method: 'POST', body: {} })).status, 200);
    assert.equal((await api(`notifications/${id}/read`, { method: 'POST', body: {} })).status, 200);
    assert.equal((await api('notifications/unread-count')).body.unreadCount, 1);
    assert.equal(await database.auditLog.count({ where: { resourceId: id, action: 'NOTIFICATION_READ' } }), 1);
  });
  await t.test('REST authentication, MFA, ownership, origin and strict input validation apply', async () => {
    assert.equal((await api('notifications', { actor: null })).status, 401);
    assert.equal((await api('notifications', { actor: noMfa })).status, 401);
    assert.equal((await api('notifications', { origin: 'https://attacker.invalid' })).status, 403);
    for (const query of ['limit=101', 'limit=-1', 'limit=2&limit=3', 'before=invalid', 'recipientId=' + other.id, 'unread=maybe']) assert.equal((await api(`notifications?${query}`)).status, 400);
    assert.equal((await api('notifications', { actor: other })).body.items.length, 0);
  });
  await t.test('cursor pages preserve ordering across new arrivals and reconnect recovers missed alerts', async () => {
    employeeSocket.disconnect();
    const first = (await api('notifications?limit=1')).body;
    await mutate('status', { status: 'CONTAINED' });
    const second = (await api(`notifications?limit=1&before=${encodeURIComponent(first.nextCursor)}`)).body;
    assert.notEqual(first.items[0].id, second.items[0].id);
    employeeSocket = await ready(owner);
    const recovered = (await api('notifications')).body.items;
    assert.equal(recovered.length, 3); assert.equal(recovered[0].kind, 'STATUS_CHANGED');
  });
  await t.test('notification write failure rolls back incident state, history and audit', async () => {
    const previous = await database.incident.findUnique({ where: { id: row.id } });
    const count = await database.incidentEvent.count({ where: { incidentId: row.id } });
    const store = new Proxy(database, { get(target, key) {
      if (key === '$transaction') return (work) => target.$transaction((tx) => work(new Proxy(tx, { get(inner, name) {
        if (name === 'notification') return { createMany: async () => { throw new Error('Synthetic storage failure'); } };
        return inner[name];
      } })));
      return target[key];
    } });
    await assert.rejects(createIncidentManagement(store).mutate(admin, row.id, 'status', { status: 'RESOLVED', expectedUpdatedAt: previous.updatedAt.toISOString() }));
    assert.equal((await database.incident.findUnique({ where: { id: row.id } })).status, 'CONTAINED');
    assert.equal(await database.incidentEvent.count({ where: { incidentId: row.id } }), count);
  });
  await t.test('stale retries cannot create duplicate employee notifications', async () => {
    const previous = await database.incident.findUnique({ where: { id: row.id } });
    await mutate('status', { status: 'RESOLVED' });
    const count = await database.notification.count({ where: { incidentId: row.id } });
    await assert.rejects(management.mutate(admin, row.id, 'status', { status: 'RESOLVED', expectedUpdatedAt: previous.updatedAt.toISOString() }), { code: 'INCIDENT_CONFLICT' });
    assert.equal(await database.notification.count({ where: { incidentId: row.id } }), count);
  });
  await t.test('dispatcher failure leaves committed writes recoverable through the API', async () => {
    let unavailable = false;
    const store = new Proxy(database, { get(target, key) {
      if (key === 'notification') return new Proxy(target.notification, { get(delegate, name) {
        if (name === 'findFirst') return (...args) => {
          if (unavailable) throw new Error('Synthetic dispatcher failure');
          return delegate.findFirst(...args);
        };
        return delegate[name];
      } });
      return target[key];
    } });
    const secondary = createServer(app); const dispatcher = attachRealtime(secondary, { database: store, config, pollIntervalMs: 30 });
    secondary.listen(0, '127.0.0.1'); await once(secondary, 'listening');
    const item = connect(`http://127.0.0.1:${secondary.address().port}`, { path: '/api/realtime', transports: ['websocket'], autoConnect: false, reconnection: false,
      extraHeaders: { Origin: config.frontendUrl, Cookie: `${authCookie(config).name}=${token(owner)}` } });
    try {
      const waiting = event(item, 'notifications:ready'); item.connect(); await waiting;
      const ended = event(item, 'disconnect'); unavailable = true;
      await mutate('notes', note('REPORTER')); await ended;
      assert.equal((await api('notifications')).body.items[0].kind, 'EMPLOYEE_UPDATE');
    } finally { item.disconnect(); await dispatcher.close(); }
  });
  await t.test('arbitrary room requests disconnect the client', async () => {
    const item = await ready(other); const ended = event(item, 'disconnect'); item.emit('join', 'verified-administrators'); await ended;
  });
  await t.test('per-user connection limits bound simultaneous sockets', async () => {
    const extra = [];
    for (let index = 0; index < 4; index++) extra.push(await ready(owner));
    await denied(token(owner));
    for (const item of extra) item.disconnect();
  });
  await t.test('expired and historical unclassified notifications are excluded', async () => {
    await database.notification.create({ data: { recipientId: owner.id, incidentId: row.id, type: 'INCIDENT_UPDATE',
      title: 'PRIVATE_LEGACY_TITLE', message: 'PRIVATE_LEGACY_CONTENT', expiresAt: new Date(Date.now() + 60000) } });
    const visible = (await api('notifications')).body.items.length;
    await database.notification.create({ data: { recipientId: owner.id, incidentId: row.id, type: 'INCIDENT_UPDATE',
      audience: 'EMPLOYEE', kind: 'STATUS_CHANGED', severity: 'HIGH', title: 'Expired', message: 'Expired', expiresAt: new Date(0) } });
    const result = (await api('notifications')).body;
    assert.equal(result.items.length, visible); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_LEGACY/);
  });
  await t.test('logout disconnects sockets and persists revocation for HTTP and reconnect', async () => {
    const auth = token(other); const item = socket(auth); const waiting = event(item, 'notifications:ready'); item.connect(); await waiting;
    const ended = event(item, 'disconnect'); assert.equal((await api('auth/logout', { auth, method: 'POST' })).status, 204); await ended;
    assert.equal((await api('notifications', { auth })).status, 401); await denied(auth);
    assert.ok(await database.revokedSession.findUnique({ where: { id: verifyAccessToken(auth, config).jti } }));
  });
  await t.test('session expiry disconnects existing sockets', async () => {
    const item = socket(token(owner, { accessTokenTtlSeconds: 2 }));
    const waiting = event(item, 'notifications:ready'); item.connect(); await waiting;
    await event(item, 'disconnect'); assert.equal(item.connected, false);
  });
  await t.test('account suspension and administrator MFA changes invalidate existing sockets', async () => {
    const ended = event(adminSocket, 'disconnect');
    await database.user.update({ where: { id: admin.id }, data: { mfaEnabledAt: new Date(Date.now() + 1000) } }); await ended;
    const employeeEnded = event(otherSocket, 'disconnect');
    await database.user.update({ where: { id: other.id }, data: { status: 'SUSPENDED' } }); await employeeEnded;
  });
  await t.test('changed ownership immediately removes notification access', async () => {
    const id = (await api('notifications')).body.items[0].id;
    await database.incident.update({ where: { id: row.id }, data: { reporterId: other.id } });
    assert.equal((await api('notifications')).body.items.length, 0);
    assert.equal((await api(`notifications/${id}/read`, { method: 'POST', body: {} })).status, 404);
  });
});
