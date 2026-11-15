import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildIncidentAssistance } from '../../backend/src/assistance/incident-assistance.js';

test('employee assistance display across urgency levels and confidence states', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  t.after(() => server.close());
  const { IncidentAssistance } = await server.ssrLoadModule('/src/components/IncidentAssistance.jsx');
  const render = (assistance) => renderToStaticMarkup(createElement(IncidentAssistance, { assistance }));
  const make = (riskLevel, reasons = []) =>
    buildIncidentAssistance({
      analyzerType: 'FILE',
      riskResult: {
        analyzerType: 'FILE',
        riskLevel,
        confidence: 'LIMITED_CONFIDENCE',
        version: '1.0',
        reasons: reasons.map((code) => ({ code })),
      },
    });
  for (const [level, urgency, escalation] of [
    ['LOW', 'ROUTINE', 'NONE'],
    ['MEDIUM', 'CAUTION', 'OPTIONAL'],
    ['HIGH', 'URGENT', 'RECOMMENDED'],
    ['CRITICAL', 'IMMEDIATE', 'URGENT'],
  ]) {
    await t.test(`${level} has readable urgency, escalation, immediate and avoid actions`, () => {
      const assistance = make(level, ['PROVIDER_UNAVAILABLE', 'INSUFFICIENT_EVIDENCE']);
      const html = render(assistance);
      for (const phrase of [
        'What should I do now?',
        urgency,
        escalation,
        'Immediate actions',
        'Actions to avoid',
        'Escalation recommendation',
        `Assistance policy ${assistance.version}`,
      ])
        assert.ok(html.includes(phrase));
      assert.equal(assistance.version, '1.1');
      assert.doesNotMatch(html, /notifications (and automated remediation )?are not enabled/);
      assert.match(html, /evidence is incomplete/);
      assert.match(html, /checks were unavailable/);
      assert.match(html, /Independent verification/);
      assert.match(html, /separate incident receipt/);
      assert.doesNotMatch(html, /<button\b|<a\b|<input\b|Everything is safe|This is safe|>Create Incident</i);
      if (['HIGH', 'CRITICAL'].includes(level)) {
        assert.match(html, /border-l-4/);
        assert.match(html, /Preserve evidence/);
        assert.match(html, /Contact IT\/security/);
      } else assert.doesNotMatch(html, /border-l-4/);
    });
  }
  await t.test('detection-only device advice displays its conditional boundary', () => {
    const html = render(make('HIGH', ['FILE_CLAMAV_DETECTION']));
    assert.match(html, /does not establish that the file ran/);
    assert.match(html, /If execution or device compromise is suspected/);
    assert.match(html, /where company procedure permits/);
    assert.match(html, /Do not power off/);
  });
  await t.test('no guidance fallback invents no actions; text is escaped', () => {
    assert.equal(render(undefined), '');
    const guidance = make('LOW');
    guidance.summary = '<img src=x onerror=alert(1)>';
    const html = render(guidance);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img\b|<script\b/);
  });
});
