import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';

test('reusable disclaimer defaults to explicit unchecked acknowledgement', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { SensitiveInformationNotice } = await server.ssrLoadModule('/src/features/disclaimer/SensitiveInformationNotice.jsx');
  const { canContinue } = await server.ssrLoadModule('/src/features/disclaimer/disclaimer-state.js');
  const html = renderToStaticMarkup(createElement(SensitiveInformationNotice, { context: 'FILE_ANALYSIS' }));
  assert.match(html, /Sensitive Information Notice/);
  assert.ok(html.includes(DISCLAIMER_DEFINITION.summary));
  assert.ok(html.includes(DISCLAIMER_DEFINITION.confirmation));
  assert.match(html, /type="checkbox"/);
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Acknowledge and continue<\/button>/);
  assert.match(html, new RegExp(`Disclaimer version ${DISCLAIMER_DEFINITION.version.replace('.', '\\.')}<`));
  assert.equal(canContinue(false), false);
  assert.equal(canContinue(true), true);
  assert.equal(canContinue(true, 'saving'), false);
});
