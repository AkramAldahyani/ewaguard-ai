import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { canSend, chatReducer as reduce, initialChatState, MAX_MESSAGE_LENGTH, MAX_PREVIEW_TURNS, PREVIEW_REPLY, shouldSendOnEnter } from '../src/features/chat/chat-state.js';

const draft = (value) => reduce(initialChatState(), { type: 'draft', value });
const pending = () => reduce(draft('Non-sensitive example'), { type: 'send', id: 'one' });

test('empty input is rejected and drafts are bounded', () => {
  assert.equal(canSend(draft('   \n')), false);
  assert.equal(draft('x'.repeat(3000)).draft.length, MAX_MESSAGE_LENGTH);
  assert.equal(canSend({ ...initialChatState(), draft: 'x'.repeat(2001) }), false);
});
test('send, loading and completion use only the fixed preview reply', () => {
  const state = pending();
  assert.equal(state.status, 'loading');
  assert.equal(state.draft, '');
  assert.equal(reduce(state, { type: 'send', id: 'duplicate' }), state);
  assert.equal(reduce(state, { type: 'draft', value: 'busy' }), state);
  const complete = reduce(state, { type: 'complete', id: 'one' });
  assert.equal(complete.messages[1].content, PREVIEW_REPLY);
  assert.equal(complete.status, 'idle');
  assert.equal(reduce(complete, { type: 'complete', id: 'one' }), complete);
});
test('failure and retry do not duplicate the employee message; stale results are ignored', () => {
  const error = reduce(pending(), { type: 'fail', id: 'one' });
  assert.equal(error.status, 'error');
  assert.equal(canSend(error), false);
  const retry = reduce(error, { type: 'retry', id: 'two' });
  assert.equal(retry.messages.length, 1);
  assert.equal(reduce(retry, { type: 'complete', id: 'one' }), retry);
  assert.equal(reduce(retry, { type: 'fail', id: 'one' }), retry);
  assert.equal(reduce(retry, { type: 'complete', id: 'two' }).messages.length, 2);
  assert.equal(reduce(error, { type: 'dismiss' }).status, 'idle');
});
test('reset clears all content and ignores pending completion; conversation size is bounded', () => {
  const cleared = reduce(pending(), { type: 'reset' });
  assert.deepEqual(cleared, initialChatState());
  assert.equal(reduce(cleared, { type: 'complete', id: 'one' }), cleared);
  let state = initialChatState();
  for (let id = 0; id < MAX_PREVIEW_TURNS; id++) {
    state = reduce(state, { type: 'draft', value: 'Example' });
    state = reduce(state, { type: 'send', id });
    state = reduce(state, { type: 'complete', id });
  }
  state = reduce(state, { type: 'draft', value: 'Another' });
  assert.equal(canSend(state), false);
  assert.equal(state.messages.length, MAX_PREVIEW_TURNS * 2);
});
test('Enter sends, but newline modifiers and IME composition do not', () => {
  assert.equal(shouldSendOnEnter({ key: 'Enter' }), true);
  for (const field of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey', 'isComposing']) {
    assert.equal(shouldSendOnEnter({ key: 'Enter', [field]: true }), false);
  }
  assert.equal(shouldSendOnEnter({ key: 'Enter', nativeEvent: { isComposing: true } }), false);
  assert.equal(shouldSendOnEnter({ key: 'Enter', keyCode: 229 }), false);
  assert.equal(shouldSendOnEnter({ key: 'a' }), false);
});
test('structured components escape content and never invent missing results', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const components = await server.ssrLoadModule('/src/features/chat/ChatMessages.jsx');
  const render = (name, props = {}) => renderToStaticMarkup(createElement(components[name], props));
  for (const name of ['EmployeeMessage', 'AIMessage']) {
    const html = render(name, { content: '<script>alert(1)</script>' });
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  }
  const missing = render('AnalysisResultBlock');
  assert.match(missing, /Risk not assessed/);
  assert.doesNotMatch(missing, /Low risk/);
  assert.match(render('AnalysisResultBlock', { severity: 'HIGH', riskScore: 999 }), /High risk/);
  assert.doesNotMatch(render('AnalysisResultBlock', { severity: 'HIGH', riskScore: 999 }), /999/);
  const citation = render('CitationCard', { excerpt: '<img src=x onerror=alert(1)>' });
  assert.match(citation, /No source connected/);
  assert.doesNotMatch(citation, /<img|href=/);
  assert.match(render('IncidentEscalationBanner'), /no incident created/);
  assert.match(render('IncidentEscalationBanner', { preview: false }), /Incident confirmation unavailable/);
  assert.match(render('ToolRunningState'), /role="status"/);
  assert.match(render('ChatError'), /role="alert"/);
});

test('AI presentation formats readable structure while keeping hostile markup and links inert', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { MessageContent } = await server.ssrLoadModule('/src/features/chat/MessageContent.jsx');
  const content = '# Next steps\n\n**Verify first** using `trusted tools`.\n\n- Do not reply\n- Contact IT\n\n1. Report the message\n2. Wait for guidance\n\n```text\n<script>alert(1)</script>\n```\n\n| Check | Status |\n| --- | --- |\n| Attachment | Not scanned |\n\n[Example](https://suspicious.invalid/)\n<img src="https://tracker.invalid/x" onerror="alert(1)">\n[Bad](javascript:alert)';
  const html = renderToStaticMarkup(createElement(MessageContent, { content }));
  for (const pattern of [/<h3>Next steps<\/h3>/, /<strong>Verify first<\/strong>/, /<code>trusted tools<\/code>/, /<ul><li>/, /<ol start="1">/, /<pre><code>/, /<table>/, /<th scope="col">Check/, /Not scanned/, /&lt;script&gt;/, /&lt;img/]) assert.match(html, pattern);
  assert.doesNotMatch(html, /<(?:script|img|iframe|a)\b|<[^>]+\s(?:href|onerror)=/);
});

test('Markdown preserves paragraph flow, nested actions, escaped evidence, citations and trusted links', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { MessageContent } = await server.ssrLoadModule('/src/features/chat/MessageContent.jsx');
  const content = 'A short answer\ncontinues naturally.\n\n1. Report it\n   Include the sender.\n   - Keep the original\n\n2. Contact IT\n\n### Sources\n\n**[POLICY1] Sample policy**\n\n> Literal \\*asterisks\\* and \\[source\\].\n\n[CISA](https://www.cisa.gov/secure-our-world)\n[Unsafe](https://www.cisa.gov.evil.invalid/)\n[Tracked](https://www.cisa.gov/?secret=value)';
  const html = renderToStaticMarkup(createElement(MessageContent, { content }));
  assert.match(html, /<p>A short answer continues naturally\.<\/p>/);
  assert.match(html, /<ol start="1"><li><p>Report it Include the sender\.<\/p><ul><li>Keep the original<\/li><\/ul><\/li><li>Contact IT<\/li><\/ol>/);
  assert.match(html, /<strong><span class="chat-citation">\[POLICY1\]<\/span> Sample policy<\/strong>/);
  assert.match(html, /Literal \*asterisks\* and \[source\]\./);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.match(html, /href="https:\/\/www.cisa.gov\/secure-our-world" target="_blank" rel="noopener noreferrer"/);
});

test('knowledge-base lookups hide retrieval diagnostics and only warn about withdrawn sources', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { ChatReceipt } = await server.ssrLoadModule('/src/features/chat/ChatEvidence.jsx');
  const render = (status, kind = 'PDPL') => renderToStaticMarkup(createElement(ChatReceipt, { request: { status: 'COMPLETED', verifiedResults: [
    { key: 'source', data: { kind, status, matches: [{ chunkId: 'c1', citationId: 'PDPL1', excerpt: 'Excerpt', source: { title: 'Law', version: 1 } }] } },
  ] } }));
  for (const kind of ['PDPL', 'COMPANY_POLICY']) for (const status of ['MATCHES', 'NO_MATCHES', 'UNAVAILABLE']) assert.equal(render(status, kind), '');
  const withdrawn = render('SOURCES_UNAVAILABLE');
  assert.match(withdrawn, /withdrawn or replaced/);
  assert.doesNotMatch(withdrawn, /View full source passages|retrieval status|Retrieve saved status|Backend record/);
});
