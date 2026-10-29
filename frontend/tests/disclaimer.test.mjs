import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';
import { configureConsentSession, clearConsentSession, hasSessionConsent, rememberSessionConsent } from '../src/features/disclaimer/session-consent.js';
import { createChatFlow } from '../src/features/chat/chat-flow.js';
import { PRIVACY_NOTICE } from '../../backend/src/ai/chat-policy.js';

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

test('chat renders the current OpenAI privacy notice and an unchecked acknowledgement', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { ChatPrivacy } = await server.ssrLoadModule('/src/features/chat/AssistantPage.jsx');
  const html = renderToStaticMarkup(createElement(ChatPrivacy, { notice: PRIVACY_NOTICE, acknowledged: false, onChange() {} }));
  assert.match(html, /processed securely through OpenAI&#x27;s API/);
  assert.match(html, /does not use API data to train its models by default/);
  assert.match(html, /Please avoid sharing passwords, confidential company information, or sensitive personal data/);
  assert.match(html, /whitespace-pre-line/);
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
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

  const compactHtml = renderToStaticMarkup(createElement(SensitiveInformationNotice, { context: 'EMAIL_ANALYSIS', compact: true }));
  assert.match(compactHtml, /Before You Continue/);
  assert.match(compactHtml, /I confirm that my submission does not contain sensitive or restricted information\./);
  assert.match(compactHtml, /<label[^>]*><input type="checkbox"/);
  assert.doesNotMatch(compactHtml, /type="checkbox"[^>]*checked/);
  assert.match(compactHtml, /<button[^>]*disabled=""[^>]*>Continue to Email Analysis/);
  assert.ok(compactHtml.includes(`Disclaimer version ${DISCLAIMER_DEFINITION.version}`));
  assert.match(compactHtml, /approved cybersecurity reporting channel instead/);
  assert.match(compactHtml, /lg:p-10/);
  assert.match(compactHtml, /lg:w-4\/5/);

  const compactUrlHtml = renderToStaticMarkup(createElement(SensitiveInformationNotice, { context: 'URL_ANALYSIS', compact: true }));
  assert.match(compactUrlHtml, /<button[^>]*disabled=""[^>]*>Continue to URL Analysis/);
});
