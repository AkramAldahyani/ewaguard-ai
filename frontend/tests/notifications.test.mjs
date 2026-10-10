import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createNotificationFlow, notificationItems, socketOptions } from '../src/features/notifications/notification-flow.js';
import { notificationApi } from '../src/features/notifications/notification-api.js';
import { createIncidentFlow } from '../src/features/incidents/incident-flow.js';

const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = (n = 1, patch = {}) => ({ id: id(n), incidentId: id(90), kind: 'STATUS_CHANGED', title: 'Incident status changed',
  message: 'A status has changed.', reference: 'INC-2026-000123', severity: 'HIGH', createdAt: '2026-10-10T10:00:00.000Z', readAt: null, ...patch });
const flush = async () => { for (let n = 0; n < 15; n++) await Promise.resolve(); };
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup(overrides = {}, options = {}) {
  const timers = new Map(); let next = 0; const events = new Map(); const calls = []; let connected = 0; let disconnected = 0; let denied = 0;
  const socket = { on(name, fn) { events.set(name, fn); }, off(name, fn) { if (events.get(name) === fn) events.delete(name); },
    connect() { connected++; }, disconnect() { disconnected++; } };
  const api = Object.fromEntries(Object.entries({ list: async () => ({ items: [item()], nextCursor: 'page2' }), unread: async () => ({ unreadCount: 1 }),
    read: async (value) => ({ notification: item(Number(value.slice(-12)), { readAt: '2026-10-10T11:00:00.000Z' }) }),
    session: async () => ({ user: { id: id(10), role: 'EMPLOYEE' }, session: { id: id(20) } }), ...overrides,
  }).map(([name, fn]) => [name, (...args) => { calls.push([name, ...args]); return fn(...args); }]));
  const flow = createNotificationFlow({ userId: id(10), role: 'EMPLOYEE', sessionId: id(20), api,
    socketFactory: () => socket, onUnauthorized: () => denied++, schedule: (fn, delay) => { const key = ++next; timers.set(key, { fn, delay }); return key; }, cancel: (key) => timers.delete(key), ...options });
  async function tick() { const batch = [...timers]; timers.clear(); for (const [, { fn }] of batch) fn(); await flush(); }
  return { flow, calls, events, timers, tick, emit: (name, ...args) => events.get(name)?.(...args),
    counts: () => ({ connected, disconnected, denied }) };
}

test('socket configuration uses cookies, exact backend path and bounded manual reconnection', () => {
  assert.equal(socketOptions.path, '/api/realtime'); assert.equal(socketOptions.withCredentials, true);
  assert.equal(socketOptions.reconnection, false); assert.equal(socketOptions.autoConnect, false);
  for (const key of ['auth', 'query', 'extraHeaders']) assert.equal(socketOptions[key], undefined);
});
test('one connection/listener set per active session and no anonymous connection', () => {
  const s = setup(); s.flow.start(); s.flow.start(); assert.equal(s.counts().connected, 1); assert.equal(s.events.size, 5);
  s.flow.stop(); assert.equal(s.events.size, 0); assert.equal(s.timers.size, 0);
  const anonymous = setup({}, { userId: null }); anonymous.flow.start(); assert.equal(anonymous.counts().connected, 0);
});
test('initial loading, unread count and cursor pagination use persisted server data', async () => {
  const s = setup({ list: async (before) => ({ items: before ? [item(), item(2)] : [item()], nextCursor: before ? null : 'page2' }), unread: async () => ({ unreadCount: 132 }) });
  s.flow.start(); assert.equal(s.flow.getSnapshot().loading, true); await s.tick();
  assert.equal(s.flow.getSnapshot().unreadCount, 132); await s.flow.more();
  assert.deepEqual(s.flow.getSnapshot().items.map((row) => row.id), [id(1), id(2)]); assert.equal(s.flow.getSnapshot().nextCursor, null);
  assert.equal(s.calls.filter(([name]) => name === 'list')[1][1], 'page2'); s.flow.stop();
});
test('mark read suppresses double clicks and obtains authoritative count afterward', async () => {
  let read = false; const pending = deferred();
  const s = setup({ read: async () => { await pending.promise; read = true; return { notification: item(1, { readAt: '2026-10-10T11:00:00Z' }) }; },
    unread: async () => ({ unreadCount: read ? 0 : 1 }), list: async () => ({ items: [item(1, { readAt: read ? '2026-10-10T11:00:00Z' : null })], nextCursor: null }) });
  s.flow.start(); await s.tick(); const saving = s.flow.read(id(1)); await s.flow.read(id(1));
  assert.deepEqual(s.flow.getSnapshot().marking, [id(1)]); pending.resolve(); await saving; await s.tick();
  assert.equal(s.calls.filter(([name]) => name === 'read').length, 1); assert.equal(s.flow.getSnapshot().unreadCount, 0); s.flow.stop();
});
test('duplicate socket signals coalesce into one inbox request and one incident invalidation', async () => {
  const s = setup(); let invalidations = 0; s.flow.subscribeIncidents(() => invalidations++); s.flow.start();
  for (let n = 0; n < 10; n++) { s.emit('notifications:changed'); s.emit('incidents:changed'); }
  await s.tick(); assert.equal(s.calls.filter(([name]) => name === 'list').length, 1); assert.equal(invalidations, 1); s.flow.stop();
});
test('events arriving during a request cause one follow-up and recover missed rows', async () => {
  const waiting = deferred(); let requests = 0;
  const s = setup({ list: async () => ++requests === 1 ? waiting.promise : { items: [item(2), item()], nextCursor: null } });
  s.flow.start(); await s.tick(); for (let n = 0; n < 5; n++) s.emit('notifications:changed');
  waiting.resolve({ items: [item()], nextCursor: null }); await flush(); await s.tick();
  assert.equal(requests, 2); assert.equal(s.flow.getSnapshot().items.length, 2); s.flow.stop();
});
test('employee projection rejects administrator kinds, sensitive extra fields and unsafe incident URLs', () => {
  const rows = [item(1, { kind: 'INVESTIGATION_UPDATED', message: 'INTERNAL' }), item(2, { secret: 'SECRET', body: 'INTERNAL', userId: id(33) }), item(3, { incidentId: 'javascript:alert(1)' })];
  assert.equal(notificationItems(rows, 'EMPLOYEE').length, 1);
  assert.doesNotMatch(JSON.stringify(notificationItems(rows, 'EMPLOYEE')), /SECRET|INTERNAL|userId/);
  assert.equal(notificationItems(rows, 'IT_SECURITY_ADMIN').length, 2);
});
test('disconnect preserves safe cached data, checks session and reconnects with backoff', async () => {
  const s = setup(); s.flow.start(); await s.tick(); s.emit('notifications:ready'); await s.tick();
  await s.emit('disconnect', 'transport close');
  assert.equal(s.flow.getSnapshot().connection, 'reconnecting'); assert.equal(s.flow.getSnapshot().items.length, 1);
  assert.ok([...s.timers.values()].some((timer) => timer.delay === 1000)); await s.tick(); assert.equal(s.counts().connected, 2); s.flow.stop();
});
test('reconnection ready fetches missed notifications and refreshes active incident view', async () => {
  let rows = [item()]; const s = setup({ list: async () => ({ items: rows, nextCursor: null }) }); let invalidations = 0;
  s.flow.subscribeIncidents(() => invalidations++); s.flow.start(); await s.tick();
  rows = [item(2), item()]; s.emit('notifications:ready'); await s.tick();
  assert.equal(s.flow.getSnapshot().connection, 'live'); assert.equal(s.flow.getSnapshot().items.length, 2); assert.equal(invalidations, 1); s.flow.stop();
});
test('connection failures stop after five retries and allow an explicit retry', async () => {
  const s = setup(); s.flow.start(); await s.tick();
  for (let n = 0; n < 6; n++) { s.emit('connect_error', new Error('SECRET')); await flush(); await s.tick(); }
  assert.equal(s.counts().connected, 6); assert.equal(s.flow.getSnapshot().connection, 'offline');
  s.flow.reconnect(); await flush(); await s.tick(); assert.equal(s.counts().connected, 7); s.flow.stop();
});
for (const status of [401, 403]) test(`HTTP ${status} clears protected state and disables reconnection`, async () => {
  let fail = false; const s = setup({ unread: async () => { if (fail) throw { status }; return { unreadCount: 1 }; } });
  s.flow.start(); await s.tick(); fail = true; await s.flow.refresh();
  assert.equal(s.flow.getSnapshot().items.length, 0); assert.equal(s.flow.getSnapshot().unreadCount, null);
  assert.equal(s.counts().denied, 1); assert.equal(s.events.size, 0); assert.equal(s.timers.size, 0);
});
test('permanent socket authentication failure checks /me and stops', async () => {
  const s = setup({ session: async () => { throw { status: 401 }; } }); s.flow.start(); await s.tick();
  s.emit('connect_error'); await flush(); assert.equal(s.counts().denied, 1); assert.equal(s.timers.size, 0);
});
test('changed role or session identity clears stale notification content', async () => {
  const s = setup({ session: async () => ({ user: { id: id(10), role: 'IT_SECURITY_ADMIN' }, session: { id: id(20) } }) });
  s.flow.start(); await s.tick(); await s.emit('disconnect', 'io server disconnect');
  assert.equal(s.flow.getSnapshot().items.length, 0); assert.equal(s.counts().denied, 1);
});
test('logout/unmount aborts requests, removes listeners and ignores late results', async () => {
  const waiting = deferred(); const s = setup({ list: () => waiting.promise }); s.flow.start(); await s.tick();
  const request = s.calls.find(([name]) => name === 'list'); s.flow.stop();
  assert.equal(request[2].aborted, true); waiting.resolve({ items: [item()], nextCursor: null }); await flush();
  assert.equal(s.flow.getSnapshot().items.length, 0); assert.equal(s.events.size, 0); assert.equal(s.timers.size, 0);
});
test('strict effect restart cannot revive an old session request', async () => {
  const waiting = deferred(); let count = 0; const s = setup({ list: async () => ++count === 1 ? waiting.promise : { items: [item(2)], nextCursor: null } });
  s.flow.start(); await s.tick(); s.flow.stop(); s.flow.start(); await s.tick(); waiting.resolve({ items: [item()], nextCursor: null }); await flush();
  assert.deepEqual(s.flow.getSnapshot().items.map((row) => row.id), [id(2)]); s.flow.stop();
});
test('stale pagination cannot append after live refresh replaces the latest page', async () => {
  const waiting = deferred(); const s = setup({ list: async (before) => before ? waiting.promise : { items: [item()], nextCursor: 'page2' } });
  s.flow.start(); await s.tick(); const more = s.flow.more(); await s.flow.refresh(); waiting.resolve({ items: [item(3)], nextCursor: null }); await more;
  assert.deepEqual(s.flow.getSnapshot().items.map((row) => row.id), [id(1)]); s.flow.stop();
});
test('API failure is sanitized, retry recovers, and empty data stays honest', async () => {
  let fail = true; const s = setup({ list: async () => { if (fail) throw new Error('SECRET'); return { items: [], nextCursor: null }; }, unread: async () => ({ unreadCount: 0 }) });
  s.flow.start(); await s.tick(); assert.match(s.flow.getSnapshot().error, /retry/i); assert.doesNotMatch(s.flow.getSnapshot().error, /SECRET/);
  fail = false; await s.flow.refresh(); assert.equal(s.flow.getSnapshot().items.length, 0); assert.equal(s.flow.getSnapshot().unreadCount, 0); s.flow.stop();
});
test('read failure keeps unread state and never silently retries a write', async () => {
  const s = setup({ read: async () => { throw new Error(); } }); s.flow.start(); await s.tick(); await s.flow.read(id(1));
  assert.equal(s.flow.getSnapshot().items[0].readAt, null); assert.match(s.flow.getSnapshot().error, /read state/);
  assert.equal(s.calls.filter(([name]) => name === 'read').length, 1); s.flow.stop();
});
test('notification API uses existing credentialed transport and exact backend endpoints', async (t) => {
  const calls = []; t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push([url, options]); return { ok: true, json: async () => ({}) }; });
  await notificationApi.list('cursor?x'); await notificationApi.unread(); await notificationApi.read(id(1)); await notificationApi.session();
  assert.equal(calls[0][0], '/api/notifications?limit=20&before=cursor%3Fx');
  assert.equal(calls[1][0], '/api/notifications/unread-count'); assert.equal(calls[2][1].body, '{}');
  assert.ok(calls.every(([, options]) => options.credentials === 'include'));
});

function incidentSetup(overrides = {}, admin = true, detail = true) {
  let version = 'v1'; const calls = [];
  const api = Object.fromEntries(Object.entries({ list: async () => ({ items: [], page: 3 }),
    detail: async () => ({ incident: { id: id(90), updatedAt: version }, allowedTransitions: ['CONTAINED'] }),
    history: async (_id, page) => ({ items: [], page }), notes: async (_id, page) => ({ items: [], page }),
    mutate: async () => ({}), ...overrides,
  }).map(([key, fn]) => [key, (...args) => { calls.push([key, ...args]); return fn(...args); }]));
  return { flow: createIncidentFlow({ admin, id: detail ? id(90) : null, api }), calls, update: () => { version = 'v2'; } };
}
test('live queue refresh preserves applied filters, sorting and page', async () => {
  const s = incidentSetup({}, true, false); const filters = { severity: 'CRITICAL', source: 'EMAIL_ANALYSIS', sort: 'updated_desc' };
  await s.flow.load(filters, 3); await s.flow.liveRefresh();
  assert.equal(s.calls[1][1].page, 3); assert.equal(s.calls[1][1].severity, 'CRITICAL'); assert.equal(s.calls[1][1].sort, 'updated_desc');
});
test('employee live detail refresh gets latest authorized status/history/notes', async () => {
  const s = incidentSetup({}, false); await s.flow.load(); await s.flow.section('history', 2); s.update(); await s.flow.liveRefresh();
  assert.equal(s.flow.getSnapshot().data.incident.updatedAt, 'v2'); assert.equal(s.flow.getSnapshot().history.page, 2);
  assert.equal(s.flow.getSnapshot().notes.page, 1);
});
test('unsaved administrator inputs defer live replacement and keep original mutation version', async () => {
  const s = incidentSetup(); await s.flow.load(); s.flow.setEditing(true); s.update(); await s.flow.liveRefresh();
  assert.equal(s.flow.getSnapshot().data.incident.updatedAt, 'v1'); assert.equal(s.flow.getSnapshot().editing, true); assert.equal(s.flow.getSnapshot().livePending, true);
  await s.flow.mutate('status', { status: 'CONTAINED' }); assert.equal(s.calls.find(([name]) => name === 'mutate')[3].expectedUpdatedAt, 'v1');
  assert.equal(s.flow.getSnapshot().data.incident.updatedAt, 'v2');
});
test('typing during an in-flight background refresh preserves the draft and its version', async () => {
  const waiting = deferred(); let count = 0; const s = incidentSetup({ detail: async () => ++count === 1 ? { incident: { updatedAt: 'v1' } } : waiting.promise });
  await s.flow.load(); const refreshing = s.flow.liveRefresh(); s.flow.setEditing(true); waiting.resolve({ incident: { updatedAt: 'v2' } }); await refreshing;
  assert.equal(s.flow.getSnapshot().data.incident.updatedAt, 'v1'); assert.equal(s.flow.getSnapshot().livePending, true);
});
test('explicit discard refresh applies newer state and clears the draft guard', async () => {
  const s = incidentSetup(); await s.flow.load(); s.flow.setEditing(true); s.update(); await s.flow.liveRefresh(); await s.flow.load();
  assert.equal(s.flow.getSnapshot().editing, false); assert.equal(s.flow.getSnapshot().livePending, false); assert.equal(s.flow.getSnapshot().data.incident.updatedAt, 'v2');
});
test('unauthorized background incident response removes protected data', async () => {
  let denied = false; const s = incidentSetup({ detail: async () => { if (denied) throw { status: 403 }; return { incident: { updatedAt: 'v1' } }; } });
  await s.flow.load(); denied = true; await s.flow.liveRefresh(); assert.equal(s.flow.getSnapshot().data, null); assert.equal(s.flow.getSnapshot().notes, null);
});

test('notification components render accessible and minimized UI', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' }); t.after(() => server.close());
  const { NotificationList, NotificationTrigger } = await server.ssrLoadModule('/src/features/notifications/NotificationBell.jsx');
  const render = (Component, props) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Component, props)));
  const base = { items: [item()], unreadCount: 1, nextCursor: null, marking: [], connection: 'live' }; const flow = { read() {}, more() {}, refresh() {}, reconnect() {} };
  await t.test('bell shows server count, 99+ and explicit urgent accessible label', () => {
    const html = render(NotificationTrigger, { state: { ...base, unreadCount: 132, items: [item(1, { severity: 'CRITICAL' })] }, controls: 'notifications', onClick() {} });
    assert.match(html, /99\+/); assert.match(html, /132 unread, urgent unread alert/); assert.match(html, /aria-haspopup="dialog"/); assert.match(html, /aria-controls="notifications"/);
  });
  await t.test('employees never render administrator events, note bodies or raw HTML', () => {
    const html = render(NotificationList, { state: { ...base, items: [item(1, { kind: 'INVESTIGATION_UPDATED', message: 'PRIVATE_NOTE' }), item(2, { title: '<script>bad()</script>', body: 'RAW_EVIDENCE' })] }, role: 'EMPLOYEE', flow });
    assert.doesNotMatch(html, /PRIVATE_NOTE|RAW_EVIDENCE|<script/); assert.match(html, /&lt;script&gt;/); assert.match(html, /href="\/incidents\//);
  });
  await t.test('admin panel distinguishes HIGH/CRITICAL and uses authorized admin links', () => {
    const html = render(NotificationList, { state: { ...base, items: [item(), item(2, { severity: 'CRITICAL', readAt: 'today' })] }, role: 'IT_SECURITY_ADMIN', flow });
    for (const text of ['CRITICAL · Urgent', 'HIGH', 'Unread', 'Read', 'Mark as read', '<time', '/admin/incidents/', 'INC-2026-000123']) assert.ok(html.includes(text), text);
  });
  await t.test('loading, empty, error, reconnecting and pagination states are actionable', () => {
    assert.match(render(NotificationList, { state: { ...base, loading: true }, flow }), /Loading notifications/);
    assert.match(render(NotificationList, { state: { ...base, items: [] }, flow }), /No notifications yet/);
    const html = render(NotificationList, { state: { ...base, error: 'Retry needed', nextCursor: 'next', connection: 'reconnecting' }, role: 'EMPLOYEE', flow });
    for (const text of ['role="alert"', 'Retry notifications', 'Reconnect', 'Load more notifications', 'live updates interrupted']) assert.ok(html.includes(text), text);
  });
});
