import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router';

test('audit identity, paging, authorization feedback and copy controls', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { AuditLogsPage } = await vite.ssrLoadModule('/src/features/audit/AuditLogsPage.jsx');
  const { AppRoutes } = await vite.ssrLoadModule('/src/App.jsx');
  const { AuthContext } = await vite.ssrLoadModule('/src/context/auth-context.js');
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(cleanup);
  const createdAt = '2026-10-20T10:00:00Z', incident = '123e4567-e89b-42d3-a456-426614174200';
  const base = { createdAt, resourceType: 'INCIDENT', resourceId: incident, outcome: 'SUCCESS' };
  const data = { page: 1, pageSize: 20, total: 43, totalPages: 3, hasMore: true, items: [
    { ...base, id: 'log-human', action: 'INCIDENT_STATUS_CHANGED', actorId: 'actor-admin', actorKind: 'USER',
      actor: { id: 'actor-admin', firstName: 'Security', lastName: 'Reviewer', role: { name: 'IT_SECURITY_ADMIN' } } },
    { ...base, id: 'log-system', action: 'INCIDENT_CREATED', actorId: null, actor: null, actorKind: 'SYSTEM' },
    { ...base, id: 'log-unknown', action: 'LOGIN_FAILED', actorId: null, actor: null, actorKind: 'UNKNOWN' },
  ] };
  const mount = () => render(createElement(MemoryRouter, null, createElement(AuditLogsPage)));
  await t.test('actor, role, system, unknown and related resource are distinct and IDs copy correctly', async () => {
    const copies = [], calls = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => copies.push(value) } });
    globalThis.fetch = async (path, options) => { calls.push([path, options]); return Response.json(data); };
    mount(); await screen.findByText('Security Reviewer');
    assert.equal(calls[0][0], '/api/admin/audit?page=1&pageSize=20');
    assert.ok(screen.getByText('Page 1 of 3'));
    assert.equal(calls[0][1].credentials, 'include');
    assert.ok(screen.getByText('Administrator'));
    assert.ok(screen.getAllByText('System').length > 0);
    assert.ok(screen.getByText('Unknown User'));
    assert.ok(screen.getByText('actor-admin'));
    assert.ok(screen.getByText('log-human'));
    assert.ok(screen.getAllByRole('link', { name: 'View incident' }).every((link) => link.getAttribute('href') === `/admin/incidents/${incident}`));
    fireEvent.click(screen.getByRole('button', { name: 'Copy User ID actor-admin' }));
    await waitFor(() => assert.deepEqual(copies, ['actor-admin']));
    globalThis.fetch = async (path) => { calls.push([path]); return Response.json({ page: 2, pageSize: 20, total: 21, totalPages: 2, hasMore: false, items: [] }); };
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('No audit records available.');
    assert.equal(calls.at(-1)[0], '/api/admin/audit?page=2&pageSize=20');
    assert.ok(screen.getByText('Page 2 of 2'));
    assert.ok(screen.getByRole('button', { name: 'Next' }).disabled);
  });
  await t.test('failure retries safely; denied refresh removes previously displayed identities', async () => {
    let mode = 'failure';
    globalThis.fetch = async () => mode === 'ok' ? Response.json(data) : Response.json({ error: { message: 'PRIVATE_ERROR' } }, { status: mode === 'failure' ? 500 : 403 });
    mount(); await screen.findByText('Audit logs could not be loaded. Try again.');
    assert.doesNotMatch(dom.window.document.body.textContent, /PRIVATE_ERROR/);
    mode = 'ok'; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Security Reviewer');
    mode = 'denied'; fireEvent.click(screen.getByRole('button', { name: 'Refresh audit logs' }));
    await screen.findByText('Administrator access with verified MFA is required.');
    assert.doesNotMatch(dom.window.document.body.textContent, /Security Reviewer|actor-admin|PRIVATE_ERROR/);
  });
  await t.test('filters are applied server-side, reset paging, validate dates and can be cleared', async () => {
    const calls = [];
    globalThis.fetch = async (path) => { calls.push(path); return Response.json(data); };
    mount(); await screen.findByText('Security Reviewer');
    fireEvent.change(screen.getByLabelText('Action contains'), { target: { value: 'USER_UPDATED' } });
    fireEvent.change(screen.getByLabelText('Resource type contains'), { target: { value: 'USER' } });
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'SUCCESS' } });
    fireEvent.change(screen.getByLabelText('Actor source'), { target: { value: 'USER' } });
    fireEvent.change(screen.getByLabelText(/From date/), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText(/To date/), { target: { value: '2026-10-19' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Apply filters' }).closest('form'));
    assert.ok(screen.getByText('Start date must be on or before end date.'));
    assert.equal(calls.length, 1);
    fireEvent.change(screen.getByLabelText(/To date/), { target: { value: '2026-10-21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => assert.equal(calls.length, 2));
    const params = new URL(calls[1], 'http://localhost').searchParams;
    for (const [key, value] of [['page', '1'], ['pageSize', '20'], ['action', 'USER_UPDATED'], ['resourceType', 'USER'],
      ['outcome', 'SUCCESS'], ['actorScope', 'USER'], ['start', '2026-10-20'], ['end', '2026-10-21']]) assert.equal(params.get(key), value);
    assert.ok(screen.getByText('Filters applied'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => assert.equal(calls.at(-1), '/api/admin/audit?page=1&pageSize=20'));
    assert.equal(screen.getByLabelText('Action contains').value, '');
  });
  await t.test('employee cannot render the new audit route or its navigation', async () => {
    globalThis.fetch = async () => { throw new Error('Employee must not fetch audit data'); };
    const route = (role) => renderToStaticMarkup(createElement(AuthContext.Provider,
      { value: { user: { id: 'fixture', role, firstName: 'Test', lastName: 'User' }, loading: false } },
      createElement(MemoryRouter, { initialEntries: ['/admin/audit'] }, createElement(AppRoutes))));
    assert.doesNotMatch(route('EMPLOYEE'), /Audit Logs|Loading audit logs/);
    const admin = route('IT_SECURITY_ADMIN');
    assert.match(admin, /Loading audit logs/);
    assert.match(admin, /href="\/admin\/audit"/);
  });
});
