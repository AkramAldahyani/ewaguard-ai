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
  analyses: { total: 14, severity: [{ value: 'LOW', count: 5 }, { value: 'MEDIUM', count: 4 },
    { value: 'HIGH', count: 3 }, { value: 'CRITICAL', count: 2 }],
  period: { key: '30d', days: 30, start: '2026-09-12', end: '2026-10-11', timezone: 'UTC' } },
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
    assert.ok(screen.getByText('Monitor security activity, incidents, and employee awareness across the organization.'));
    assert.equal(calls[0][0], '/api/admin/dashboard');
    assert.equal(calls[0][1].credentials, 'include');
    const kpis = screen.getByRole('region', { name: 'Security operations metrics' });
    for (const [name, number] of [['Total Security Analyses', '14'], ['Open Incidents', '8'],
      ['High-Priority Open Incidents', '3'], ['Critical-Priority Open Incidents', '2'],
      ['Awaiting Assignment', '4'], ['Active Employees', '37']]) {
      assert.match(within(within(kpis).getByText(name).closest('section')).getByText(number).textContent, new RegExp(number));
    }
    const incidentLink = screen.getAllByRole('link', { name: 'INC-2026-000025' })[0];
    assert.equal(incidentLink.getAttribute('href'), `/admin/incidents/${incidentId}`);
    assert.match(document.body.textContent, /Unassigned|Critical risk|New|Urgent incident update|2 unread/);
    assert.ok(screen.getAllByRole('link', { name: /View Incident Queue/ }).every((link) => link.getAttribute('href') === '/admin/incidents'));
    assert.ok(screen.getAllByRole('link', { name: 'INC-2026-000025' }).every((link) => link.getAttribute('href') === `/admin/incidents/${incidentId}`));
    for (const [name, href] of [['Training Programs', '/admin/training'], ['Monthly Quizzes', '/admin/monthly-quizzes'],
      ['Certificates', '/admin/certificates'], ['Community Moderation', '/admin/community'],
      ['View Security Analytics', '/admin/analytics/security'], ['Incident Statistics', '/admin/analytics/incidents'],
      ['Awareness Analytics', '/admin/analytics/awareness']])
      assert.equal(screen.getByRole('link', { name }).getAttribute('href'), href);
    assert.ok(screen.getByRole('img', { name: '14 completed analyses by risk level' }));
    for (const text of ['Security Overview', 'Low', 'Medium', 'High', 'Critical', 'Published programs',
      'Completed assignments', 'Training completion rate', 'Monthly quiz participation', 'Certificates issued'])
      assert.match(document.body.textContent, new RegExp(text));
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

  await t.test('previews only the two newest incidents and three newest notifications, refreshing on live incident events', async () => {
    const at = (minute) => `2026-10-11T10:${String(minute).padStart(2, '0')}:00.000Z`;
    const uuid = (n) => `123e4567-e89b-42d3-a456-4266141743${String(n).padStart(2, '0')}`;
    const incidents = [3, 9, 1, 7, 5].map((minute) => ({ id: uuid(minute), reference: `INC-2026-0000${String(minute).padStart(2, '0')}`,
      status: 'NEW', severity: 'MEDIUM', urgent: false, assigneeName: null, createdAt: at(minute) }));
    const notes = [2, 8, 4, 6, 1, 9].map((minute) => ({ ...notification, id: uuid(40 + minute), title: `Alert minute ${minute}`, createdAt: at(minute) }));
    let fetches = 0, notify;
    const snapshot = { items: notes, unreadCount: 6, loading: false, error: '' };
    const flow = { subscribe: () => () => {}, getSnapshot: () => snapshot, read() {},
      subscribeIncidents: (fn) => { notify = fn; return () => { notify = null; }; } };
    globalThis.fetch = async () => { fetches++; return reply({ ...overview, recentIncidents: fetches > 1 ? [...incidents, { ...incidents[0], id: uuid(30), reference: 'INC-2026-000099', createdAt: at(30) }] : incidents }); };
    mount(flow); await screen.findByText('Alert minute 9');
    const incidentList = screen.getByRole('heading', { name: 'Recent incidents' }).closest('section').querySelector('ul');
    assert.deepEqual([...incidentList.querySelectorAll('li a')].map((link) => link.textContent), ['INC-2026-000009', 'INC-2026-000007']);
    const noteList = screen.getByRole('heading', { name: 'Security notifications' }).closest('section').querySelector('ul');
    assert.deepEqual([...noteList.children].map((item) => item.querySelector('p').textContent), ['Alert minute 9', 'Alert minute 8', 'Alert minute 6']);
    assert.ok(screen.getAllByRole('link', { name: /View Incident Queue/ }).length >= 1);
    notify();
    await screen.findByText('INC-2026-000099');
    assert.equal(fetches, 2);
    const refreshed = screen.getByRole('heading', { name: 'Recent incidents' }).closest('section').querySelector('ul');
    assert.deepEqual([...refreshed.querySelectorAll('li a')].map((link) => link.textContent), ['INC-2026-000099', 'INC-2026-000009']);
  });

  await t.test('empty records show zero counts and clear list states', async () => {
    const zero = Object.fromEntries(Object.entries(metrics).filter(([group]) => group !== 'analyses').map(([group, values]) => [group,
      Object.fromEntries(Object.keys(values).map((key) => [key, 0]))]));
    zero.analyses = { ...metrics.analyses, total: 0,
      severity: metrics.analyses.severity.map((row) => ({ ...row, count: 0 })) };
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
