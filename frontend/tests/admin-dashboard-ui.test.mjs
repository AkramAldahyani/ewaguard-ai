import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router';

const incidentId = '123e4567-e89b-42d3-a456-426614174200';
const notificationId = '123e4567-e89b-42d3-a456-426614174201';
const postId = '123e4567-e89b-42d3-a456-426614174202';
const time = '2026-10-11T10:00:00.000Z';
const metrics = {
  employees: { active: 37 }, incidents: { total: 25, open: 8, highOpen: 3, criticalOpen: 2, awaitingAssignment: 4 },
  awareness: { publishedPrograms: 6, assignedEmployees: 21, activeAssignments: 40, completedAssignments: 15,
    inProgressAssignments: 11, publishedMonthlyQuizzes: 3, monthlyParticipations: 19, monthlySubmitted: 12, certificatesIssued: 9 },
  community: { pendingPosts: 5 },
};
const notification = { id: notificationId, incidentId, reference: 'INC-2026-000025', kind: 'INCIDENT_CREATED',
  title: 'Urgent incident update', message: 'Private details', severity: 'CRITICAL', createdAt: time, readAt: null };
const overview = { generatedAt: time, metrics, recentIncidents: [{ id: incidentId, reference: 'INC-2026-000025',
  status: 'NEW', severity: 'CRITICAL', urgent: true, assigneeName: null, createdAt: time }],
pendingPosts: [{ id: postId, title: 'Spot impersonation attempts', category: 'PHISHING', authorName: 'Alex B.', submittedAt: time }],
notifications: { unreadCount: 2, items: [notification] } };
const reply = (body, status = 200) => Response.json(body, { status });

test('Phase 13A2 administrator dashboard interface', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  const { render, screen, fireEvent, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { AdminDashboardPage } = await vite.ssrLoadModule('/src/features/dashboard/AdminDashboardPage.jsx');
  const { NotificationContext } = await vite.ssrLoadModule('/src/features/notifications/notification-context.js');
  const mount = (flow = null) => render(createElement(MemoryRouter, null,
    createElement(NotificationContext.Provider, { value: flow }, createElement(AdminDashboardPage))));
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(() => cleanup());

  await t.test('fetches authenticated overview and renders exact metrics, previews and destinations', async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => { calls.push([path, options]); return reply(overview); };
    mount();
    assert.ok(screen.getByRole('status', { name: 'Loading administrator dashboard' }));
    await screen.findByText('Spot impersonation attempts');
    assert.equal(calls[0][0], '/api/admin/dashboard');
    assert.equal(calls[0][1].credentials, 'include');
    const kpis = screen.getByRole('region', { name: 'Security operations metrics' });
    for (const [name, number] of [['Active employees', '37'], ['Total incidents', '25'], ['Open incidents', '8'],
      ['High priority open', '3'], ['Critical priority open', '2'], ['Awaiting assignment', '4']]) {
      assert.match(within(within(kpis).getByText(name).closest('section')).getByText(number).textContent, new RegExp(number));
    }
    const incidentLink = screen.getAllByRole('link', { name: 'INC-2026-000025' })[0];
    assert.equal(incidentLink.getAttribute('href'), `/admin/incidents/${incidentId}`);
    assert.match(document.body.textContent, /Unassigned|Critical risk|New|Urgent incident update|2 unread/);
    assert.ok(screen.getByRole('link', { name: 'Open incident queue' }).getAttribute('href') === '/admin/incidents');
    assert.ok(screen.getAllByRole('link', { name: 'INC-2026-000025' }).every((link) => link.getAttribute('href') === `/admin/incidents/${incidentId}`));
    for (const [name, href] of [['Training programs', '/admin/training'], ['Monthly quizzes', '/admin/monthly-quizzes'],
      ['Certificates', '/admin/certificates'], ['Open moderation', '/admin/community']])
      assert.equal(screen.getByRole('link', { name }).getAttribute('href'), href);
    assert.match(document.body.textContent, /Published programs|Completed assignments|Monthly submissions|Certificates issued|Phishing|Alex B\./);
    assert.doesNotMatch(document.body.textContent, /Private details/);
    assert.ok(document.querySelector('.grid.gap-3.sm\\:grid-cols-2'));
  });

  await t.test('existing notification flow supplies current unread count and marks on navigation', async () => {
    const reads = [];
    const live = { items: [{ ...notification, title: 'Current live alert' }], unreadCount: 4, loading: false, error: '' };
    const flow = { subscribe: () => () => {}, getSnapshot: () => live, read: (id) => reads.push(id) };
    globalThis.fetch = async () => reply(overview);
    mount(flow); await screen.findByText('Current live alert');
    assert.match(document.body.textContent, /4 unread/);
    fireEvent.click(screen.getAllByRole('link', { name: 'INC-2026-000025' })[1]);
    assert.ok(reads.includes(notificationId));
  });

  await t.test('empty records show zero counts and clear list states', async () => {
    const zero = Object.fromEntries(Object.entries(metrics).map(([group, values]) => [group,
      Object.fromEntries(Object.keys(values).map((key) => [key, 0]))]));
    globalThis.fetch = async () => reply({ ...overview, metrics: zero, recentIncidents: [], pendingPosts: [],
      notifications: { unreadCount: 0, items: [] } });
    mount(); await screen.findByText('No incidents recorded');
    assert.match(document.body.textContent, /No recent notifications|Review queue is clear|0 unread/);
  });

  await t.test('network error supports retry and denied access clears prior private data', async () => {
    let mode = 'error';
    globalThis.fetch = async () => mode === 'error' ? reply({ error: { code: 'FAIL', message: 'PRIVATE_BACKEND' } }, 500)
      : mode === 'ok' ? reply(overview) : reply({ error: { code: 'FORBIDDEN', message: 'PRIVATE_MFA' } }, 403);
    mount(); await screen.findByText('Dashboard unavailable');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_BACKEND/);
    mode = 'ok'; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Spot impersonation attempts');
    mode = 'denied'; fireEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }));
    await screen.findByText(/verified MFA/);
    assert.doesNotMatch(document.body.textContent, /Spot impersonation attempts|PRIVATE_MFA/);
  });

  await t.test('expired session dispatches shared auth event and removes private content', async () => {
    let mode = 'ok'; let expired = 0;
    dom.window.addEventListener('ewaguard:session-expired', () => { expired++; }, { once: true });
    globalThis.fetch = async () => mode === 'ok' ? reply(overview) : reply({ error: { code: 'UNAUTHORIZED' } }, 401);
    mount(); await screen.findByText('Spot impersonation attempts');
    mode = 'expired'; fireEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }));
    await screen.findByText(/session has expired/);
    assert.equal(expired, 1);
    assert.doesNotMatch(document.body.textContent, /Spot impersonation attempts/);
  });
});
