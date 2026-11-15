import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('company evidence renders demonstration authority, exact metadata and escaped source text', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  t.after(() => server.close());
  const { ChatEvidence } = await server.ssrLoadModule('/src/features/chat/ChatEvidence.jsx');
  const result = {
    data: {
      kind: 'COMPANY_POLICY',
      status: 'MATCHES',
      notice: 'Examples, not official EWA requirements.',
      matches: [
        {
          chunkId: 'fixture',
          citationId: 'POLICY1',
          excerpt: '<script>hostile()</script>',
          source: {
            title: 'Sample title',
            sourceTitle: 'Actual source title',
            filename: 'sample.docx',
            policyId: 'DEMO-03',
            sourceVersionDate: '1.0 | test',
            version: 2,
            section: '4.1. Screen locking',
            page: null,
          },
        },
      ],
    },
  };
  const render = () => renderToStaticMarkup(createElement(ChatEvidence, { result }));
  const html = render();
  for (const label of [
    'Actual source title',
    'DEMONSTRATION / NOT OFFICIALLY APPROVED',
    'DEMO-03',
    '1.0 | test',
    '4.1. Screen locking',
    'Page unavailable',
  ])
    assert.ok(html.includes(label));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('PDF page'));
  result.data.matches = [];
  for (const [status, label] of [
    ['DISABLED', 'retrieval is disabled'],
    ['SOURCES_UNAVAILABLE', 'withdrawn or replaced'],
    ['NO_MATCHES', 'No supporting demonstration'],
  ]) {
    result.data.status = status;
    assert.ok(render().includes(label));
    assert.ok(!render().includes('POLICY1'));
  }
});
