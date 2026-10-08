import { evaluateRisk } from '../../backend/src/risk/risk-engine.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createUrlFlow, analyzeUrl, urlErrorMessage } from '../src/features/url/url-state.js';
import { createUrlAnalyzer } from '../../backend/src/analyzers/url/url-analyzer.js';

test('URL employee UI and state lifecycle', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { UrlAnalyzerPage, UrlInputForm } = await server.ssrLoadModule('/src/features/url/UrlAnalyzerPage.jsx');
  const { UrlResults } = await server.ssrLoadModule('/src/features/url/UrlResults.jsx');
  const render = (C, props) => renderToStaticMarkup(createElement(C, props));
  const analyzer = createUrlAnalyzer({ resolveTarget: async () => ({ addresses: ['8.8.8.8'], evidence: { status: 'RESOLVED', resolvedIpCount: 1 } }), tlsInspector: async () => ({ status: 'UNAVAILABLE' }) });
  const analysis = { analysisId: 'test-id', createdAt: new Date().toISOString(), result: await analyzer('https://example.com/login?token=VALUE_SECRET') };
  analysis.result.risk = evaluateRisk({ analyzerType: 'URL', evidence: analysis.result, evaluatedAt: analysis.createdAt });
  const ready = (submit = async () => analysis) => { const flow = createUrlFlow(submit); flow.acknowledge(); flow.edit('https://example.com'); return flow; };
  await t.test('unchecked acknowledgement and provider disclosure before input', () => {
    const html = render(UrlAnalyzerPage); assert.match(html, /Sensitive Information Notice/); assert.match(html, /VirusTotal.*dataset/);
    assert.doesNotMatch(html, /id="url-input"|checked=""|Preview only/);
  });
  await t.test('input labels and bounds guidance', () => {
    const flow = ready(); const html = render(UrlInputForm, { flow, state: flow.getSnapshot() });
    assert.match(html, /for="url-input"/); assert.match(html, /4096/); assert.match(html, /autoComplete="off"/i);
  });
  await t.test('API contract contains URL only and uses session credentials', async (t) => {
    t.mock.method(globalThis, 'fetch', async (path, options) => {
      assert.equal(path, '/api/analysis/url'); assert.equal(options.credentials, 'include');
      assert.deepEqual(JSON.parse(options.body), { url: 'https://example.com' });
      return { ok: true, status: 201, json: async () => analysis };
    });
    await analyzeUrl('https://example.com');
  });
  await t.test('all evidence sections, unavailable provider and nonclickable redacted URL', () => {
    const html = render(UrlResults, { analysis });
    for (const title of ['Analysis Summary', 'URL Structure', 'Local Indicators', 'DNS Evidence', 'TLS Certificate Evidence', 'VirusTotal Reputation', 'Recommended Actions', 'Limitations']) assert.ok(html.includes(title));
    assert.match(html, /NOT CONFIGURED/); assert.match(html, /SKIPPED PRIVACY/); assert.match(html, /Local analysis completed/);
    assert.doesNotMatch(html, /VALUE_SECRET|<a\b|<img\b|<iframe\b|<script\b/);
  });
  await t.test('hostile strings are escaped', () => {
    const result = { ...analysis.result, normalizedUrl: { ...analysis.result.normalizedUrl, redactedUrl: '<img src=x onerror=alert(1)>' } };
    assert.match(render(UrlResults, { analysis: { ...analysis, result } }), /&lt;img/);
  });
  await t.test('invalid input and unacknowledged state never submit', async () => {
    const flow = createUrlFlow(() => assert.fail()); flow.edit('https://example.com'); await flow.submit(); flow.acknowledge();
    for (const value of ['', 'javascript:alert(1)', 'a'.repeat(4097)]) { flow.edit(value); await flow.submit(); assert.equal(flow.getSnapshot().status, 'error'); }
  });
  await t.test('loading, duplicate protection, success clears raw URL and reset clears result', async () => {
    let finish; let calls = 0;
    const flow = ready(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
    const pending = flow.submit(); await flow.submit(); assert.equal(calls, 1);
    assert.match(render(UrlInputForm, { flow, state: flow.getSnapshot() }), /aria-busy="true"/);
    finish(analysis); await pending; assert.equal(flow.getSnapshot().url, ''); assert.ok(flow.getSnapshot().result);
    flow.reset(); assert.equal(flow.getSnapshot().result, null);
  });
  await t.test('abort ignores late response, expired notice renews, failures sanitized', async () => {
    let finish; let signal;
    const flow = ready((_, s) => { signal = s; return new Promise((resolve) => { finish = resolve; }); });
    const pending = flow.submit(); flow.reset(); assert.ok(signal.aborted); finish(analysis); await pending; assert.equal(flow.getSnapshot().result, null);
    const expired = ready(async () => { throw { code: 'URL_ACKNOWLEDGEMENT_REQUIRED' }; }); await expired.submit(); assert.equal(expired.getSnapshot().acknowledged, false);
    for (const status of [401, 429, 500, 413]) assert.doesNotMatch(urlErrorMessage({ status, message: 'SECRET' }), /SECRET/);
  });
});
