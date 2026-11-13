import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const analysisId = '123e4567-e89b-42d3-a456-426614174999';
const reply = (body, status = 200) => Response.json(body, { status });

test('BUG-001 employee credential exposure report', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent', 'HTMLDialogElement'])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { ExposureReport } = await vite.ssrLoadModule('/src/components/ExposureReport.jsx');
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(() => cleanup());

  await t.test('only email and URL analyses offer the action', () => {
    for (const props of [{ analyzerType: 'FILE', analysisId }, { analyzerType: 'EMAIL' }]) {
      const { container } = render(createElement(ExposureReport, props));
      assert.equal(container.innerHTML, ''); cleanup();
    }
  });

  await t.test('requires explicit confirmation, sends only the fixed statement and shows critical guidance', async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => { calls.push([path, options]); return reply({ analysisId, incident: {
      created: false, state: 'RECORDED', reference: 'INC-2026-000321', severity: 'CRITICAL', status: 'NEW', urgent: true,
      exposure: 'CREDENTIALS_SUBMITTED', exposureRecorded: true, assistance: { version: '1.0', urgency: 'IMMEDIATE', headline: 'Contact IT/security now',
        summary: 'Reported credential exposure.', confidenceNotes: [], immediateActions: ['Change your password'], avoidActions: [], followUpActions: [],
        escalationRecommendation: { level: 'URGENT', description: 'Report urgently.' }, credentialGuidance: null, deviceContainmentGuidance: null,
        evidencePreservationGuidance: [], disclaimer: 'Guidance only.' } } }); };
    render(createElement(ExposureReport, { analysisId, analyzerType: 'EMAIL' }));
    fireEvent.click(screen.getByRole('button', { name: 'I entered my credentials' }));
    assert.equal(calls.length, 0, 'opening the dialog sends nothing');
    fireEvent.click(screen.getByRole('button', { name: 'Yes, report exposure' }));
    await waitFor(() => screen.getByText('Credential exposure reported'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], `/api/analysis-escalations/EMAIL/${analysisId}/exposure`);
    assert.deepEqual(JSON.parse(calls[0][1].body), { exposure: 'CREDENTIALS_SUBMITTED', confirmed: true });
    assert.match(dom.window.document.body.textContent, /INC-2026-000321 · CRITICAL/);
    assert.ok(screen.getByText('Change your password'));
  });

  await t.test('cancel sends nothing; failures direct the employee to the approved channel', async () => {
    const calls = [];
    globalThis.fetch = async (path) => { calls.push(path); return reply({ error: { code: 'INCIDENT_SOURCE_NOT_FOUND', message: 'x' } }, 404); };
    render(createElement(ExposureReport, { analysisId, analyzerType: 'URL' }));
    fireEvent.click(screen.getByRole('button', { name: 'I entered my credentials' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    assert.equal(calls.length, 0);
    fireEvent.click(screen.getByRole('button', { name: 'I entered my credentials' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, report exposure' }));
    await waitFor(() => screen.getByRole('alert'));
    assert.match(screen.getByRole('alert').textContent, /no longer available.*approved channel/);
  });
});
