import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { createDatabaseClient } from '../../backend/src/config/database.js';
import { parseConfig, databaseUrl } from '../../backend/src/config/env.js';
import { createApp } from '../../backend/src/app.js';
import { authCookie, issueAccessToken } from '../../backend/src/auth/auth-token.js';

const time = '2026-10-20T10:00:00.000Z';
const record = {
  id: '123e4567-e89b-42d3-a456-426614174200',
  firstName: 'Amal',
  lastName: 'Hassan',
  email: 'amal@example.invalid',
  employeeIdentifier: 'EWA-1042',
  role: { name: 'EMPLOYEE' },
  department: { id: 'dept-1', name: 'Operations', code: 'OPS' },
  status: 'ACTIVE',
  createdAt: time,
  updatedAt: time,
  lastLoginAt: null,
  deletedAt: null,
};
const summary = { total: 42, active: 30, inactive: 5, suspended: 2, administrators: 3, invited: 5, deleted: 1 };
const list = { items: [record], total: 42, page: 1, pageSize: 20, hasMore: true };
const options = {
  departments: [record.department],
  roles: ['EMPLOYEE', 'IT_SECURITY_ADMIN'],
  statuses: ['ACTIVE', 'INVITED', 'DEACTIVATED', 'SUSPENDED'],
};
const profile = {
  accountSecurity: {
    credentialStatus: 'CONFIGURED',
    mfaStatus: 'NOT_REQUIRED',
    setupState: 'COMPLETE',
    setupExpiresAt: null,
    events: [
      {
        id: 'event-1',
        action: 'LOGIN_SUCCEEDED',
        outcome: 'SUCCESS',
        actorKind: 'USER',
        actor: { firstName: 'Amal', lastName: 'Hassan' },
        createdAt: time,
      },
    ],
  },
  security: {
    analyses: { total: 7, email: 3, url: 2, file: 2 },
    incidents: {
      total: 2,
      bySeverity: [
        { value: 'LOW', count: 1 },
        { value: 'MEDIUM', count: 0 },
        { value: 'HIGH', count: 1 },
        { value: 'CRITICAL', count: 0 },
      ],
      byStatus: [
        { value: 'NEW', count: 1 },
        { value: 'UNDER_INVESTIGATION', count: 0 },
        { value: 'CONTAINED', count: 0 },
        { value: 'RESOLVED', count: 1 },
        { value: 'FALSE_POSITIVE', count: 0 },
        { value: 'CLOSED', count: 0 },
      ],
      recent: [
        {
          id: 'incident-1',
          reference: 'INC-2026-000042',
          title: 'Reported phishing message',
          severity: 'HIGH',
          status: 'NEW',
          createdAt: time,
        },
      ],
    },
  },
  awareness: {
    training: {
      assigned: 2,
      completed: 1,
      completionPercent: 50,
      recent: [
        {
          id: 'assignment-1',
          trainingId: 'training-1',
          title: 'Phishing awareness',
          status: 'COMPLETED',
          progressPercent: 100,
          dueAt: null,
        },
      ],
    },
    monthlyQuizzes: { assigned: 3, participated: 2, participationPercent: 67 },
    certificates: { earned: 1, recent: [{ id: 'certificate-1', trainingTitle: 'Phishing awareness', issuedAt: time }] },
  },
};
const reply = (data, status = 200) => Response.json(data, { status });
const failure = (status, code, message = 'Request rejected') => reply({ error: { code, message } }, status);

test('User Management B: directory and secure account controls', async (t) => {
  const originalFetch = globalThis.fetch;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Node',
    'Event',
    'MutationObserver',
    'CustomEvent',
  ])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  const { render, screen, fireEvent, cleanup, within, waitFor } = await import('@testing-library/react');
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  const { UserManagementPage } = await vite.ssrLoadModule('/src/features/users/UserManagementPage.jsx');
  const { AuthContext } = await vite.ssrLoadModule('/src/context/auth-context.js');
  const { ToastContext } = await vite.ssrLoadModule('/src/context/toast.js');
  const { AppRoutes } = await vite.ssrLoadModule('/src/App.jsx');
  const notices = [],
    calls = [];
  let writes,
    customGet,
    logoutCount = 0;
  function mock() {
    calls.length = 0;
    notices.length = 0;
    writes = null;
    customGet = null;
    globalThis.fetch = async (path, request = {}) => {
      calls.push({ path, request });
      if (request.method === 'POST') return writes ? writes(path, JSON.parse(request.body)) : reply({ user: record });
      if (customGet) {
        const result = customGet(path, request);
        if (result) return result;
      }
      if (path === '/api/admin/users/summary') return reply(summary);
      if (path === '/api/admin/users/options') return reply(options);
      if (path.startsWith('/api/admin/users?'))
        return reply({ ...list, page: Number(new URL(path, 'http://localhost').searchParams.get('page')) });
      if (path === `/api/admin/users/${record.id}/profile`) return reply({ user: record, profile });
      return reply({ user: record });
    };
  }
  function providers(child, sessionRole = 'IT_SECURITY_ADMIN') {
    return createElement(
      AuthContext.Provider,
      {
        value: {
          user: { id: 'operator', firstName: 'Admin', lastName: 'Fixture', role: sessionRole },
          loading: false,
          logout: async () => {
            logoutCount++;
          },
        },
      },
      createElement(ToastContext.Provider, { value: { showToast: (notice) => notices.push(notice) } }, child),
    );
  }
  const mount = () => render(createElement(MemoryRouter, null, providers(createElement(UserManagementPage))));
  // Assert DOM absence as a boolean: failed equality assertions can serialize
  // React's cyclic DOM/fiber graph and exhaust memory during waitFor retries.
  const ready = async () => {
    await screen.findByText('Showing 1–1 of 42 users');
  };
  async function action(label) {
    fireEvent.click(screen.getAllByRole('button', { name: `Actions for ${record.firstName} ${record.lastName}` })[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: label }));
    return screen.findByRole('dialog');
  }
  function fill() {
    for (const [label, value] of [
      ['First name', 'Sara'],
      ['Last name', 'Ali'],
      ['Work email', 'sara@example.invalid'],
      ['Employee ID', 'EWA-1050'],
    ])
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/^Department/), { target: { value: 'dept-1' } });
  }
  t.beforeEach(() => mock());
  t.afterEach(() => cleanup());
  t.after(async () => {
    cleanup();
    globalThis.fetch = originalFetch;
    await vite.close();
    dom.window.close();
  });

  await t.test('directory displays API values, meaningful status badges and both responsive structures', async () => {
    mount();
    assert.ok(screen.getByRole('status', { name: 'Loading user directory' }));
    await ready();
    const overview = screen.getByRole('region', { name: 'Account overview' });
    for (const [label, value] of [
      ['Total users', '42'],
      ['Active users', '30'],
      ['Inactive / suspended', '7'],
      ['Administrators', '3'],
    ])
      assert.ok(within(within(overview).getByText(label).closest('section')).getByText(value));
    const table = screen.getByRole('table', { name: 'User directory' });
    for (const value of [
      'Amal Hassan',
      'EWA-1042',
      'amal@example.invalid',
      'Operations',
      'Employee',
      'Active',
      'Not recorded',
    ])
      assert.ok(within(table).getByText(value));
    assert.ok(document.querySelector('.users-card-view article'));
    assert.ok(document.querySelector('.users-table-view'));
    assert.ok(calls.every((call) => call.request.credentials === 'include'));
  });
  await t.test('debounced search, filters, sorting and pagination use server query parameters', async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Showing 21–21 of 42 users');
    const search = screen.getByRole('searchbox', { name: 'Search users' });
    fireEvent.change(search, { target: { value: 'A' } });
    fireEvent.change(search, { target: { value: 'Amal Hassan' } });
    await waitFor(() => assert.ok(calls.some((call) => call.path.includes('search=Amal+Hassan'))));
    assert.equal(calls.filter((call) => /[?&]search=A&/.test(call.path)).length, 0);
    const searchRequest = calls.findLast((call) => call.path.includes('search=Amal+Hassan'));
    assert.equal(new URL(searchRequest.path, 'http://localhost').searchParams.get('page'), '1');
    fireEvent.change(screen.getByLabelText('Filter by department'), { target: { value: 'dept-1' } });
    fireEvent.change(screen.getByLabelText('Filter by role'), { target: { value: 'EMPLOYEE' } });
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'SUSPENDED' } });
    fireEvent.change(screen.getByLabelText('Sort users'), { target: { value: 'lastLoginAt:desc' } });
    fireEvent.change(screen.getByLabelText('Users per page'), { target: { value: '50' } });
    await waitFor(() => assert.ok(calls.some((call) => call.path.includes('pageSize=50'))));
    const params = new URL(calls.findLast((call) => call.path.includes('pageSize=50')).path, 'http://localhost')
      .searchParams;
    for (const [key, value] of [
      ['departmentId', 'dept-1'],
      ['role', 'EMPLOYEE'],
      ['status', 'SUSPENDED'],
      ['sort', 'lastLoginAt'],
      ['direction', 'desc'],
      ['page', '1'],
    ])
      assert.equal(params.get(key), value);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => assert.equal(screen.getByLabelText('Filter by status').value, ''));
    assert.equal(search.value, '');
    assert.equal(calls.filter((call) => call.path === '/api/admin/users/options').length, 1);
  });
  await t.test('late search responses cannot replace newer results', async () => {
    let release;
    customGet = (path) =>
      path.includes('search=old')
        ? new Promise((resolve) => {
            release = resolve;
          })
        : path.includes('search=new')
          ? reply({ ...list, items: [{ ...record, firstName: 'Newest' }] })
          : null;
    mount();
    await ready();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'old' } });
    await waitFor(() => assert.ok(release));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'new' } });
    await screen.findAllByText('Newest Hassan');
    release(reply({ ...list, items: [{ ...record, firstName: 'Obsolete' }] }));
    await waitFor(() => assert.ok(!screen.queryByText('Obsolete Hassan')));
  });
  await t.test(
    'add form validates fields, handles duplicate identity, resets and never displays setup tokens',
    async () => {
      writes = () => failure(409, 'USER_EMAIL_EXISTS');
      mount();
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create employee' }));
      assert.ok(screen.getByText('Enter a valid work email address.'));
      assert.equal(calls.filter((call) => call.request.method === 'POST').length, 0);
      fill();
      fireEvent.click(screen.getByRole('button', { name: 'Create employee' }));
      await screen.findByText('This email is already assigned to an account.');
      writes = () => failure(409, 'USER_EMPLOYEE_ID_EXISTS');
      fireEvent.click(screen.getByRole('button', { name: 'Create employee' }));
      await screen.findByText('This employee ID is already assigned to an account.');
      writes = () =>
        reply(
          {
            user: { ...record, firstName: 'Sara', status: 'INVITED' },
            setup: { token: 'SECRET_SETUP_SENTINEL', expiresAt: time },
          },
          201,
        );
      fireEvent.click(screen.getByRole('button', { name: 'Create employee' }));
      await screen.findByText('Employee account created');
      assert.match(document.body.textContent, /Controlled demonstration only/);
      assert.doesNotMatch(document.body.textContent, /SECRET_SETUP_SENTINEL/);
      assert.equal(dom.window.localStorage.length, 0);
      assert.equal(dom.window.sessionStorage.length, 0);
      assert.doesNotMatch(JSON.stringify(notices), /SECRET_SETUP_SENTINEL/);
      const sent = JSON.parse(calls.findLast((call) => call.request.method === 'POST').request.body);
      assert.equal(sent.role, 'EMPLOYEE');
      assert.equal(sent.status, 'INVITED');
      assert.equal(sent.firstName, 'Sara');
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
      assert.equal(screen.getByLabelText(/^First name/).value, '');
    },
  );
  await t.test(
    'profile shows real security and awareness summaries without sensitive data; edits load latest values',
    async () => {
      mount();
      await ready();
      fireEvent.click(screen.getAllByRole('button', { name: 'Amal Hassan' })[0]);
      await screen.findByText(record.id);
      const dialog = screen.getByRole('dialog');
      for (const text of [
        'Account information',
        'Account security',
        'Security overview',
        'Security analyses',
        '7',
        'Associated incidents',
        '2',
        'INC-2026-000042',
        'Security awareness',
        'Training completion',
        '50%',
        'Earned certificates',
        'Phishing awareness',
      ])
        assert.ok(within(dialog).getAllByText(text).length);
      assert.ok(
        within(dialog)
          .getByRole('link', { name: 'INC-2026-000042' })
          .getAttribute('href')
          .endsWith('/admin/incidents/incident-1'),
      );
      assert.doesNotMatch(
        dialog.textContent,
        /Chat history|passwordHash|mfaSecret|setupToken|PRIVATE_DESCRIPTION|PRIVATE_FILE_CONTENT/,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
      await screen.findByLabelText(/^First name/);
      assert.equal(screen.getByLabelText(/^First name/).value, 'Amal');
      fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: 'Updated' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => assert.ok(!screen.queryByRole('dialog')));
      const call = calls.find((item) => item.path.endsWith('/update'));
      const body = JSON.parse(call.request.body);
      assert.equal(body.expectedUpdatedAt, time);
      assert.equal(body.firstName, 'Updated');
      assert.equal(body.role, undefined);
      assert.equal(body.status, undefined);
    },
  );
  await t.test('setup link copy is transient and replacement issuance uses the current account version', async () => {
    const token = 'Z'.repeat(43),
      expiresAt = new Date(Date.now() + 3600000).toISOString();
    let copied = '';
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => {
          copied = value;
        },
      },
    });
    writes = () => reply({ user: { ...record, status: 'INVITED' }, setup: { token, expiresAt } }, 201);
    mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create employee' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy Setup Link' }));
    await screen.findByText('Setup link copied successfully.');
    assert.equal(copied, `http://localhost/account-setup#token=${token}`);
    assert.equal(document.body.textContent.includes(token), false);
    assert.equal(JSON.stringify(notices).includes(token), false);
    assert.equal(dom.window.localStorage.length, 0);
    assert.equal(dom.window.sessionStorage.length, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    assert.ok(!screen.queryByRole('button', { name: 'Copy Setup Link' }));
    cleanup();
    customGet = (path) =>
      path.endsWith('/options')
        ? reply({ ...options, manualSetupEnabled: true })
        : path.includes('/users?')
          ? reply({ ...list, items: [{ ...record, status: 'INVITED' }] })
          : path.endsWith(record.id)
            ? reply({ user: { ...record, status: 'INVITED' } })
            : null;
    mount();
    await ready();
    await action('Generate New Setup Link');
    fireEvent.click(await screen.findByRole('button', { name: 'Generate New Setup Link' }));
    await screen.findByRole('button', { name: 'Copy Setup Link' });
    const replacement = calls.findLast((call) => call.path.endsWith('/setup'));
    assert.deepEqual(JSON.parse(replacement.request.body), { expectedUpdatedAt: time });
  });
  await t.test('sensitive status actions require confirmation and do not submit twice while saving', async () => {
    let release;
    writes = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    mount();
    await ready();
    await action('Suspend account');
    await screen.findByText('Temporarily suspend access');
    assert.equal(calls.filter((call) => call.request.method === 'POST').length, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Suspend account' }));
    assert.equal(screen.getByRole('button', { name: 'Applying…' }).disabled, true);
    assert.equal(screen.getByRole('button', { name: 'Cancel' }).disabled, true);
    assert.equal(JSON.parse(calls.findLast((call) => call.request.method === 'POST').request.body).status, 'SUSPENDED');
    fireEvent(screen.getByRole('dialog'), new dom.window.Event('cancel', { cancelable: true }));
    assert.ok(screen.getByRole('dialog'));
    release(reply({ user: { ...record, status: 'SUSPENDED' } }));
    await waitFor(() => assert.ok(!screen.queryByRole('dialog')));
  });
  await t.test('soft deletion requires exact identifier and explains retained records', async () => {
    mount();
    await ready();
    await action('Remove account');
    await screen.findByText('Remove access and retain records');
    assert.match(
      screen.getByRole('dialog').textContent,
      /not permanent deletion|Restoring removed accounts is not supported/,
    );
    const button = screen.getByRole('button', { name: 'Remove account' });
    assert.equal(button.disabled, true);
    fireEvent.change(screen.getByLabelText(/^Type the employee ID/), { target: { value: 'wrong' } });
    assert.equal(button.disabled, true);
    fireEvent.change(screen.getByLabelText(/^Type the employee ID/), { target: { value: record.employeeIdentifier } });
    fireEvent.click(button);
    await waitFor(() => assert.ok(!screen.queryByRole('dialog')));
    assert.deepEqual(JSON.parse(calls.findLast((call) => call.request.method === 'POST').request.body), {
      expectedUpdatedAt: time,
      confirmation: record.employeeIdentifier,
    });
  });
  await t.test('reauthentication and last-administrator denials stay visible without bypassing backend', async () => {
    mount();
    await ready();
    await action('Change role');
    await screen.findByLabelText('New account role');
    writes = () => failure(403, 'USER_REAUTH_REQUIRED');
    fireEvent.click(screen.getByRole('button', { name: 'Change account role' }));
    await screen.findByText(/For account security, sign out/);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out to verify again' }));
    assert.equal(logoutCount, 1);
    writes = () => failure(409, 'USER_LAST_ADMIN');
    fireEvent.click(screen.getByRole('button', { name: 'Change account role' }));
    await screen.findByText(/This change would remove the last active administrator/);
    assert.equal(
      JSON.parse(calls.findLast((call) => call.request.method === 'POST').request.body).role,
      'IT_SECURITY_ADMIN',
    );
  });
  await t.test('stale edit can reload latest data; keyboard menu and dialog cancellation restore focus', async () => {
    mount();
    await ready();
    const trigger = screen.getAllByRole('button', { name: 'Actions for Amal Hassan' })[0];
    trigger.focus();
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    assert.equal(document.activeElement.textContent, 'View account');
    fireEvent.keyDown(menu, { key: 'End' });
    assert.equal(document.activeElement.textContent, 'Remove account');
    fireEvent.keyDown(menu, { key: 'Escape' });
    assert.ok(!screen.queryByRole('menu'));
    assert.ok(document.activeElement === trigger);
    await action('Edit details');
    await screen.findByLabelText(/^First name/);
    writes = () => failure(409, 'USER_CONFLICT');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('button', { name: 'Reload account' });
    const before = calls.filter((call) => call.path === `/api/admin/users/${record.id}`).length;
    fireEvent.click(screen.getByRole('button', { name: 'Reload account' }));
    await screen.findByLabelText(/^First name/);
    assert.equal(calls.filter((call) => call.path === `/api/admin/users/${record.id}`).length, before + 1);
    fireEvent(screen.getByRole('dialog'), new dom.window.Event('cancel', { cancelable: true }));
    assert.ok(!screen.queryByRole('dialog'));
  });
  await t.test('empty, failure, retry and denied-access states are useful', async () => {
    customGet = (path) => (path.includes('/users?') ? failure(503, 'INTERNAL_ERROR', 'PRIVATE_STACK_SENTINEL') : null);
    mount();
    await screen.findByText('Unable to load users');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_STACK_SENTINEL/);
    customGet = (path) => (path.includes('/users?') ? reply({ ...list, items: [], total: 0, hasMore: false }) : null);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No accounts to display');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'absent' } });
    await screen.findByText('No users match your search');
    customGet = (path) => (path.includes('/users?') ? failure(403, 'FORBIDDEN') : null);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh users' }));
    await screen.findByText('Administrator access required');
  });
  await t.test('Users navigation and route remain administrator-only', () => {
    const html = (role) =>
      renderToStaticMarkup(
        createElement(MemoryRouter, { initialEntries: ['/admin/users'] }, providers(createElement(AppRoutes), role)),
      );
    assert.match(html('IT_SECURITY_ADMIN'), /href="\/admin\/users"/);
    assert.match(html('IT_SECURITY_ADMIN'), /User Management/);
    assert.doesNotMatch(html('EMPLOYEE'), /User Management|User directory/);
  });

  await t.test(
    'real PostgreSQL and Express: directory, create, edit, deactivate, activate and remove through rendered UI',
    async () => {
      const url = new URL(databaseUrl());
      assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
      assert.equal(url.pathname, '/ewaguard_ai');
      const db = createDatabaseClient(),
        ids = [];
      const config = parseConfig({
        NODE_ENV: 'test',
        JWT_SECRET: 'user-directory-ui-test-secret-long-enough',
        FRONTEND_URL: 'http://127.0.0.1:5173',
      });
      const server = createApp(config, { database: db }).listen(0, '127.0.0.1');
      await once(server, 'listening');
      try {
        const admin = await db.user.create({
          data: {
            firstName: 'UI',
            lastName: 'Operator',
            email: `${randomUUID()}@example.invalid`,
            status: 'ACTIVE',
            passwordHash: 'synthetic-not-a-login-password',
            role: { connect: { name: 'IT_SECURITY_ADMIN' } },
            mfaEnabledAt: new Date(),
            mfaSecretEncrypted: 'synthetic',
            mfaLastCounter: 0n,
          },
        });
        ids.push(admin.id);
        const cookie = `${authCookie(config).name}=${issueAccessToken(admin.id, config, admin.mfaEnabledAt)}`;
        globalThis.fetch = (path, request = {}) =>
          originalFetch(`http://127.0.0.1:${server.address().port}${path}`, {
            ...request,
            headers: { ...request.headers, Origin: config.frontendUrl, Cookie: cookie },
          });
        mount();
        await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Add User' }).disabled, false));
        fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
        const email = `${randomUUID()}@example.invalid`,
          employeeIdentifier = `UI-${randomUUID()}`;
        for (const [label, value] of [
          ['First name', 'Directory'],
          ['Last name', 'Integration'],
          ['Work email', email],
          ['Employee ID', employeeIdentifier],
        ])
          fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
        const department = await db.department.findFirstOrThrow({ select: { id: true } });
        fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/^Department/), {
          target: { value: department.id },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create employee' }));
        await screen.findByText('Employee account created');
        const created = await db.user.findUniqueOrThrow({ where: { email } });
        ids.push(created.id);
        assert.equal(created.status, 'INVITED');
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: email } });
        await screen.findByText('Showing 1–1 of 1 users');
        async function choose(label) {
          fireEvent.click(screen.getAllByRole('button', { name: 'Actions for Directory Integration' })[0]);
          fireEvent.click(screen.getByRole('menuitem', { name: label }));
          await screen.findByRole('dialog');
        }
        await choose('Edit details');
        await screen.findByLabelText(/^First name/);
        fireEvent.change(screen.getByLabelText(/^Employee ID/), { target: { value: `${employeeIdentifier}-EDIT` } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => assert.ok(!screen.queryByRole('dialog')));
        await screen.findByText('Showing 1–1 of 1 users');
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: created.id } })).employeeIdentifier,
          `${employeeIdentifier}-EDIT`.toUpperCase(),
        );
        for (const [label, heading, button, status] of [
          ['Deactivate account', 'Deactivate this account', 'Deactivate account', 'DEACTIVATED'],
          ['Activate account', 'Restore account access', 'Activate account', 'INVITED'],
          ['Suspend account', 'Temporarily suspend access', 'Suspend account', 'SUSPENDED'],
        ]) {
          await choose(label);
          await screen.findByText(heading);
          fireEvent.click(screen.getByRole('button', { name: button }));
          await waitFor(() => assert.ok(!screen.queryByRole('dialog')));
          await screen.findByText('Showing 1–1 of 1 users');
          assert.equal((await db.user.findUniqueOrThrow({ where: { id: created.id } })).status, status);
        }
        await choose('Remove account');
        await screen.findByLabelText(/^Type the employee ID/);
        fireEvent.change(screen.getByLabelText(/^Type the employee ID/), {
          target: { value: `${employeeIdentifier}-EDIT`.toUpperCase() },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Remove account' }));
        await screen.findByText('No users match your search');
        assert.ok((await db.user.findUniqueOrThrow({ where: { id: created.id } })).deletedAt);
        fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'DELETED' } });
        await screen.findByText('Showing 1–1 of 1 users');
        await choose('View account');
        await screen.findByText(/Restoring removed accounts is not supported/);
        assert.ok(!within(screen.getByRole('dialog')).queryByRole('button', { name: 'Edit details' }));
      } finally {
        cleanup();
        await new Promise((resolve) => server.close(resolve));
        await db.auditLog.deleteMany({
          where: { OR: [{ actorId: { in: ids } }, { resourceType: 'USER', resourceId: { in: ids } }] },
        });
        await db.user.deleteMany({ where: { id: { in: ids } } });
        await db.$disconnect();
      }
    },
  );
});
