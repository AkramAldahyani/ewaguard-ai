import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router';
import { validateSecurityRange } from '../src/features/incident-awareness/incident-awareness-api.js';

const programId = '123e4567-e89b-42d3-a456-426614174201';
const pattern = {
  incidentCategory: 'PHISHING',
  incidentCount: 4,
  suggestedTitle: 'Recognize phishing attempts',
  suggestedBody: 'Check unexpected requests through an approved channel.',
  relatedTraining: [{ id: programId, title: 'Phishing basics', topic: 'PHISHING' }],
};
const data = {
  range: { period: '30d', start: '2091-01-01', end: '2091-01-30', timezone: 'UTC', days: 30 },
  minimumPatternCount: 3,
  patterns: [pattern],
  trainingOptionsTruncated: false,
};
const reply = (body, status = 200) => Response.json(body, { status });
const defer = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('Phase 14B UTC period validation stays within the backend contract', () => {
  assert.equal(validateSecurityRange('7d', '', ''), '');
  assert.match(validateSecurityRange('custom', '2091-01-01', '2091-04-01'), /90/);
  assert.match(validateSecurityRange('custom', '', ''), /valid/);
});

test('Phase 14B administrator incident-awareness interface', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Node',
    'Event',
    'MutationObserver',
    'CustomEvent',
    'HTMLDialogElement',
  ])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
  const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  const { IncidentAwarenessPage } = await vite.ssrLoadModule(
    '/src/features/incident-awareness/IncidentAwarenessPage.jsx',
  );
  const mount = () => render(createElement(MemoryRouter, null, createElement(IncidentAwarenessPage)));
  t.after(async () => {
    cleanup();
    await vite.close();
    dom.window.close();
    delete globalThis.fetch;
  });
  t.afterEach(() => cleanup());

  await t.test('loads privacy-safe counts and related training, with assignment navigation', async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => {
      calls.push([path, options]);
      return reply(data);
    };
    mount();
    assert.ok(screen.getByRole('status', { name: 'Loading incident patterns' }));
    await screen.findByText('4 qualifying incidents');
    assert.equal(calls[0][0], '/api/admin/incident-awareness?period=30d');
    assert.equal(calls[0][1].credentials, 'include');
    assert.equal(
      screen.getByRole('link', { name: 'View Related Training' }).getAttribute('href'),
      `/admin/training/${programId}`,
    );
    assert.equal(
      screen.getByRole('link', { name: 'Assign Relevant Training' }).getAttribute('href'),
      `/admin/training/${programId}?view=assignments`,
    );
    assert.doesNotMatch(dom.window.document.body.textContent, /PRIVATE_EVIDENCE|PRIVATE_EMPLOYEE/);
  });

  await t.test('requires human review and disclaimer, confirms exact text, then submits pending warning', async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => {
      calls.push([path, options]);
      if (path === '/api/disclaimers/acknowledge') return reply({ acknowledgement: { id: 'ack-1' } });
      if (path === '/api/admin/incident-awareness/warnings')
        return reply({
          post: { id: 'post-1', status: 'PENDING_REVIEW', trainingId: programId },
          alreadyPrepared: false,
        });
      return reply(data);
    };
    mount();
    await screen.findByText('4 qualifying incidents');
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Awareness Warning' }));
    fireEvent.change(screen.getByLabelText('Warning title'), { target: { value: 'Check suspicious messages' } });
    fireEvent.change(screen.getByLabelText('General cybersecurity guidance'), {
      target: { value: 'Report suspicious requests through the approved channel.' },
    });
    fireEvent.change(screen.getByLabelText('Related published training (optional)'), { target: { value: programId } });
    fireEvent.click(screen.getByRole('button', { name: 'Review final warning' }));
    assert.match(screen.getByRole('alert').textContent, /human review and sensitive-information/);
    const checks = screen.getAllByRole('checkbox');
    assert.equal(checks.length, 2);
    assert.ok(checks.every((item) => !item.checked));
    checks.forEach((item) => fireEvent.click(item));
    fireEvent.click(screen.getByRole('button', { name: 'Review final warning' }));
    const dialog = screen.getByRole('dialog');
    assert.match(within(dialog).getByText('Check suspicious messages').textContent, /Check suspicious/);
    assert.match(dialog.textContent, /different administrator/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit for moderation' }));
    await screen.findByText('Warning submitted for review');
    assert.match(screen.getByRole('status').textContent, /PENDING_REVIEW/);
    assert.equal(calls.filter(([path]) => path === '/api/disclaimers/acknowledge').length, 1);
    const postCall = calls.find(([path]) => path === '/api/admin/incident-awareness/warnings');
    assert.ok(postCall);
    const body = JSON.parse(postCall[1].body);
    assert.deepEqual(
      {
        incidentCategory: body.incidentCategory,
        title: body.title,
        body: body.body,
        trainingId: body.trainingId,
        acknowledgementId: body.acknowledgementId,
        reviewed: body.reviewed,
      },
      {
        incidentCategory: 'PHISHING',
        title: 'Check suspicious messages',
        body: 'Report suspicious requests through the approved channel.',
        trainingId: programId,
        acknowledgementId: 'ack-1',
        reviewed: true,
      },
    );
    assert.equal(body.status, undefined);
    assert.equal(body.employeeId, undefined);
    assert.equal(
      screen.getByRole('link', { name: 'Open community moderation' }).getAttribute('href'),
      '/admin/community',
    );
  });

  await t.test('editing after review clears approval and backend validation errors remain private', async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => {
      calls.push([path, options]);
      if (path === '/api/disclaimers/acknowledge') return reply({ acknowledgement: { id: 'ack-2' } });
      if (path === '/api/admin/incident-awareness/warnings')
        return reply({ error: { code: 'AWARENESS_ACTION_INVALID', message: 'PRIVATE_VALIDATION' } }, 400);
      return reply(data);
    };
    mount();
    await screen.findByText('4 qualifying incidents');
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Awareness Warning' }));
    const checks = screen.getAllByRole('checkbox');
    checks.forEach((item) => fireEvent.click(item));
    fireEvent.change(screen.getByLabelText('General cybersecurity guidance'), {
      target: { value: 'Revised general guidance.' },
    });
    assert.equal(checks[0].checked, false);
    fireEvent.click(screen.getByRole('button', { name: 'Review final warning' }));
    assert.match(screen.getByRole('alert').textContent, /human review/);
    fireEvent.click(checks[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Review final warning' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit for moderation' }));
    await screen.findByText(/Remove sensitive details and check the title/);
    assert.doesNotMatch(dom.window.document.body.textContent, /PRIVATE_VALIDATION/);
    assert.equal(calls.filter(([path]) => path === '/api/admin/incident-awareness/warnings').length, 1);
    assert.equal(screen.queryByText('Warning submitted for review'), null);
  });

  await t.test('custom range validation, empty state, errors, retry and MFA denial', async () => {
    let mode = 'empty';
    const calls = [];
    globalThis.fetch = async (path) => {
      calls.push(path);
      return mode === 'empty'
        ? reply({ ...data, patterns: [] })
        : mode === 'denied'
          ? reply({ error: { message: 'PRIVATE_MFA' } }, 403)
          : reply({ error: { message: 'PRIVATE_ERROR' } }, 500);
    };
    mount();
    await screen.findByText('No qualifying patterns in this period');
    fireEvent.change(screen.getByLabelText('Incident creation period'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    assert.match(screen.getByRole('alert').textContent, /valid start and end dates/);
    assert.equal(calls.length, 1);
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2091-01-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2091-01-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    await waitFor(() =>
      assert.ok(calls.includes('/api/admin/incident-awareness?period=custom&start=2091-01-01&end=2091-01-03')),
    );
    mode = 'failure';
    fireEvent.click(screen.getByRole('button', { name: 'Refresh patterns' }));
    await screen.findByText('Incident patterns unavailable');
    assert.doesNotMatch(dom.window.document.body.textContent, /PRIVATE_ERROR/);
    mode = 'denied';
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(/verified MFA/);
    assert.doesNotMatch(dom.window.document.body.textContent, /PRIVATE_MFA/);
  });

  await t.test('ignores stale period response', async () => {
    const late = defer();
    let calls = 0;
    globalThis.fetch = () =>
      ++calls === 1 ? late.promise : Promise.resolve(reply({ ...data, patterns: [{ ...pattern, incidentCount: 9 }] }));
    mount();
    fireEvent.change(screen.getByLabelText('Incident creation period'), { target: { value: '7d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    await screen.findByText('9 qualifying incidents');
    late.resolve(reply(data));
    await waitFor(() => assert.ok(screen.getByText('9 qualifying incidents')));
  });
});
