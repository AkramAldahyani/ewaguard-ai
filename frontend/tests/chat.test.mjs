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
