import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { createIncidentApi } from '../src/features/incidents/incident-api.js';
import { createIncidentFlow, incidentQuery, sortIncidents, visibleNotes } from '../src/features/incidents/incident-flow.js';

const incident = { id: 'synthetic-id', reference: 'INC-2026-000123', title: 'Email analysis requires review', type: 'SUSPICIOUS_ACTIVITY',
  detectionSource: 'EMAIL_ANALYSIS', severity: 'HIGH', riskScore: 60, status: 'NEW', createdAt: '2026-10-10T10:00:00.000Z', updatedAt: '2026-10-10T10:00:00.000Z' };
const person = { id: 'admin-id', firstName: 'Security', lastName: 'Reviewer' };
const detail = () => ({ incident: { ...incident }, allowedTransitions: ['UNDER_INVESTIGATION', 'FALSE_POSITIVE'], noteNotice: { version: 'v1', message: 'Do not submit confidential information or secrets.' } });
const page = (items = [], number = 1, hasMore = false) => ({ items, page: number, pageSize: 20, hasMore });
function setup(options = {}, overrides = {}) {
  const calls = []; let version = 0;
  const api = Object.fromEntries(Object.entries({
    list: async () => page([incident]), detail: async () => ({ ...detail(), incident: { ...incident, updatedAt: `2026-10-10T10:00:0${version}.000Z` } }),
    history: async (_id, number) => page([{ id: `h${number}`, type: 'CREATED', details: { status: 'NEW' } }], number),
    notes: async (_id, number) => page([{ id: 'public', body: 'Review in progress.' }], number),
    assignees: async (number) => page([{ ...person, id: `admin-${number}` }], number, number === 1),
    mutate: async () => { version++; return { incident }; }, ...overrides,
  }).map(([name, fn]) => [name, (...args) => { calls.push([name, ...args]); return fn(...args); }]));
  const flow = createIncidentFlow({ ...options, api }); return { flow, calls };
}
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const note = { body: 'A short update.', visibility: 'SECURITY_TEAM', acknowledged: true, noticeVersion: 'v1' };

test('employee list loads owned API results, filters and pagination', async () => {
  const { flow, calls } = setup(); assert.equal(flow.getSnapshot().loading, true);
  await flow.load({ severity: 'HIGH', reference: incident.reference }, 2);
  assert.deepEqual(flow.getSnapshot().list.items, [incident]);
  assert.deepEqual(calls[0][1], { page: 2, pageSize: 20, reference: incident.reference, severity: 'HIGH' });
});
test('employee details retrieve independent history and permitted updates', async () => {
  const { flow } = setup({ id: incident.id }, { notes: async () => page([{ id: 'public', body: 'Shared' }, { id: 'private', body: 'Secret', visibility: 'SECURITY_TEAM' }]) });
  await flow.load(); assert.equal(flow.getSnapshot().data.incident.reference, incident.reference);
  assert.deepEqual(flow.getSnapshot().notes.items.map((n) => n.id), ['public']);
  await flow.section('history', 2); assert.equal(flow.getSnapshot().history.page, 2);
});
test('visibility guard excludes explicit private and redacted employee updates', () => {
  assert.equal(visibleNotes([{ visibility: 'SECURITY_TEAM' }, { visibility: 'REPORTER' }, {}, { redactedAt: 'today' }], false).length, 2);
});
test('filters validate full references and date ranges without unsupported fields', () => {
  assert.throws(() => incidentQuery({ reference: 'partial' }));
  assert.throws(() => incidentQuery({ createdFrom: '2026-02-30' }));
  assert.throws(() => incidentQuery({ createdFrom: '2026-10-11', createdTo: '2026-10-10' }));
  assert.deepEqual(incidentQuery({ createdFrom: '2026-10-10', createdTo: '2026-10-10', source: 'EMAIL', sort: 'risk' }),
    { page: 1, pageSize: 20, createdFrom: '2026-10-10T00:00:00.000Z', createdTo: '2026-10-10T23:59:59.999Z' });
});
test('page-only sorting is deterministic and never mutates backend results', () => {
  const items = [{ ...incident }, { ...incident, id: 'second', severity: 'CRITICAL', updatedAt: '2026-10-11T00:00:00Z' }];
  assert.equal(sortIncidents(items, 'severity')[0].id, 'second'); assert.equal(sortIncidents(items, 'updated')[0].id, 'second'); assert.equal(items[0].id, incident.id);
});
test('failed list request has actionable safe error and supports retry', async () => {
  let fail = true; const { flow } = setup({}, { list: async () => { if (fail) throw new Error('SECRET_SERVER_PAYLOAD'); return page(); } });
  await flow.load(); assert.match(flow.getSnapshot().error, /try again/); assert.doesNotMatch(flow.getSnapshot().error, /SECRET/);
  fail = false; await flow.load(); assert.deepEqual(flow.getSnapshot().list.items, []); assert.equal(flow.getSnapshot().error, '');
});
for (const status of [401, 403, 404]) test(`HTTP ${status} removes incident content and provides safe access guidance`, async () => {
  let fail = false; const { flow } = setup({ admin: true, id: incident.id }, { detail: async () => { if (fail) throw { status }; return detail(); } });
  await flow.load(); fail = true; await flow.load(); assert.equal(flow.getSnapshot().data, null); assert.equal(flow.getSnapshot().notes, null);
  assert.match(flow.getSnapshot().error, status === 401 ? /MFA/ : status === 403 ? /not authorized/ : /unavailable/);
});
test('assignment sends the displayed version then refreshes detail, notes and history', async () => {
  const { flow, calls } = setup({ admin: true, id: incident.id }); await flow.load();
  assert.equal(await flow.mutate('assignment', { assigneeId: person.id }), true);
  const sent = calls.find(([name]) => name === 'mutate'); assert.deepEqual(sent.slice(1, 4), [incident.id, 'assignment', { assigneeId: person.id, expectedUpdatedAt: incident.updatedAt }]);
  assert.equal(calls.filter(([name]) => name === 'detail').length, 2); assert.notEqual(flow.getSnapshot().data.incident.updatedAt, incident.updatedAt);
});
test('status selection is constrained to backend transitions', async () => {
  const { flow, calls } = setup({ admin: true, id: incident.id }); await flow.load();
  assert.equal(await flow.mutate('status', { status: 'CLOSED' }), false);
  assert.equal(await flow.mutate('status', { status: 'UNDER_INVESTIGATION' }), true);
  assert.equal(calls.filter(([name]) => name === 'mutate').length, 1);
});
test('employee flows cannot invoke mutations or administrator discovery', async () => {
  const { flow, calls } = setup({ id: incident.id }); await flow.load(); await flow.assignees();
  assert.equal(await flow.mutate('status', { status: 'UNDER_INVESTIGATION' }), false);
  assert.ok(!calls.some(([name]) => ['mutate', 'assignees'].includes(name)));
});
test('notes require explicit audience, current notice and active acknowledgement', async () => {
  const { flow, calls } = setup({ admin: true, id: incident.id }); await flow.load();
  for (const patch of [{ acknowledged: false }, { noticeVersion: 'old' }, { visibility: undefined }, { body: ' ' }, { body: 'a'.repeat(4001) }]) assert.equal(await flow.mutate('notes', { ...note, ...patch }), false);
  assert.equal(await flow.mutate('notes', note), true);
  assert.equal(await flow.mutate('notes', { ...note, visibility: 'REPORTER' }), true);
  assert.deepEqual(calls.filter(([name]) => name === 'mutate').map((c) => c[3].visibility), ['SECURITY_TEAM', 'REPORTER']);
});
test('stale-edit conflicts refresh without replaying a rejected mutation', async () => {
  const { flow, calls } = setup({ admin: true, id: incident.id }, { mutate: async () => { throw { status: 409 }; } });
  await flow.load(); assert.equal(await flow.mutate('assignment', { assigneeId: person.id }), false);
  assert.match(flow.getSnapshot().message, /not applied/); assert.equal(calls.filter(([name]) => name === 'detail').length, 2);
  assert.equal(calls.filter(([name]) => name === 'mutate').length, 1); assert.equal(flow.getSnapshot().busy, false);
});
test('ambiguous mutation failure requires refresh and is never retried automatically', async () => {
  const { flow, calls } = setup({ admin: true, id: incident.id }, { mutate: async () => { throw new Error('Disconnected'); } });
  await flow.load(); await flow.mutate('notes', note);
  assert.equal(flow.getSnapshot().data, null); assert.match(flow.getSnapshot().error, /may already have been saved/);
  await flow.mutate('notes', note); assert.equal(calls.filter(([name]) => name === 'mutate').length, 1);
});
test('duplicate clicks cannot submit twice while a mutation is pending', async () => {
  const wait = deferred(); const { flow, calls } = setup({ admin: true, id: incident.id }, { mutate: () => wait.promise }); await flow.load();
  const pending = flow.mutate('notes', note); assert.equal(flow.getSnapshot().busy, true);
  assert.equal(await flow.mutate('notes', note), false); wait.resolve({}); await pending;
  assert.equal(calls.filter(([name]) => name === 'mutate').length, 1);
});
test('late list responses cannot overwrite a newer filter result', async () => {
  const wait = deferred(); let count = 0; const { flow } = setup({}, { list: () => ++count === 1 ? wait.promise : Promise.resolve(page([{ ...incident, id: 'new' }])) });
  const old = flow.load(); await flow.load({ severity: 'CRITICAL' }); wait.resolve(page([incident])); await old;
  assert.equal(flow.getSnapshot().list.items[0].id, 'new');
});
test('clear aborts requests and ignores late results after logout/navigation', async () => {
  const wait = deferred(); const { flow, calls } = setup({}, { list: () => wait.promise }); const pending = flow.load();
  flow.clear(); assert.equal(calls[0][2].aborted, true); wait.resolve(page([incident])); await pending; assert.equal(flow.getSnapshot().list, null);
});
test('history failure leaves details available and retries independently', async () => {
  let fail = true; const { flow } = setup({ id: incident.id }, { history: async () => { if (fail) throw new Error(); return page(); } });
  await flow.load(); assert.ok(flow.getSnapshot().data); assert.ok(flow.getSnapshot().historyError);
  fail = false; await flow.section('history', 1); assert.equal(flow.getSnapshot().historyError, '');
});
test('assignee discovery pages without silently omitting later administrators', async () => {
  const { flow } = setup({ admin: true }); await flow.assignees(); await flow.assignees(true);
  assert.equal(flow.getSnapshot().assignees.length, 2); assert.equal(flow.getSnapshot().moreAssignees, false);
});
test('incident API uses existing cookie transport and only supported endpoints', async (t) => {
  const calls = []; t.mock.method(globalThis, 'fetch', async (path, options) => { calls.push({ path, options }); return { ok: true, status: 200, json: async () => ({}) }; });
  const admin = createIncidentApi(true); const employee = createIncidentApi(); const signal = new AbortController().signal;
  await admin.list({ page: 1 }, signal); await employee.detail('id', signal); await employee.history('id', 2, signal); await employee.notes('id', 1, signal); await admin.assignees(2, signal);
  for (const operation of ['assignment', 'status', 'notes']) await admin.mutate('id', operation, { expectedUpdatedAt: incident.updatedAt }, signal);
  assert.equal(calls[0].path, '/api/admin/incidents?page=1'); assert.equal(calls[1].path, '/api/incidents/id');
  assert.equal(calls[4].path, '/api/admin/incidents/assignees?page=2&pageSize=100');
  for (const call of calls) { assert.equal(call.options.credentials, 'include'); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.signal, signal); }
  assert.throws(() => employee.mutate('id', 'status', {})); assert.throws(() => admin.mutate('id', 'delete', {}));
});

test('incident interfaces render actual components with safe role-specific states', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' }); t.after(() => server.close());
  const ui = await server.ssrLoadModule('/src/features/incidents/IncidentComponents.jsx');
  const actions = await server.ssrLoadModule('/src/features/incidents/IncidentActions.jsx');
  const { AppRoutes } = await server.ssrLoadModule('/src/App.jsx'); const { AuthContext } = await server.ssrLoadModule('/src/context/auth-context.js');
  const render = (component, props) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(component, props)));
  await t.test('employee list and details include only authorized operational fields', () => {
    const row = { ...incident, description: 'PRIVATE_SENTINEL', reporter: person, assignee: person, aiSummary: 'PRIVATE_SENTINEL' };
    const html = render(ui.IncidentResults, { items: [row], admin: false }) + render(ui.IncidentOverview, { incident: row, admin: false });
    for (const text of ['INC-2026-000123', 'High risk', 'Email Analysis', '60 / 100', 'not available']) assert.ok(html.includes(text));
    assert.doesNotMatch(html, /PRIVATE_SENTINEL|Security Reviewer/); assert.match(html, /href="\/incidents\/synthetic-id"/);
  });
  await t.test('admin queue includes urgency, assignment, table and mobile cards', () => {
    const html = render(ui.IncidentResults, { items: [{ ...incident, assignee: person }], admin: true });
    assert.match(html, /Priority review/); assert.match(html, /Security Reviewer/); assert.match(html, /<table/); assert.match(html, /lg:hidden/);
    assert.match(html, /href="\/admin\/incidents\/synthetic-id"/);
  });
  await t.test('employee updates exclude private notes and escape hostile text', () => {
    const html = render(ui.IncidentNotes, { admin: false, items: [{ id: 'private', visibility: 'SECURITY_TEAM', body: 'PRIVATE_SENTINEL' }, { id: 'public', body: '<script>bad()</script>', createdAt: incident.createdAt, author: person }] });
    assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script|PRIVATE_SENTINEL|Security Reviewer/);
  });
  await t.test('admin notes distinguish audiences and include returned author/timestamp', () => {
    const html = render(ui.IncidentNotes, { admin: true, items: [{ id: 'a', visibility: 'SECURITY_TEAM', body: 'Internal', author: person, createdAt: incident.createdAt }, { id: 'b', visibility: 'REPORTER', body: 'Shared' }] });
    assert.match(html, /Security team only/); assert.match(html, /Employee-visible update/); assert.match(html, /Security Reviewer/); assert.match(html, /<time/);
  });
  await t.test('management controls default to internal and unchecked acknowledgement', () => {
    const { flow } = setup({ admin: true, id: incident.id });
    const html = render(actions.IncidentActions, { state: { ...flow.getSnapshot(), data: detail(), assignees: [person] }, flow });
    assert.match(html, /value="SECURITY_TEAM" selected=""/); assert.doesNotMatch(html, /checked=""/);
    assert.match(html, /disabled=""[^>]*>Review internal note/); assert.match(html, /UNDER_INVESTIGATION/); assert.doesNotMatch(html, /value="CLOSED"/);
    assert.match(html, /reporting employee and security team/); assert.match(html, /Do not submit confidential/);
  });
  await t.test('loading, empty, failed, pagination and unavailable-risk states are explicit', () => {
    assert.match(render(ui.IncidentFeedback, { loading: true }), /role="status"/);
    assert.match(render(ui.IncidentFeedback, { error: 'Unavailable', retry() {} }), /role="alert"/);
    assert.match(render(ui.IncidentResults, { items: [] }), /No incidents found/);
    assert.match(render(ui.IncidentPager, { result: page([], 1, false), onPage() {} }), /disabled=""[^>]*>Next/);
    assert.match(render(ui.IncidentRisk, { incident: { severity: null } }), /Risk unavailable/);
  });
  await t.test('real routes expose role-specific pages and reject foreign roles', () => {
    const route = (path, role) => renderToStaticMarkup(createElement(AuthContext.Provider, { value: { user: { id: 'fixture', role, firstName: 'Test', lastName: 'User' }, loading: false } }, createElement(MemoryRouter, { initialEntries: [path] }, createElement(AppRoutes))));
    assert.match(route('/incidents', 'EMPLOYEE'), /<h1[^>]*>My Incidents/);
    assert.match(route('/incidents/synthetic-id', 'EMPLOYEE'), /Loading incident details/);
    assert.match(route('/admin/incidents', 'IT_SECURITY_ADMIN'), /<h1[^>]*>Incident Queue/);
    assert.match(route('/admin/incidents/synthetic-id', 'IT_SECURITY_ADMIN'), /Investigation workspace/);
    assert.doesNotMatch(route('/admin/incidents', 'EMPLOYEE'), /<h1[^>]*>Incident Queue/);
    assert.doesNotMatch(route('/incidents', 'IT_SECURITY_ADMIN'), /<h1[^>]*>My Incidents/);
  });
});
