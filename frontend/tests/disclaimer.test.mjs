import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';
import { configureConsentSession, clearConsentSession, hasSessionConsent, rememberSessionConsent } from '../src/features/disclaimer/session-consent.js';
import { createChatFlow } from '../src/features/chat/chat-flow.js';

test('consent survives refresh/navigation but not another session, user, version, or logout', (t) => {
  const values = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key),
  } });
  t.after(() => { clearConsentSession(); delete globalThis.sessionStorage; });
  configureConsentSession('employee-a', { id: 'session-a' });
  assert.equal(hasSessionConsent('sensitive-information', '1.0'), false);
  rememberSessionConsent('sensitive-information', '1.0');
  configureConsentSession('employee-a', { id: 'session-a' });
  assert.equal(hasSessionConsent('sensitive-information', '1.0'), true);
  assert.equal(hasSessionConsent('sensitive-information', '2.0'), false);
  assert.equal(hasSessionConsent('chat', '1.0'), false);
  configureConsentSession('employee-b', { id: 'session-a' });
  assert.equal(hasSessionConsent('sensitive-information', '1.0'), false);
  rememberSessionConsent('chat', 'v1');
  configureConsentSession('employee-b', { id: 'session-b' });
  assert.equal(hasSessionConsent('chat', 'v1'), false);
  rememberSessionConsent('chat', 'v1');
  clearConsentSession();
  configureConsentSession('employee-b', { id: 'session-b' });
  assert.equal(hasSessionConsent('chat', 'v1'), false);
});

test('chat restores accepted privacy after remount and requires a changed notice again', async (t) => {
  t.after(clearConsentSession);
  configureConsentSession('employee', { id: 'chat-session' });
  let version = 'v1';
  const api = { privacy: async () => ({ privacyNotice: { version, text: 'Privacy' } }), list: async () => ({ conversations: [], nextBefore: null }) };
  const first = createChatFlow(api);
  await first.init();
  assert.equal(first.getSnapshot().acknowledgedVersion, null);
  first.acknowledge(true);
  first.clear();
  const second = createChatFlow(api);
  await second.init();
  assert.equal(second.getSnapshot().acknowledgedVersion, 'v1');
  second.acknowledge(false);
  await second.init();
  assert.equal(second.getSnapshot().acknowledgedVersion, null);
  second.acknowledge(true);
  version = 'v2';
  await second.init();
  assert.equal(second.getSnapshot().acknowledgedVersion, null);
});

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
