import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { evaluateRisk } from '../../backend/src/risk/risk-engine.js';
import { RISK_POLICY } from '../../backend/src/risk/risk-policy.js';

test('shared employee risk presentation: labels, confidence, reasons, actions and safe fallback', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { RiskResult } = await server.ssrLoadModule('/src/components/RiskResult.jsx');
  const base = evaluateRisk({ analyzerType: 'FILE', evidence: {} });
  const render = (risk) => renderToStaticMarkup(createElement(RiskResult, { risk }));
  for (const [riskLevel, label, score] of [['LOW', 'Low risk', 0], ['MEDIUM', 'Medium risk', 25], ['HIGH', 'High risk', 50], ['CRITICAL', 'Critical risk', 75]]) {
    const html = render({ ...base, riskLevel, score, recommendedActions: RISK_POLICY.recommendations[riskLevel] });
    assert.match(html, /EWAGuard Risk Level/); assert.ok(html.includes(label)); assert.ok(html.includes(`${score}/100`));
    assert.match(html, /Confidence: Limited/); assert.doesNotMatch(html, /LIMITED CONFIDENCE/); assert.match(html, /low risk does not guarantee safety/);
    assert.match(html, /Evidence coverage is incomplete/); assert.ok(html.includes(`Risk model ${base.version}`));
    for (const action of RISK_POLICY.recommendations[riskLevel]) assert.ok(html.includes(action));
    assert.doesNotMatch(html, /contribution|uncappedScore|criticalEligible|INSUFFICIENT_EVIDENCE/);
  }
  const missing = render(undefined); assert.match(missing, /unavailable/); assert.doesNotMatch(missing, /Low risk|0\/100/);
  const hostile = render({ ...base, reasons: [{ code: 'TEST', contribution: 1, description: '<img src=x onerror=alert(1)>' }] });
  assert.match(hostile, /Key findings/);
  assert.match(hostile, /&lt;img/); assert.doesNotMatch(hostile, /<img\b|<script\b/);
});
