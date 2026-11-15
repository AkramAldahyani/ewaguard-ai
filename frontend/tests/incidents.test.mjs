import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { createIncidentApi } from '../src/features/incidents/incident-api.js';
import {
  createIncidentFlow,
  elapsedLabel,
  incidentQuery,
  lifecycle,
  queuePosture,
  visibleNotes,
} from '../src/features/incidents/incident-flow.js';
import { projectIncidentDetail } from '../../backend/src/incidents/incident-detail.js';
import { buildIncidentAssistance } from '../../backend/src/assistance/incident-assistance.js';

const incident = {
  id: 'synthetic-id',
  reference: 'INC-2026-000123',
  title: 'Email analysis requires review',
  type: 'SUSPICIOUS_ACTIVITY',
  detectionSource: 'EMAIL_ANALYSIS',
  severity: 'HIGH',
  riskScore: 60,
  status: 'NEW',
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
};
const person = { id: 'admin-id', firstName: 'Security', lastName: 'Reviewer' };
const detail = () => ({
  incident: { ...incident },
  allowedTransitions: ['UNDER_INVESTIGATION', 'FALSE_POSITIVE'],
  noteNotice: { version: 'v1', message: 'Do not submit confidential information or secrets.' },
});
const page = (items = [], number = 1, hasMore = false) => ({ items, page: number, pageSize: 20, hasMore });
function setup(options = {}, overrides = {}) {
  const calls = [];
  let version = 0;
  const api = Object.fromEntries(
    Object.entries({
      list: async () => page([incident]),
      detail: async () => ({ ...detail(), incident: { ...incident, updatedAt: `2026-10-10T10:00:0${version}.000Z` } }),
      history: async (_id, number) => page([{ id: `h${number}`, type: 'CREATED', details: { status: 'NEW' } }], number),
      notes: async (_id, number) => page([{ id: 'public', body: 'Review in progress.' }], number),
      assignees: async (number) => page([{ ...person, id: `admin-${number}` }], number, number === 1),
      mutate: async () => {
        version++;
        return { incident };
      },
      ...overrides,
    }).map(([name, fn]) => [
      name,
      (...args) => {
        calls.push([name, ...args]);
        return fn(...args);
      },
    ]),
  );
  const flow = createIncidentFlow({ ...options, api });
  return { flow, calls };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const note = { body: 'A short update.', visibility: 'SECURITY_TEAM', acknowledged: true, noticeVersion: 'v1' };

test('employee list loads owned API results, filters and pagination', async () => {
  const { flow, calls } = setup();
  assert.equal(flow.getSnapshot().loading, true);
  await flow.load({ severity: 'HIGH', reference: incident.reference }, 2);
  assert.deepEqual(flow.getSnapshot().list.items, [incident]);
  assert.deepEqual(calls[0][1], { page: 2, pageSize: 20, reference: incident.reference, severity: 'HIGH' });
});
test('employee details retrieve independent history and permitted updates', async () => {
  const { flow } = setup(
    { id: incident.id },
    {
      notes: async () =>
        page([
          { id: 'public', body: 'Shared' },
          { id: 'private', body: 'Secret', visibility: 'SECURITY_TEAM' },
        ]),
    },
  );
  await flow.load();
  assert.equal(flow.getSnapshot().data.incident.reference, incident.reference);
  assert.deepEqual(
    flow.getSnapshot().notes.items.map((n) => n.id),
    ['public'],
  );
  await flow.section('history', 2);
  assert.equal(flow.getSnapshot().history.page, 2);
});
test('visibility guard excludes explicit private and redacted employee updates', () => {
  assert.equal(
    visibleNotes([{ visibility: 'SECURITY_TEAM' }, { visibility: 'REPORTER' }, {}, { redactedAt: 'today' }], false)
      .length,
    2,
  );
});
test('filters validate full references and date ranges without unsupported fields', () => {
  assert.throws(() => incidentQuery({ reference: 'partial' }));
  assert.throws(() => incidentQuery({ createdFrom: '2026-02-30' }));
  assert.throws(() => incidentQuery({ createdFrom: '2026-10-11', createdTo: '2026-10-10' }));
  assert.deepEqual(
    incidentQuery({
      createdFrom: '2026-10-10',
      createdTo: '2026-10-10',
      source: 'EMAIL_ANALYSIS',
      sort: 'severity_desc',
    }),
    {
      page: 1,
      pageSize: 20,
      source: 'EMAIL_ANALYSIS',
      sort: 'severity_desc',
      createdFrom: '2026-10-10T00:00:00.000Z',
      createdTo: '2026-10-10T23:59:59.999Z',
    },
  );
  assert.throws(() => incidentQuery({ source: 'EMAIL', sort: 'risk' }));
});
test('queue views, search and triage priority are validated and sent to the server', async () => {
  assert.deepEqual(incidentQuery({ view: 'open', sort: 'priority', search: '  phishing ' }), {
    page: 1,
    pageSize: 20,
    sort: 'priority',
    view: 'open',
    search: 'phishing',
  });
  assert.throws(() => incidentQuery({ view: 'everything' }));
  assert.throws(() => incidentQuery({ search: 'x'.repeat(101) }));
  const defaults = { view: 'open', sort: 'priority' };
  const { flow, calls } = setup({ admin: true, initialFilters: defaults });
  await flow.load();
  assert.deepEqual(calls[0][1], { page: 1, pageSize: 20, ...defaults });
  flow.clear();
  assert.deepEqual(flow.getSnapshot().filters, defaults);
});
test('queue counts load after the list and never block or replace it', async () => {
  const summary = { open: 2, openBySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 1, LOW: 0 } };
  let fail = false;
  const { flow, calls } = setup(
    { admin: true },
    {
      summary: async () => {
        if (fail) throw new Error('SECRET');
        return summary;
      },
    },
  );
  await flow.load();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    calls.map(([name]) => name),
    ['list', 'summary'],
  );
  assert.deepEqual(flow.getSnapshot().summary, summary);
  assert.equal(queuePosture(summary), 'HIGH');
  assert.equal(queuePosture(null), 'NEUTRAL');
  fail = true;
  await flow.load();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flow.getSnapshot().summary, null);
  assert.equal(flow.getSnapshot().error, '');
  assert.deepEqual(flow.getSnapshot().list.items, [incident]);
});
test('the previous list stays visible while the next page or filter loads', async () => {
  const wait = deferred();
  let count = 0;
  const { flow } = setup({}, { list: () => (++count === 1 ? Promise.resolve(page([incident])) : wait.promise) });
  await flow.load();
  const pending = flow.load({ severity: 'CRITICAL' });
  assert.equal(flow.getSnapshot().loading, true);
  assert.deepEqual(flow.getSnapshot().list.items, [incident]);
  wait.resolve(page());
  await pending;
  assert.deepEqual(flow.getSnapshot().list.items, []);
});
test('lifecycle path and elapsed time are derived only from recorded values', () => {
  assert.deepEqual(lifecycle('FALSE_POSITIVE'), ['NEW', 'UNDER_INVESTIGATION', 'FALSE_POSITIVE', 'CLOSED']);
  assert.equal(lifecycle('CONTAINED').indexOf('CONTAINED'), 2);
  const from = '2026-10-10T10:00:00.000Z';
  assert.equal(elapsedLabel(from, '2026-10-10T10:00:20.000Z'), '1m');
  assert.equal(elapsedLabel(from, '2026-10-10T15:30:00.000Z'), '5h');
  assert.equal(elapsedLabel(from, '2026-10-13T10:00:00.000Z'), '3d');
  assert.equal(elapsedLabel('not a date'), '');
  assert.equal(elapsedLabel(from, '2026-10-09T10:00:00.000Z'), '');
});
test('source and full-result sorting are sent to the server on every page', async () => {
  const { flow, calls } = setup();
  await flow.load({ source: 'FILE_ANALYSIS', sort: 'severity_desc' });
  await flow.load(flow.getSnapshot().filters, 2);
  assert.equal(calls[1][1].source, 'FILE_ANALYSIS');
  assert.equal(calls[1][1].sort, 'severity_desc');
  assert.equal(calls[1][1].page, 2);
  assert.deepEqual(flow.getSnapshot().list.items, [incident]);
});
test('employee status filter resets to page one and stays applied during pagination', async () => {
  const { flow, calls } = setup();
  await flow.load({}, 2);
  await flow.load({ status: 'UNDER_INVESTIGATION' }, 1);
  await flow.load(flow.getSnapshot().filters, 2);
  assert.deepEqual(
    calls.filter(([name]) => name === 'list').map(([, query]) => [query.status, query.page]),
    [
      [undefined, 2],
      ['UNDER_INVESTIGATION', 1],
      ['UNDER_INVESTIGATION', 2],
    ],
  );
  await flow.load({}, 1);
  assert.equal(calls.at(-1)[1].status, undefined);
});
test('failed list request has actionable safe error and supports retry', async () => {
  let fail = true;
  const { flow } = setup(
    {},
    {
      list: async () => {
        if (fail) throw new Error('SECRET_SERVER_PAYLOAD');
        return page();
      },
    },
  );
  await flow.load();
  assert.match(flow.getSnapshot().error, /try again/);
  assert.doesNotMatch(flow.getSnapshot().error, /SECRET/);
  fail = false;
  await flow.load();
  assert.deepEqual(flow.getSnapshot().list.items, []);
  assert.equal(flow.getSnapshot().error, '');
});
for (const status of [401, 403, 404])
  test(`HTTP ${status} removes incident content and provides safe access guidance`, async () => {
    let fail = false;
    const { flow } = setup(
      { admin: true, id: incident.id },
      {
        detail: async () => {
          if (fail) throw { status };
          return detail();
        },
      },
    );
    await flow.load();
    fail = true;
    await flow.load();
    assert.equal(flow.getSnapshot().data, null);
    assert.equal(flow.getSnapshot().notes, null);
    assert.match(flow.getSnapshot().error, status === 401 ? /MFA/ : status === 403 ? /not authorized/ : /unavailable/);
  });
test('assignment sends the displayed version then refreshes detail, notes and history', async () => {
  const { flow, calls } = setup({ admin: true, id: incident.id });
  await flow.load();
  assert.equal(await flow.mutate('assignment', { assigneeId: person.id }), true);
  const sent = calls.find(([name]) => name === 'mutate');
  assert.deepEqual(sent.slice(1, 4), [
    incident.id,
    'assignment',
    { assigneeId: person.id, expectedUpdatedAt: incident.updatedAt },
  ]);
  assert.equal(calls.filter(([name]) => name === 'detail').length, 2);
  assert.notEqual(flow.getSnapshot().data.incident.updatedAt, incident.updatedAt);
});
test('status selection is constrained to backend transitions', async () => {
  const { flow, calls } = setup({ admin: true, id: incident.id });
  await flow.load();
  assert.equal(await flow.mutate('status', { status: 'CLOSED' }), false);
  assert.equal(await flow.mutate('status', { status: 'UNDER_INVESTIGATION' }), true);
  assert.equal(calls.filter(([name]) => name === 'mutate').length, 1);
});
test('employee flows cannot invoke mutations or administrator discovery', async () => {
  const { flow, calls } = setup({ id: incident.id });
  await flow.load();
  await flow.assignees();
  assert.equal(await flow.mutate('status', { status: 'UNDER_INVESTIGATION' }), false);
  assert.ok(!calls.some(([name]) => ['mutate', 'assignees'].includes(name)));
});
test('notes require explicit audience, current notice and active acknowledgement', async () => {
  const { flow, calls } = setup({ admin: true, id: incident.id });
  await flow.load();
  for (const patch of [
    { acknowledged: false },
    { noticeVersion: 'old' },
    { visibility: undefined },
    { body: ' ' },
    { body: 'a'.repeat(4001) },
  ])
    assert.equal(await flow.mutate('notes', { ...note, ...patch }), false);
  assert.equal(await flow.mutate('notes', note), true);
  assert.equal(await flow.mutate('notes', { ...note, visibility: 'REPORTER' }), true);
  assert.deepEqual(
    calls.filter(([name]) => name === 'mutate').map((c) => c[3].visibility),
    ['SECURITY_TEAM', 'REPORTER'],
  );
});
test('stale-edit conflicts refresh without replaying a rejected mutation', async () => {
  const { flow, calls } = setup(
    { admin: true, id: incident.id },
    {
      mutate: async () => {
        throw { status: 409 };
      },
    },
  );
  await flow.load();
  assert.equal(await flow.mutate('assignment', { assigneeId: person.id }), false);
  assert.match(flow.getSnapshot().message, /not applied/);
  assert.equal(calls.filter(([name]) => name === 'detail').length, 2);
  assert.equal(calls.filter(([name]) => name === 'mutate').length, 1);
  assert.equal(flow.getSnapshot().busy, false);
});
test('ambiguous mutation failure requires refresh and is never retried automatically', async () => {
  const { flow, calls } = setup(
    { admin: true, id: incident.id },
    {
      mutate: async () => {
        throw new Error('Disconnected');
      },
    },
  );
  await flow.load();
  await flow.mutate('notes', note);
  assert.equal(flow.getSnapshot().data, null);
  assert.match(flow.getSnapshot().error, /may already have been saved/);
  await flow.mutate('notes', note);
  assert.equal(calls.filter(([name]) => name === 'mutate').length, 1);
});
test('duplicate clicks cannot submit twice while a mutation is pending', async () => {
  const wait = deferred();
  const { flow, calls } = setup({ admin: true, id: incident.id }, { mutate: () => wait.promise });
  await flow.load();
  const pending = flow.mutate('notes', note);
  assert.equal(flow.getSnapshot().busy, true);
  assert.equal(await flow.mutate('notes', note), false);
  wait.resolve({});
  await pending;
  assert.equal(calls.filter(([name]) => name === 'mutate').length, 1);
});
test('late list responses cannot overwrite a newer filter result', async () => {
  const wait = deferred();
  let count = 0;
  const { flow } = setup(
    {},
    { list: () => (++count === 1 ? wait.promise : Promise.resolve(page([{ ...incident, id: 'new' }]))) },
  );
  const old = flow.load();
  await flow.load({ severity: 'CRITICAL' });
  wait.resolve(page([incident]));
  await old;
  assert.equal(flow.getSnapshot().list.items[0].id, 'new');
});
test('clear aborts requests and ignores late results after logout/navigation', async () => {
  const wait = deferred();
  const { flow, calls } = setup({}, { list: () => wait.promise });
  const pending = flow.load();
  flow.clear();
  assert.equal(calls[0][2].aborted, true);
  wait.resolve(page([incident]));
  await pending;
  assert.equal(flow.getSnapshot().list, null);
});
test('history failure leaves details available and retries independently', async () => {
  let fail = true;
  const { flow } = setup(
    { id: incident.id },
    {
      history: async () => {
        if (fail) throw new Error();
        return page();
      },
    },
  );
  await flow.load();
  assert.ok(flow.getSnapshot().data);
  assert.ok(flow.getSnapshot().historyError);
  fail = false;
  await flow.section('history', 1);
  assert.equal(flow.getSnapshot().historyError, '');
});
test('assignee discovery pages without silently omitting later administrators', async () => {
  const { flow } = setup({ admin: true });
  await flow.assignees();
  await flow.assignees(true);
  assert.equal(flow.getSnapshot().assignees.length, 2);
  assert.equal(flow.getSnapshot().moreAssignees, false);
});
test('incident API uses existing cookie transport and only supported endpoints', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push({ path, options });
    return { ok: true, status: 200, json: async () => ({}) };
  });
  const admin = createIncidentApi(true);
  const employee = createIncidentApi();
  const signal = new AbortController().signal;
  await admin.list({ page: 1 }, signal);
  await employee.detail('id', signal);
  await employee.history('id', 2, signal);
  await employee.notes('id', 1, signal);
  await admin.assignees(2, signal);
  for (const operation of ['assignment', 'status', 'notes'])
    await admin.mutate('id', operation, { expectedUpdatedAt: incident.updatedAt }, signal);
  assert.equal(calls[0].path, '/api/admin/incidents?page=1');
  assert.equal(calls[1].path, '/api/incidents/id');
  assert.equal(calls[4].path, '/api/admin/incidents/assignees?page=2&pageSize=100');
  for (const call of calls) {
    assert.equal(call.options.credentials, 'include');
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.signal, signal);
  }
  assert.throws(() => employee.mutate('id', 'status', {}));
  assert.throws(() => admin.mutate('id', 'delete', {}));
});

test('incident interfaces render actual components with safe role-specific states', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  t.after(() => server.close());
  const ui = await server.ssrLoadModule('/src/features/incidents/IncidentComponents.jsx');
  const assessmentUi = await server.ssrLoadModule('/src/features/incidents/IncidentAssessment.jsx');
  const actions = await server.ssrLoadModule('/src/features/incidents/IncidentActions.jsx');
  const { AppRoutes } = await server.ssrLoadModule('/src/App.jsx');
  const { AuthContext } = await server.ssrLoadModule('/src/context/auth-context.js');
  const render = (component, props) =>
    renderToStaticMarkup(createElement(MemoryRouter, null, createElement(component, props)));
  await t.test('employee list and details include only authorized operational fields', () => {
    const row = {
      ...incident,
      description: 'PRIVATE_SENTINEL',
      reporter: person,
      assignee: person,
      aiSummary: 'PRIVATE_SENTINEL',
    };
    const html =
      render(ui.IncidentResults, { items: [row], admin: false }) +
      render(ui.IncidentOverview, { incident: row, admin: false });
    for (const text of ['INC-2026-000123', 'High risk', 'Email Analysis', '60 / 100', 'unavailable'])
      assert.ok(html.includes(text));
    assert.doesNotMatch(html, /PRIVATE_SENTINEL|Security Reviewer/);
    assert.match(html, /href="\/incidents\/synthetic-id"/);
  });
  await t.test('admin queue rows carry severity tone, urgency, waiting time and assignment', () => {
    const reporter = {
      id: 'employee-user-id',
      firstName: 'Originating',
      lastName: 'Employee',
      employeeIdentifier: 'EMP-024',
      department: { name: 'Finance' },
    };
    const row = { ...incident, assignee: person, reporter };
    const html = render(ui.IncidentResults, { items: [row], admin: true });
    assert.match(html, /Priority review/);
    assert.match(html, /Security Reviewer/);
    assert.match(html, /<ul class="incident-queue" aria-label="Security incident queue"/);
    assert.match(html, /class="incident-row incident-tone" data-severity="HIGH" data-open="true"/);
    assert.match(html, /Open for \d+[mhd]/);
    assert.match(html, /aria-label="Open INC-2026-000123"/);
    const handled = render(ui.IncidentResults, {
      items: [{ ...row, severity: 'CRITICAL', status: 'CLOSED', closedAt: '2026-10-10T12:00:00.000Z', assignee: null }],
      admin: true,
    });
    assert.match(handled, /data-severity="CRITICAL" data-open="false"/);
    assert.match(handled, /Critical risk/);
    assert.match(handled, /Handled in 2h/);
    assert.match(handled, /Unassigned/);
    assert.doesNotMatch(handled, /Immediate review/);
    assert.match(
      render(ui.IncidentResults, { items: [{ ...row, severity: 'BOGUS' }], admin: true }),
      /data-severity="NEUTRAL"/,
    );
    assert.match(html, /href="\/admin\/incidents\/synthetic-id"/);
    for (const text of ['Originating Employee', 'employee-user-id', 'EMP-024', 'Finance', 'Assigned administrator'])
      assert.ok(html.includes(text));
    const details = render(ui.IncidentOverview, { incident: row, admin: true });
    assert.match(details, /Lifecycle stage 1 of 5/);
    assert.match(details, /aria-current="step"[^>]*>(<[^>]+>)*New/);
    assert.match(details, /High risk · New · Priority review/);
    assert.match(details, /Reported By \/ Associated Employee/);
    assert.match(details, /employee-user-id/);
  });
  await t.test('system and unavailable history actors remain distinct', () => {
    const html = render(ui.IncidentHistory, {
      admin: true,
      items: [
        { id: 'system', type: 'CREATED', actorKind: 'SYSTEM', actor: null },
        { id: 'unknown', type: 'CREATED', actorKind: 'UNKNOWN', actor: null },
      ],
    });
    assert.match(html, /System/);
    assert.match(html, /Unknown User/);
  });
  await t.test('employee updates exclude private notes and escape hostile text', () => {
    const html = render(ui.IncidentNotes, {
      admin: false,
      items: [
        { id: 'private', visibility: 'SECURITY_TEAM', body: 'PRIVATE_SENTINEL' },
        { id: 'public', body: '<script>bad()</script>', createdAt: incident.createdAt, author: person },
      ],
    });
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script|PRIVATE_SENTINEL|Security Reviewer/);
  });
  await t.test('admin notes distinguish audiences and include returned author/timestamp', () => {
    const html = render(ui.IncidentNotes, {
      admin: true,
      items: [
        { id: 'a', visibility: 'SECURITY_TEAM', body: 'Internal', author: person, createdAt: incident.createdAt },
        { id: 'b', visibility: 'REPORTER', body: 'Shared' },
      ],
    });
    assert.match(html, /Security team only/);
    assert.match(html, /Employee-visible update/);
    assert.match(html, /Security Reviewer/);
    assert.match(html, /<time/);
  });
  await t.test('management controls default to internal and unchecked acknowledgement', () => {
    const { flow } = setup({ admin: true, id: incident.id });
    const html = render(actions.IncidentActions, {
      state: { ...flow.getSnapshot(), data: detail(), assignees: [person] },
      flow,
    });
    assert.match(html, /value="SECURITY_TEAM" selected=""/);
    assert.doesNotMatch(html, /checked=""/);
    assert.match(html, /disabled=""[^>]*>Review internal note/);
    assert.match(html, /data-status="UNDER_INVESTIGATION"[^>]*>Start investigation/);
    assert.match(html, /data-status="FALSE_POSITIVE"[^>]*>Mark false positive/);
    assert.doesNotMatch(html, /data-status="CLOSED"|Close incident/);
    assert.doesNotMatch(html, /Assign to me/);
    const mine = render(actions.IncidentActions, {
      state: { ...flow.getSnapshot(), data: detail(), assignees: [person] },
      flow,
      currentUserId: person.id,
    });
    assert.match(mine, /Assign to me/);
    assert.match(html, /reporting employee and security team/);
    assert.match(html, /Do not submit confidential/);
  });
  await t.test('loading, empty, failed, pagination and unavailable-risk states are explicit', () => {
    assert.match(render(ui.IncidentFeedback, { loading: true }), /role="status"/);
    assert.match(render(ui.IncidentFeedback, { error: 'Unavailable', retry() {} }), /role="alert"/);
    assert.match(render(ui.IncidentResults, { items: [] }), /No incidents found/);
    assert.match(render(ui.IncidentPager, { result: page([], 1, false), onPage() {} }), /disabled=""[^>]*>Next/);
    assert.match(render(ui.IncidentRisk, { incident: { severity: null } }), /Risk unavailable/);
  });
  await t.test('real routes expose role-specific pages and reject foreign roles', () => {
    const route = (path, role) =>
      renderToStaticMarkup(
        createElement(
          AuthContext.Provider,
          { value: { user: { id: 'fixture', role, firstName: 'Test', lastName: 'User' }, loading: false } },
          createElement(MemoryRouter, { initialEntries: [path] }, createElement(AppRoutes)),
        ),
      );
    const employeeList = route('/incidents', 'EMPLOYEE');
    assert.match(employeeList, /<h1[^>]*>My Incidents/);
    assert.match(employeeList, /id="filter-status"/);
    assert.match(employeeList, /All incidents/);
    assert.doesNotMatch(
      employeeList,
      /incident-reference|filter-severity|filter-source|incident-sort|Apply filters|Clear filters/,
    );
    assert.match(route('/incidents/synthetic-id', 'EMPLOYEE'), /Loading incident details/);
    assert.match(route('/admin/incidents', 'IT_SECURITY_ADMIN'), /<h1[^>]*>Incident Queue/);
    assert.match(route('/admin/incidents', 'IT_SECURITY_ADMIN'), /Sort all matching incidents/);
    assert.match(route('/admin/incidents', 'IT_SECURITY_ADMIN'), /filter-source/);
    const queue = route('/admin/incidents', 'IT_SECURITY_ADMIN');
    assert.match(queue, /class="incident-tone incident-page" data-severity="NEUTRAL"/);
    assert.match(queue, /aria-pressed="true"[^>]*>Open</);
    for (const text of ['Unassigned', 'Assigned to me', 'incident-search', 'Triage priority', 'Queue posture'])
      assert.ok(queue.includes(text), text);
    assert.doesNotMatch(employeeList, /Queue posture|incident-search|Assigned to me/);
    assert.doesNotMatch(route('/admin/incidents', 'IT_SECURITY_ADMIN'), /Sort this page|on this page/);
    assert.match(route('/admin/incidents/synthetic-id', 'IT_SECURITY_ADMIN'), /Investigation workspace/);
    assert.doesNotMatch(route('/admin/incidents', 'EMPLOYEE'), /<h1[^>]*>Incident Queue/);
    assert.doesNotMatch(route('/incidents', 'IT_SECURITY_ADMIN'), /<h1[^>]*>My Incidents/);
  });
  await t.test('risk explanations, normalized evidence, source and persisted assistance render together', () => {
    const analysisId = '11111111-1111-4111-8111-111111111111';
    const risk = {
      analyzerType: 'FILE',
      score: 60,
      riskLevel: 'HIGH',
      version: '1.0',
      confidence: 'LIMITED_CONFIDENCE',
      reasonCodes: ['FILE_CLAMAV_DETECTION'],
    };
    const row = {
      sourceKey: `FILE:${analysisId}`,
      detectionSource: 'FILE_ANALYSIS',
      riskRuleVersion: '1.0',
      riskScore: 60,
      severity: 'HIGH',
      evidence: [
        {
          snapshot: {
            analyzerType: 'FILE',
            analysisId,
            risk,
            scannerStatuses: { clamav: 'DETECTED', yara: 'UNAVAILABLE' },
            sha256: 'a'.repeat(64),
            sizeBytes: '12',
            assistance: buildIncidentAssistance({ analyzerType: 'FILE', riskResult: risk }),
          },
        },
      ],
    };
    const assessment = projectIncidentDetail(row, true);
    const html = render(assessmentUi.IncidentAssessment, { assessment, admin: true });
    for (const text of [
      'Confidence: Limited',
      'ClamAV returned',
      'Detected',
      analysisId,
      'Immediate actions',
      'SHA-256',
      'not a new scan',
    ])
      assert.ok(html.includes(text), text);
    const employee = render(assessmentUi.IncidentAssessment, { assessment, admin: false });
    assert.doesNotMatch(employee, /SHA-256|aaaaaaaa/);
  });
  await t.test('missing historical fields have explicit explanations, never fabricated guidance', () => {
    const assessment = projectIncidentDetail({ riskRuleVersion: '1.0', evidence: [] }, false);
    const html = render(assessmentUi.IncidentAssessment, { assessment, admin: false });
    assert.match(html, /not saved with this historical incident/);
    assert.match(html, /has not been regenerated/);
    assert.doesNotMatch(html, /Immediate actions|ClamAV returned/);
  });
});
