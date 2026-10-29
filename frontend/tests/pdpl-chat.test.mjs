import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createChatFlow } from '../src/features/chat/chat-flow.js';

const evidence = status => ({ key: 'pdpl', data: { kind: 'PDPL', status,
  notice: 'Unofficial English translation. Arabic legislation is authoritative. Not legal advice.',
  matches: status === 'MATCHES' ? [{ chunkId: 'chunk-1', citationId: 'PDPL1', excerpt: '<script>hostile()</script>',
    source: { title: 'Synthetic PDPL source', filename: 'bahrain_pdpl.pdf', version: 1, section: 'PDPL Article (1)', page: 3 } }] : [] } });

test('PDPL cards show real labels, disclaimers and escaped excerpts without a fake risk score', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { ChatEvidence } = await server.ssrLoadModule('/src/features/chat/ChatEvidence.jsx');
  const html = renderToStaticMarkup(createElement(ChatEvidence, { result: evidence('MATCHES') }));
  for (const label of ['PDPL1', 'PDPL Article (1)', 'PDF page 3', 'Unofficial English', 'Arabic legislation', 'Not legal advice']) assert.ok(html.includes(label));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('verified risk result is unavailable'));
  const withdrawn = renderToStaticMarkup(createElement(ChatEvidence, { result: evidence('SOURCES_UNAVAILABLE') }));
  assert.match(withdrawn, /withdrawn or are unavailable/); assert.ok(!withdrawn.includes('PDPL1'));
});

test('PDPL receipt recovery replaces stale passages rather than retaining withdrawn evidence', async () => {
  const privacyNotice = { version: 'pdpl-ui-test', text: 'Synthetic consent' };
  const conversation = { id: 'conversation-1' };
  let status = 'MATCHES';
  const flow = createChatFlow({ privacy: async () => ({ privacyNotice }), list: async () => ({ conversations: [] }),
    history: async () => ({ conversation, messages: [], requests: [], nextBefore: null, privacyNotice }),
    send: async () => ({ messages: [], verifiedResults: [evidence('MATCHES')], toolMetadata: { results: [{ name: 'search_pdpl' }] } }),
    recover: async () => ({ status: 'COMPLETED', verifiedResults: [evidence(status)] }) }, () => 'request-1');
  await flow.init(); flow.acknowledge(true); await flow.open(conversation.id);
  flow.edit('What is personal data under Bahrain PDPL?'); await flow.send();
  assert.equal(flow.getSnapshot().requests[0].verifiedResults[0].key, 'pdpl');
  status = 'SOURCES_UNAVAILABLE'; await flow.recover('request-1');
  assert.deepEqual(flow.getSnapshot().requests[0].verifiedResults[0].data.matches, []);
  flow.clear();
});
