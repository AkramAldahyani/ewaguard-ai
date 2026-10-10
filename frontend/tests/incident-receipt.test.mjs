import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('incident receipt distinguishes recording, pending recovery and no escalation', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { IncidentReceipt } = await server.ssrLoadModule('/src/components/IncidentReceipt.jsx');
  const render = (incident) => renderToStaticMarkup(createElement(IncidentReceipt, { incident, analyzerType: 'EMAIL', analysisId: 'source' }));
  assert.equal(render(undefined), ''); assert.equal(render({ state: 'NOT_REQUIRED' }), '');
  const pending = render({ state: 'PENDING' });
  assert.match(pending, /escalation is pending/); assert.match(pending, /Do not repeat the scan/);
  assert.match(pending, /Retry incident recording/); assert.doesNotMatch(pending, /Security incident recorded/);
  const recorded = render({ state: 'RECORDED', reference: 'INC-2026-000123', severity: 'CRITICAL', status: 'NEW', urgent: true });
  assert.match(recorded, /INC-2026-000123/); assert.match(recorded, /Urgent review required/);
  assert.match(recorded, /notifications are not enabled/); assert.doesNotMatch(recorded, /<button/);
  const hostile = render({ state: 'RECORDED', reference: '<script>bad()</script>' });
  assert.match(hostile, /&lt;script&gt;/); assert.doesNotMatch(hostile, /<script/);
});
