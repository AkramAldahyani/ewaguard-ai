import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('analysis severity themes are authoritative, complete and neutral by default', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  t.after(() => server.close());

  const { AnalysisPageTheme } = await server.ssrLoadModule('/src/components/analysis-risk-theme.jsx');
  const { ANALYSIS_SEVERITY_THEMES, getAnalysisRiskLevel } = await server.ssrLoadModule(
    '/src/components/analysis-risk-theme-config.js',
  );
  const { RiskResult } = await server.ssrLoadModule('/src/components/RiskResult.jsx');

  assert.deepEqual(Object.keys(ANALYSIS_SEVERITY_THEMES), ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  for (const level of Object.keys(ANALYSIS_SEVERITY_THEMES)) {
    const page = renderToStaticMarkup(
      createElement(AnalysisPageTheme, {
        risk: { riskLevel: level },
        children: createElement('p', null, 'Analysis content'),
      }),
    );
    assert.match(page, new RegExp(`data-risk-theme="${level}"`));

    const result = renderToStaticMarkup(
      createElement(RiskResult, {
        risk: {
          riskLevel: level,
          score: 42,
          confidence: 'HIGH_CONFIDENCE',
          reasons: [],
          recommendedActions: ['Follow the supplied action.'],
        },
      }),
    );
    assert.match(result, new RegExp(`data-risk-theme="${level}"`));
    assert.ok(result.includes(ANALYSIS_SEVERITY_THEMES[level].summary));
  }

  for (const risk of [undefined, {}, { riskLevel: 'UNKNOWN' }, { riskLevel: 3 }]) {
    assert.equal(getAnalysisRiskLevel(risk), null);
    const page = renderToStaticMarkup(createElement(AnalysisPageTheme, { risk, children: 'Neutral' }));
    assert.match(page, /data-risk-theme="NEUTRAL"/);
    assert.doesNotMatch(page, /data-risk-theme="LOW"/);
  }

  const incomplete = renderToStaticMarkup(
    createElement(RiskResult, {
      inconclusive: true,
      risk: { riskLevel: 'LOW', score: 0, confidence: 'LIMITED_CONFIDENCE', reasons: [], recommendedActions: [] },
    }),
  );
  assert.match(incomplete, /data-risk-theme="NEUTRAL"/);
  assert.match(incomplete, /Analysis incomplete/);
  assert.doesNotMatch(incomplete, /data-risk-theme="LOW"/);
});
