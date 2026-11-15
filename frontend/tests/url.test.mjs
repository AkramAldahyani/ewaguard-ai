import { buildIncidentAssistance } from '../../backend/src/assistance/incident-assistance.js';
import { waitForSubmission } from './analysis-wait.mjs';
import { evaluateRisk } from '../../backend/src/risk/risk-engine.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { createUrlFlow, analyzeUrl, urlErrorMessage } from '../src/features/url/url-state.js';
import { createUrlAnalyzer } from '../../backend/src/analyzers/url/url-analyzer.js';

test('URL employee UI and state lifecycle', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  t.after(() => server.close());
  const { UrlAnalyzerPage, UrlInputForm } = await server.ssrLoadModule('/src/features/url/UrlAnalyzerPage.jsx');
  const { UrlResults } = await server.ssrLoadModule('/src/features/url/UrlResults.jsx');
  await t.test('retry receipt renders without requiring original submission details', () => {
    const html = renderToStaticMarkup(
      createElement(UrlResults, {
        analysis: {
          replayed: true,
          analysisId: 'saved-id',
          analyzerType: 'URL',
          severity: 'LOW',
          riskScore: 0,
          createdAt: '2026-10-19T12:00:00Z',
          incident: { state: 'NOT_REQUIRED' },
        },
      }),
    );
    assert.match(html, /Previously completed analysis/);
    assert.match(html, /This retry did not create another scan/);
  });
  const render = (C, props) =>
    renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/analyze/url'] }, createElement(C, props)));
  const analyzer = createUrlAnalyzer({
    resolveTarget: async () => ({ addresses: ['8.8.8.8'], evidence: { status: 'RESOLVED', resolvedIpCount: 1 } }),
    tlsInspector: async () => ({ status: 'UNAVAILABLE' }),
  });
  const analysis = {
    analysisId: 'test-id',
    createdAt: new Date().toISOString(),
    result: await analyzer('https://example.com/login?token=VALUE_SECRET'),
  };
  analysis.result.risk = evaluateRisk({
    analyzerType: 'URL',
    evidence: analysis.result,
    evaluatedAt: analysis.createdAt,
  });
  analysis.result.assistance = buildIncidentAssistance({ analyzerType: 'URL', riskResult: analysis.result.risk });
  const ready = (submit = async () => analysis) => {
    const flow = createUrlFlow(submit);
    flow.edit('https://example.com');
    return flow;
  };
  await t.test('URL input is available without a disclaimer', () => {
    const html = render(UrlAnalyzerPage);
    assert.match(html, /id="url-input"/);
    assert.doesNotMatch(html, /Before You Continue|Before you analyze|Sensitive Information Notice|type="checkbox"/);
  });
  await t.test('input labels and bounds guidance', () => {
    const flow = ready();
    const html = render(UrlInputForm, { flow, state: flow.getSnapshot() });
    assert.match(html, /for="url-input"/);
    assert.match(html, /4096/);
    assert.match(html, /autoComplete="off"/i);
  });
  await t.test('API contract contains URL only and uses session credentials', async (t) => {
    t.mock.method(globalThis, 'fetch', async (path, options) => {
      assert.equal(path, '/api/analysis/url');
      assert.equal(options.credentials, 'include');
      assert.deepEqual(JSON.parse(options.body), { url: 'https://example.com' });
      return { ok: true, status: 201, json: async () => analysis };
    });
    await analyzeUrl('https://example.com');
  });
  await t.test('incident assistance renders urgency, escalation and safe next steps', () => {
    const html = render(UrlResults, { analysis });
    for (const title of [
      'What should I do now?',
      'Immediate actions',
      'Actions to avoid',
      'Escalation recommendation',
      analysis.result.assistance.urgency,
      analysis.result.assistance.escalationRecommendation.level,
    ])
      assert.ok(html.includes(title));
    assert.match(html, /separate incident receipt/);
    assert.doesNotMatch(html, /<button[^>]*>Create Incident|href="[^"]*create-incident/);
  });
  await t.test('all evidence sections, unavailable provider and nonclickable redacted URL', () => {
    const html = render(UrlResults, { analysis });
    for (const title of [
      'Analysis Summary',
      'URL Structure',
      'Local Indicators',
      'DNS Evidence',
      'TLS Certificate Evidence',
      'VirusTotal Reputation',
      'Recommended Actions',
      'Limitations',
    ])
      assert.ok(html.includes(title));
    assert.match(html, /NOT CONFIGURED/);
    assert.match(html, /SKIPPED PRIVACY/);
    assert.match(html, /Local analysis completed/);
    assert.doesNotMatch(html, /VALUE_SECRET|<a\b|<img\b|<iframe\b|<script\b/);
  });
  await t.test('hostile strings are escaped', () => {
    const result = {
      ...analysis.result,
      normalizedUrl: { ...analysis.result.normalizedUrl, redactedUrl: '<img src=x onerror=alert(1)>' },
    };
    assert.match(render(UrlResults, { analysis: { ...analysis, result } }), /&lt;img/);
  });
  await t.test('invalid input never submits', async () => {
    const flow = createUrlFlow(() => assert.fail());
    for (const value of ['', 'javascript:alert(1)', 'a'.repeat(4097)]) {
      flow.edit(value);
      await flow.submit();
      assert.equal(flow.getSnapshot().status, 'error');
    }
  });
  await t.test('loading, duplicate protection, success clears raw URL and reset clears result', async () => {
    let finish;
    let calls = 0;
    const flow = ready(() => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = flow.submit();
    await flow.submit();
    await waitForSubmission(() => calls === 1);
    assert.equal(calls, 1);
    assert.match(render(UrlInputForm, { flow, state: flow.getSnapshot() }), /aria-busy="true"/);
    finish(analysis);
    await pending;
    assert.equal(flow.getSnapshot().url, '');
    assert.ok(flow.getSnapshot().result);
    flow.reset();
    assert.equal(flow.getSnapshot().result, null);
  });
  await t.test('abort ignores late response and failures are sanitized', async () => {
    let finish;
    let signal;
    const flow = ready((_, s) => {
      signal = s;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = flow.submit();
    await waitForSubmission(() => signal);
    flow.reset();
    assert.ok(signal.aborted);
    finish(analysis);
    await pending;
    assert.equal(flow.getSnapshot().result, null);
    for (const status of [401, 429, 500, 413])
      assert.doesNotMatch(urlErrorMessage({ status, message: 'SECRET' }), /SECRET/);
  });
});
