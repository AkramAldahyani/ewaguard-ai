import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { shouldSendOnEnter } from '../src/features/chat/chat-state.js';

test('Enter sends, but newline modifiers and IME composition do not', () => {
  assert.equal(shouldSendOnEnter({ key: 'Enter' }), true);
  for (const field of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey', 'isComposing']) {
    assert.equal(shouldSendOnEnter({ key: 'Enter', [field]: true }), false);
  }
  assert.equal(shouldSendOnEnter({ key: 'Enter', nativeEvent: { isComposing: true } }), false);
  assert.equal(shouldSendOnEnter({ key: 'Enter', keyCode: 229 }), false);
  assert.equal(shouldSendOnEnter({ key: 'a' }), false);
});
test('message components escape content and never invent missing sources', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  t.after(() => server.close());
  const components = await server.ssrLoadModule('/src/features/chat/ChatMessages.jsx');
  const render = (name, props = {}) => renderToStaticMarkup(createElement(components[name], props));
  for (const name of ['EmployeeMessage', 'AIMessage']) {
    const html = render(name, { content: '<script>alert(1)</script>' });
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  }
  const citation = render('CitationCard', { excerpt: '<img src=x onerror=alert(1)>' });
  assert.match(citation, /No source connected/);
  assert.doesNotMatch(citation, /<img|href=/);
  assert.match(render('ToolRunningState', { label: 'Checking sources' }), /role="status"[^]*Checking sources/);
});

test('AI presentation formats readable structure while keeping hostile markup and links inert', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  t.after(() => server.close());
  const { MessageContent } = await server.ssrLoadModule('/src/features/chat/MessageContent.jsx');
  const content =
    '# Next steps\n\n**Verify first** using `trusted tools`.\n\n- Do not reply\n- Contact IT\n\n1. Report the message\n2. Wait for guidance\n\n```text\n<script>alert(1)</script>\n```\n\n| Check | Status |\n| --- | --- |\n| Attachment | Not scanned |\n\n[Example](https://suspicious.invalid/)\n<img src="https://tracker.invalid/x" onerror="alert(1)">\n[Bad](javascript:alert)';
  const html = renderToStaticMarkup(createElement(MessageContent, { content }));
  for (const pattern of [
    /<h3>Next steps<\/h3>/,
    /<strong>Verify first<\/strong>/,
    /<code>trusted tools<\/code>/,
    /<ul><li>/,
    /<ol start="1">/,
    /<pre><code>/,
    /<table>/,
    /<th scope="col">Check/,
    /Not scanned/,
    /&lt;script&gt;/,
    /&lt;img/,
  ])
    assert.match(html, pattern);
  assert.doesNotMatch(html, /<(?:script|img|iframe|a)\b|<[^>]+\s(?:href|onerror)=/);
});

test('Markdown preserves paragraph flow, nested actions, escaped evidence, citations and trusted links', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  t.after(() => server.close());
  const { MessageContent } = await server.ssrLoadModule('/src/features/chat/MessageContent.jsx');
  const content =
    'A short answer\ncontinues naturally.\n\n1. Report it\n   Include the sender.\n   - Keep the original\n\n2. Contact IT\n\n### Sources\n\n**[POLICY1] Sample policy**\n\n> Literal \\*asterisks\\* and \\[source\\].\n\n[CISA](https://www.cisa.gov/secure-our-world)\n[Unsafe](https://www.cisa.gov.evil.invalid/)\n[Tracked](https://www.cisa.gov/?secret=value)';
  const html = renderToStaticMarkup(createElement(MessageContent, { content }));
  assert.match(html, /<p>A short answer continues naturally\.<\/p>/);
  assert.match(
    html,
    /<ol start="1"><li><p>Report it Include the sender\.<\/p><ul><li>Keep the original<\/li><\/ul><\/li><li>Contact IT<\/li><\/ol>/,
  );
  assert.match(html, /<strong><span class="chat-citation">\[POLICY1\]<\/span> Sample policy<\/strong>/);
  assert.match(html, /Literal \*asterisks\* and \[source\]\./);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.match(html, /href="https:\/\/www.cisa.gov\/secure-our-world" target="_blank" rel="noopener noreferrer"/);
});

test('knowledge-base lookups hide retrieval diagnostics and only warn about withdrawn sources', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  t.after(() => server.close());
  const { ChatReceipt } = await server.ssrLoadModule('/src/features/chat/ChatEvidence.jsx');
  const render = (status, kind = 'PDPL') =>
    renderToStaticMarkup(
      createElement(ChatReceipt, {
        request: {
          status: 'COMPLETED',
          verifiedResults: [
            {
              key: 'source',
              data: {
                kind,
                status,
                matches: [
                  { chunkId: 'c1', citationId: 'PDPL1', excerpt: 'Excerpt', source: { title: 'Law', version: 1 } },
                ],
              },
            },
          ],
        },
      }),
    );
  for (const kind of ['PDPL', 'COMPANY_POLICY'])
    for (const status of ['MATCHES', 'NO_MATCHES', 'UNAVAILABLE']) assert.equal(render(status, kind), '');
  const withdrawn = render('SOURCES_UNAVAILABLE');
  assert.match(withdrawn, /withdrawn or replaced/);
  assert.doesNotMatch(withdrawn, /View full source passages|retrieval status|Retrieve saved status|Backend record/);
});
