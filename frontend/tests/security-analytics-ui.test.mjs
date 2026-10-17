import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router';
import { validateSecurityRange } from '../src/features/analytics/security-analytics-api.js';

const incidentId = '123e4567-e89b-42d3-a456-426614174200';
const range = { period: 'custom', start: '2091-01-01', end: '2091-01-03', timezone: 'UTC', days: 3 };
const metrics = { created: 4, high: 1, critical: 1, openCurrent: 2, resolvedCurrent: 1,
  closedCurrent: 0, falsePositiveCurrent: 1, assignedCurrent: 2, unassignedCurrent: 2,
  resolution: { eligibleCount: 1, averageSeconds: 7200 } };
const row = (value, count) => ({ value, count });
const data = { generatedAt: '2091-01-03T12:00:00.000Z', range, metrics,
  distributions: { severity: [row('LOW', 1), row('MEDIUM', 1), row('HIGH', 1), row('CRITICAL', 1)],
    currentStatus: [row('NEW', 1), row('UNDER_INVESTIGATION', 1), row('CONTAINED', 0), row('RESOLVED', 1), row('FALSE_POSITIVE', 1), row('CLOSED', 0)],
    category: [row('PHISHING', 2), row('MALWARE', 1), row('OTHER', 1)],
    detectionSource: [row('EMAIL_ANALYSIS', 2), row('FILE_ANALYSIS', 1), row('MANUAL_REPORT', 1)] },
  dailyCreated: [{ day: '2091-01-01', count: 1 }, { day: '2091-01-02', count: 1 }, { day: '2091-01-03', count: 2 }],
  recentCreated: [{ id: incidentId, reference: 'INC-2091-000001', severity: 'CRITICAL', status: 'RESOLVED',
    category: 'PHISHING', detectionSource: 'EMAIL_ANALYSIS', createdAt: '2091-01-03T08:00:00.000Z', assigned: true }] };
const reply = (body, status = 200) => Response.json(body, { status });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test('Phase 13B2 custom UTC range validation mirrors the API contract', () => {
  assert.equal(validateSecurityRange('7d', '', ''), '');
  assert.equal(validateSecurityRange('custom', '2091-01-01', '2091-03-31'), '');
  assert.match(validateSecurityRange('custom', '2091-01-01', '2091-04-01'), /90/);
  assert.match(validateSecurityRange('custom', '2091-02-30', '2091-03-01'), /valid/);
  assert.match(validateSecurityRange('custom', '2091-01-02', '2091-01-01'), /on or after/);
  assert.match(validateSecurityRange('custom', '', ''), /valid/);
});

test('Phase 13B2 security analytics interface', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { SecurityAnalyticsPage } = await vite.ssrLoadModule('/src/features/analytics/SecurityAnalyticsPage.jsx');
  const mount = () => render(createElement(MemoryRouter, null, createElement(SecurityAnalyticsPage)));
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(() => cleanup());

  await t.test('fetches authenticated aggregates and renders exact metrics, charts and incident links', async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => { calls.push([path, options]); return reply(data); };
    mount(); assert.ok(screen.getByRole('status', { name: 'Loading security analytics' }));
    await screen.findByText('INC-2091-000001');
    assert.equal(calls[0][0], '/api/admin/analytics/security?period=30d');
    assert.equal(calls[0][1].credentials, 'include');
    const cards = screen.getByRole('region', { name: 'Incident metrics' });
    for (const [name, value] of [['Incidents created', '4'], ['High severity', '1'], ['Critical severity', '1'],
      ['Open now', '2'], ['Resolved now', '1'], ['Average resolution', '2.0 hr']])
      assert.equal(within(within(cards).getByText(name).closest('section')).getByText(value).textContent, value);
    assert.match(document.body.textContent, /2091-01-01 through 2091-01-03|3 UTC days|current stored values/);
    assert.ok(screen.getByRole('img', { name: /Incident creation trend: 3 UTC days, maximum 2/ }));
    assert.ok(screen.getByRole('table', { name: 'Incident creation counts by UTC day' }));
    for (const title of ['Severity distribution', 'Current status', 'Incident categories', 'Detection sources', 'Current assignment'])
      assert.ok(screen.getByRole('heading', { name: title }));
    assert.equal(screen.getByRole('link', { name: 'INC-2091-000001' }).getAttribute('href'), `/admin/incidents/${incidentId}`);
    assert.equal(screen.getByRole('link', { name: 'Open incident queue' }).getAttribute('href'), '/admin/incidents');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_EVIDENCE|PRIVATE_NOTE/);
  });

  await t.test('presets and valid custom dates use exact backend query parameters', async () => {
    const calls = [];
    globalThis.fetch = async (path) => { calls.push(path); return reply(data); };
    mount(); await screen.findByText('INC-2091-000001');
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: '7d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    await waitFor(() => assert.ok(calls.includes('/api/admin/analytics/security?period=7d')));
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: '90d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    await waitFor(() => assert.ok(calls.includes('/api/admin/analytics/security?period=90d')));
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2091-01-01' } });
    fireEvent.change(screen.getByLabelText('End date (UTC)'), { target: { value: '2091-01-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    await waitFor(() => assert.ok(calls.includes('/api/admin/analytics/security?period=custom&start=2091-01-01&end=2091-01-03')));
  });

  await t.test('invalid custom dates do not call the API', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return reply(data); };
    mount(); await screen.findByText('INC-2091-000001');
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    assert.match(screen.getByRole('alert').textContent, /valid start and end/);
    for (const label of ['Start date (UTC)', 'End date (UTC)']) {
      const input = screen.getByLabelText(label);
      assert.equal(input.getAttribute('aria-invalid'), 'true');
      assert.equal(input.getAttribute('aria-describedby'), screen.getByRole('alert').id);
    }
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2091-01-01' } });
    fireEvent.change(screen.getByLabelText('End date (UTC)'), { target: { value: '2091-04-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    assert.match(screen.getByRole('alert').textContent, /90 UTC days/);
    assert.equal(calls, 1);
  });

  await t.test('late response from previous period cannot overwrite newer results', async () => {
    const late = deferred(), calls = [];
    globalThis.fetch = (path) => { calls.push(path); return calls.length === 1 ? late.promise : Promise.resolve(reply({ ...data,
      metrics: { ...metrics, created: 9 }, range: { ...range, period: '7d' } })); };
    mount();
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: '7d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    await screen.findByText('INC-2091-000001');
    late.resolve(reply(data));
    await waitFor(() => assert.equal(within(screen.getByRole('region', { name: 'Incident metrics' })).getByText('9').textContent, '9'));
    assert.match(document.body.textContent, /9/);
  });

  await t.test('empty data, error retry, MFA denial and expired sessions are clear', async () => {
    let mode = 'empty'; let expired = 0;
    dom.window.addEventListener('ewaguard:session-expired', () => { expired++; }, { once: true });
    const empty = { ...data, metrics: { ...metrics, created: 0, high: 0, critical: 0, openCurrent: 0,
      resolvedCurrent: 0, assignedCurrent: 0, unassignedCurrent: 0, resolution: { eligibleCount: 0, averageSeconds: null } },
    distributions: Object.fromEntries(Object.entries(data.distributions).map(([key, rows]) => [key, rows.map((item) => ({ ...item, count: 0 }))])),
    dailyCreated: data.dailyCreated.map((day) => ({ ...day, count: 0 })), recentCreated: [] };
    globalThis.fetch = async () => mode === 'empty' ? reply(empty) : mode === 'failure' ? reply({ error: { message: 'PRIVATE_BACKEND' } }, 500)
      : mode === 'denied' ? reply({ error: { message: 'PRIVATE_MFA' } }, 403) : reply({ error: { message: 'PRIVATE_SESSION' } }, 401);
    mount(); await screen.findAllByText('No incidents were created during this period.');
    assert.match(document.body.textContent, /Unavailable|No incidents in this period/);
    mode = 'failure'; fireEvent.click(screen.getByRole('button', { name: 'Refresh analytics' }));
    await screen.findByText('Security analytics unavailable');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_BACKEND|No incidents in this period/);
    mode = 'denied'; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(/verified MFA/);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_MFA/);
    mode = 'expired'; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(/session has expired/);
    assert.equal(expired, 1);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_SESSION/);
  });
});
