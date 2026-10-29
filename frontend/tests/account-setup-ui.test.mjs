import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { captureSetupToken, passwordIssue } from '../src/features/setup/setup-link.js';
import { createDatabaseClient } from '../../backend/src/config/database.js';
import { parseConfig, databaseUrl } from '../../backend/src/config/env.js';
import { createApp } from '../../backend/src/app.js';
import { authCookie, issueAccessToken } from '../../backend/src/auth/auth-token.js';

test('fragment capture removes the credential and query from history; password limits are enforced', () => {
  const token = 'a'.repeat(43), dom = new JSDOM('', { url: `http://localhost/account-setup#token=${token}` });
  assert.equal(captureSetupToken(dom.window.location, dom.window.history), token);
  assert.equal(dom.window.location.href, 'http://localhost/account-setup');
  assert.equal(captureSetupToken(dom.window.location, dom.window.history), '');
  assert.ok(passwordIssue('short', 'short')); assert.ok(passwordIssue('é'.repeat(37), 'é'.repeat(37)));
  assert.equal(passwordIssue('long-enough-password', 'different'), 'The passwords do not match.');
  dom.window.close();
});

test('employee onboarding UI and real database activation', async (t) => {
  const originalFetch = globalThis.fetch;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/account-setup' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { AccountSetupPage } = await vite.ssrLoadModule('/src/features/setup/AccountSetupPage.jsx');
  const token = 'a'.repeat(43), calls = [];
  t.afterEach(cleanup);
  t.after(async () => { cleanup(); globalThis.fetch = originalFetch; await vite.close(); dom.window.close(); });
  const mount = (value = token) => render(createElement(AccountSetupPage, { initialToken: value }));
  const fill = (password, confirmation = password) => {
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: password } });
    fireEvent.change(screen.getByLabelText(/^Confirm password/), { target: { value: confirmation } });
  };
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Complete Account Setup' }));
  await t.test('validation, strength feedback, visibility, matching and successful normal-login handoff', async () => {
    globalThis.fetch = async (path, options) => { calls.push({ path, options }); return Response.json(path.endsWith('/validate') ? { valid: true } : { completed: true }); };
    mount(); await screen.findByLabelText(/^New password/);
    fill('short'); submit(); await screen.findByText('Use at least 12 characters and no more than 72 UTF-8 bytes.');
    assert.equal(calls.filter((call) => call.path === '/api/auth/setup').length, 0);
    fill('passwordpassword'); submit(); await screen.findByText('Choose a less predictable password. Try a longer, unique passphrase with unrelated words.');
    assert.equal(calls.filter((call) => call.path === '/api/auth/setup').length, 0);
    fill('River-constellation-orbit-84!', 'different'); submit(); await screen.findByText('The passwords do not match.');
    assert.equal(calls.filter((call) => call.path === '/api/auth/setup').length, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Show new password' })); assert.equal(screen.getByLabelText(/^New password/).type, 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide new password' })); assert.equal(screen.getByLabelText(/^New password/).type, 'password');
    fill('River-constellation-orbit-84!'); submit(); await screen.findByText('Account Setup Complete');
    assert.equal(screen.getByRole('link', { name: 'Go to Login' }).getAttribute('href'), '/login');
    assert.ok(!screen.queryByLabelText(/^New password/));
    for (const call of calls) { assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.referrerPolicy, 'no-referrer'); assert.equal(call.options.credentials, 'omit'); }
    assert.equal(dom.window.localStorage.length, 0); assert.equal(dom.window.sessionStorage.length, 0);
    assert.equal(dom.window.document.body.textContent.includes(token), false);
  });
  await t.test('missing, invalid, expired and unavailable links provide safe recovery', async () => {
    let requests = 0;
    globalThis.fetch = async () => { requests++; return Response.json({ error: { code: 'SETUP_INVALID' } }, { status: 400 }); };
    mount(''); await screen.findByText('Setup link unavailable'); assert.equal(requests, 0); cleanup();
    mount(); await screen.findByText('Setup link unavailable'); assert.ok(!screen.queryByLabelText(/^New password/)); cleanup();
    globalThis.fetch = async () => Response.json({ error: { code: 'INTERNAL_ERROR', message: 'PRIVATE_STACK' } }, { status: 500 });
    mount(); await screen.findByRole('button', { name: 'Try again' }); assert.equal(dom.window.document.body.textContent.includes('PRIVATE_STACK'), false);
    globalThis.fetch = async () => Response.json({ valid: true }); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); await screen.findByLabelText(/^New password/);
  });
  await t.test('real PostgreSQL: authorized issuance, setup via rendered page, normal login and replay denial', async () => {
    const url = new URL(databaseUrl()); assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
    const db = createDatabaseClient(), ids = [];
    const config = parseConfig({ NODE_ENV: 'test', DEMO_ACCOUNT_SETUP_ENABLED: 'true', JWT_SECRET: 'setup-ui-fixture-secret-with-enough-length', FRONTEND_URL: 'http://127.0.0.1:5173' });
    const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const admin = await db.user.create({ data: { firstName: 'Setup', lastName: 'Operator', email: `${randomUUID()}@example.invalid`, status: 'ACTIVE', passwordHash: 'synthetic', role: { connect: { name: 'IT_SECURITY_ADMIN' } }, mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } }); ids.push(admin.id);
      const department = await db.department.findFirstOrThrow({ select: { id: true } });
      const createdResponse = await originalFetch(`${base}/api/admin/users`, { method: 'POST', headers: { Origin: config.frontendUrl, 'Content-Type': 'application/json', Cookie: `${authCookie(config).name}=${issueAccessToken(admin.id, config, admin.mfaEnabledAt)}` },
        body: JSON.stringify({ firstName: 'Setup', lastName: 'Participant', email: `${randomUUID()}@example.invalid`, employeeIdentifier: `DEMO-${randomUUID()}`, departmentId: department.id, role: 'EMPLOYEE' }) });
      assert.equal(createdResponse.status, 201); const created = await createdResponse.json(); ids.push(created.user.id);
      const password = `River-${randomUUID()}!`;
      globalThis.fetch = (path, options = {}) => originalFetch(`${base}${path}`, { ...options, headers: { ...options.headers, Origin: config.frontendUrl } });
      const before = await globalThis.fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: created.user.email, password }) }); assert.equal(before.status, 401);
      dom.window.history.replaceState(null, '', `/account-setup#token=${created.setup.token}`);
      mount(captureSetupToken(dom.window.location, dom.window.history)); await screen.findByLabelText(/^New password/);
      fill(password); submit(); await screen.findByText('Account Setup Complete');
      const stored = await db.user.findUniqueOrThrow({ where: { id: created.user.id } });
      assert.equal(stored.status, 'ACTIVE'); assert.equal(stored.setupTokenHash, null); assert.notEqual(stored.passwordHash, password);
      const login = await globalThis.fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: created.user.email, password }) }); assert.equal(login.status, 200);
      cleanup(); mount(created.setup.token); await screen.findByText('Setup link unavailable');
      assert.equal(dom.window.location.hash, ''); assert.equal(dom.window.localStorage.length, 0); assert.equal(dom.window.sessionStorage.length, 0);
    } finally {
      cleanup(); await new Promise((resolve) => server.close(resolve));
      await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { resourceId: { in: ids } }] } });
      await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect();
    }
  });
});
