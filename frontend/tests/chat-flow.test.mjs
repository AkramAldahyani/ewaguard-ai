import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createChatFlow, CHAT_SUGGESTIONS, chatError } from '../src/features/chat/chat-flow.js';
import { chatApi } from '../src/features/chat/chat-api.js';

const notice = { version: 'synthetic-v1', text: 'Synthetic provider privacy notice.' };
const conversation = (id = 'c1') => ({ id, createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z' });
const history = (id = 'c1') => ({ conversation: conversation(id), messages: [], requests: [], nextBefore: null, privacyNotice: notice });
const messages = [{ id: 'm1', role: 'USER', sequence: 0, content: 'How does MFA help?' }, { id: 'm2', role: 'ASSISTANT', sequence: 1, content: 'A second factor protects your account.' }];
const approval = (status = 'PENDING') => ({ id: 'a1', status, toolName: 'analyze_email', expiresAt: new Date(Date.now() + 300000).toISOString() });
const result = { data: { analyzerType: 'EMAIL', analysisId: 'analysis1', risk: { score: 70, riskLevel: 'HIGH', confidence: 'HIGH', version: 'synthetic' }, reasons: [{ code: 'SYNTHETIC', description: 'Synthetic verified reason' }] } };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function fixture(overrides = {}) {
  const calls = [];
  const defaults = {
    privacy: async () => ({ privacyNotice: notice }), list: async () => ({ conversations: [conversation()], nextBefore: null }),
    create: async () => ({ conversation: conversation(), privacyNotice: notice }), history: async (id) => history(id),
    send: async () => ({ messages, toolMetadata: {} }), recover: async () => ({ status: 'COMPLETED', approval: approval('COMPLETED'), result }),
    review: async () => ({ approval: approval(), parameters: { body: 'PRIVATE_SYNTHETIC_EMAIL', headers: '' } }),
    approval: async () => ({ approval: approval() }), decide: async (_id, _request, decision) => ({ approval: approval(decision === 'CONFIRM' ? 'COMPLETED' : 'REJECTED'), ...(decision === 'CONFIRM' ? { result } : {}) }),
    explain: async () => ({ approval: approval('COMPLETED'), result, explanation: { status: 'UNAVAILABLE', code: 'AI_BUDGET_EXHAUSTED' } }),
    ...overrides,
  };
  const api = Object.fromEntries(Object.entries(defaults).map(([key, fn]) => [key, (...args) => { calls.push({ key, args }); return fn(...args); }]));
  let id = 0;
  return { flow: createChatFlow(api, () => `request-${++id}`), calls };
}
async function ready(overrides) { const value = fixture(overrides); await value.flow.init(); value.flow.acknowledge(true); await value.flow.open('c1'); return value; }
const count = (calls, key) => calls.filter((call) => call.key === key).length;

test('current backend privacy notice is required before submission', async () => {
  const { flow, calls } = fixture(); await flow.init(); flow.edit('Hello'); await flow.send();
  assert.equal(count(calls, 'send'), 0); assert.equal(flow.getSnapshot().privacy.text, notice.text);
  flow.acknowledge(true); await flow.send(); assert.equal(count(calls, 'send'), 1);
  assert.equal(calls.find((c) => c.key === 'send').args[1].privacyNoticeVersion, notice.version);
});
test('new conversation creation, history list, retrieval and switching use backend state', async () => {
  const { flow } = await ready(); assert.equal(flow.getSnapshot().conversations[0].id, 'c1');
  await flow.create(); assert.equal(flow.getSnapshot().active.id, 'c1');
  await flow.open('c2'); assert.equal(flow.getSnapshot().active.id, 'c2'); assert.deepEqual(flow.getSnapshot().messages, []);
});
test('suggestions populate drafts without submitting; length and empty validation block calls', async () => {
  const { flow, calls } = await ready(); flow.edit(CHAT_SUGGESTIONS[0]); assert.match(flow.getSnapshot().draft, /suspicious email/);
  assert.equal(count(calls, 'send'), 0);
  for (const draft of [' ', 'x'.repeat(2001)]) { flow.edit(draft); await flow.send(); assert.match(flow.getSnapshot().error, /2,000/); }
  assert.equal(count(calls, 'send'), 0);
});
test('non-streaming submission blocks duplicates and displays the real returned messages', async () => {
  const gate = deferred(); const { flow, calls } = await ready({ send: () => gate.promise });
  flow.edit(messages[0].content); const sending = flow.send(); await flow.send();
  assert.equal(flow.getSnapshot().status, 'sending'); assert.equal(count(calls, 'send'), 1);
  assert.equal(calls.find((c) => c.key === 'send').args[1].requestId, 'request-1');
  gate.resolve({ messages }); await sending; assert.deepEqual(flow.getSnapshot().messages, messages);
});
test('switching conversations cancels transport and ignores a late response', async () => {
  const gate = deferred(); const { flow, calls } = await ready({ send: () => gate.promise });
  flow.edit('MFA?'); const pending = flow.send(); await flow.open('c2');
  assert.equal(calls.find((c) => c.key === 'send').args[2].aborted, true);
  gate.resolve({ messages }); await pending;
  assert.equal(flow.getSnapshot().active.id, 'c2'); assert.deepEqual(flow.getSnapshot().messages, []);
});
test('stale conversation retrieval cannot overwrite a newer selection', async () => {
  const gate = deferred(); const { flow } = await ready({ history: (id) => id === 'old' ? gate.promise : Promise.resolve(history(id)) });
  const pending = flow.open('old'); await flow.open('new'); gate.resolve(history('old')); await pending;
  assert.equal(flow.getSnapshot().active.id, 'new');
});
test('logout clears content, acknowledgement and late responses', async () => {
  const gate = deferred(); const { flow } = await ready({ send: () => gate.promise }); flow.edit('Hello');
  const pending = flow.send(); flow.clear(); gate.resolve({ messages }); await pending;
  assert.equal(flow.getSnapshot().active, null); assert.equal(flow.getSnapshot().privacy, null); assert.deepEqual(flow.getSnapshot().messages, []);
});
test('session expiration clears conversation data', async () => {
  const { flow } = await ready({ send: async () => { throw { status: 401 }; } }); flow.edit('Hello'); await flow.send();
  assert.equal(flow.getSnapshot().active, null); assert.match(flow.getSnapshot().error, /session has expired/);
});
for (const [code, expected] of [['AI_BUDGET_EXHAUSTED', /spending limit/], ['CHAT_DAILY_LIMIT', /daily/], ['AI_RATE_LIMITED', /provider is busy/], ['AI_TIMEOUT', /timed out/], ['AI_MODEL_UNAVAILABLE', /model is unavailable/], ['AI_TOOL_ROUND_LIMIT', /tool-round limit/], ['AI_INVALID_RESPONSE', /safely/], ['CHAT_NOT_FOUND', /retention/]]) {
  test(`${code} produces safe recovery guidance without retrying`, async () => {
    const { flow, calls } = await ready({ send: async () => { throw { code, message: 'INTERNAL_SECRET' }; } });
    flow.edit('Hello'); await flow.send(); assert.match(flow.getSnapshot().error, expected); assert.doesNotMatch(flow.getSnapshot().error, /INTERNAL_SECRET/);
    assert.equal(count(calls, 'send'), 1); assert.equal(flow.getSnapshot().requests[0].status, 'UNCONFIRMED');
  });
}
for (const toolName of ['analyze_email', 'analyze_url']) {
  test(`${toolName} private input travels separately and creates a pending approval without execution`, async () => {
    const { flow, calls } = await ready({ send: async () => ({ messages: [], pendingConfirmation: { ...approval(), toolName }, toolMetadata: { approvalId: 'a1' } }) });
    const analysisInput = { toolName, parameters: toolName === 'analyze_email' ? { body: 'PRIVATE_SENTINEL', headers: '' } : { url: 'https://synthetic.invalid/' } };
    await flow.send(analysisInput); const body = calls.find((c) => c.key === 'send').args[1];
    assert.deepEqual(body.analysisInput, analysisInput); assert.doesNotMatch(body.content, /PRIVATE_SENTINEL|synthetic.invalid/);
    assert.equal(flow.getSnapshot().requests[0].approval.status, 'PENDING'); assert.equal(count(calls, 'decide'), 0);
    assert.doesNotMatch(JSON.stringify(flow.getSnapshot()), /PRIVATE_SENTINEL|synthetic.invalid/);
  });
}
test('private review parameters are not retained in conversation receipts', async () => {
  const { flow } = await ready(); await flow.review('request-1', 'a1');
  assert.equal(flow.getSnapshot().review.parameters.body, 'PRIVATE_SYNTHETIC_EMAIL');
  assert.doesNotMatch(JSON.stringify(flow.getSnapshot().requests), /PRIVATE_SYNTHETIC_EMAIL/);
  flow.closeReview(); assert.doesNotMatch(JSON.stringify(flow.getSnapshot()), /PRIVATE_SYNTHETIC_EMAIL/);
});
test('approval requires explicit review and fresh backend status before execution', async () => {
  const { flow, calls } = await ready(); await flow.review('request-1', 'a1'); await flow.decide('CONFIRM');
  assert.equal(count(calls, 'decide'), 0); await flow.decide('CONFIRM', true);
  assert.deepEqual(calls.filter((c) => ['approval', 'decide'].includes(c.key)).map((c) => c.key), ['approval', 'decide']);
  assert.equal(flow.getSnapshot().requests[0].approval.status, 'COMPLETED'); assert.equal(count(calls, 'explain'), 0);
});
test('rejection is explicit and cannot then execute', async () => {
  const { flow, calls } = await ready(); await flow.review('request-1', 'a1'); await flow.decide('REJECT'); await flow.decide('CONFIRM', true);
  assert.equal(flow.getSnapshot().requests[0].approval.status, 'REJECTED'); assert.equal(count(calls, 'decide'), 1);
  assert.equal(calls.find((c) => c.key === 'decide').args[2], 'REJECT');
});
test('local expiry disables approval and server expiry blocks execution despite browser time', async () => {
  const expired = { ...approval(), expiresAt: new Date(0).toISOString() };
  const local = await ready({ review: async () => ({ approval: expired }) }); await local.flow.review('r', 'a1'); await local.flow.decide('CONFIRM', true);
  assert.equal(count(local.calls, 'decide'), 0);
  const remote = await ready({ approval: async () => ({ approval: approval('EXPIRED') }) }); await remote.flow.review('r', 'a1'); await remote.flow.decide('CONFIRM', true);
  assert.equal(count(remote.calls, 'decide'), 0); assert.equal(remote.flow.getSnapshot().requests[0].approval.status, 'EXPIRED');
  assert.match(chatError({ status: 410 }), /expired/);
});
test('result recovery never repeats submission or analysis, even when repeated', async () => {
  const { flow, calls } = await ready(); await flow.recover('r'); await flow.recover('r');
  assert.equal(flow.getSnapshot().requests[0].verifiedResults.length, 1);
  assert.equal(count(calls, 'send'), 0); assert.equal(count(calls, 'decide'), 0);
});
test('completed scan remains available after AI budget failure', async () => {
  const { flow, calls } = await ready(); await flow.recover('r'); await flow.explain('r', 'a1');
  assert.equal(flow.getSnapshot().requests[0].verifiedResults[0].data.risk.score, 70);
  assert.match(flow.getSnapshot().error, /spending limit/); assert.equal(count(calls, 'decide'), 0);
});
test('completed scan remains available after explanation transport failure', async () => {
  const { flow } = await ready({ explain: async () => { throw { code: 'AI_TIMEOUT' }; } }); await flow.recover('r'); await flow.explain('r', 'a1');
  assert.equal(flow.getSnapshot().requests[0].verifiedResults[0].data.analysisId, 'analysis1');
});
test('concurrent explicit confirmations issue only one decision', async () => {
  const gate = deferred(); const { flow, calls } = await ready({ decide: () => gate.promise });
  await flow.review('r', 'a1'); const first = flow.decide('CONFIRM', true); await flow.decide('CONFIRM', true);
  gate.resolve({ approval: approval('COMPLETED'), result }); await first;
  assert.equal(count(calls, 'decide'), 1);
});
test('switch during automatic conversation creation cannot send into another conversation', async () => {
  const gate = deferred(); const { flow, calls } = fixture({ create: () => gate.promise });
  await flow.init(); flow.acknowledge(true); flow.edit('Hello'); const first = flow.send();
  await flow.open('other'); gate.resolve({ conversation: conversation('created'), privacyNotice: notice }); await first;
  assert.equal(flow.getSnapshot().active.id, 'other'); assert.equal(count(calls, 'send'), 0);
});
test('multiple projections preserve guidance and coverage for the same analysis', async () => {
  const coverage = { ...result, data: { ...result.data, scannerStatuses: { clamav: 'UNAVAILABLE' }, assistance: { summary: 'Synthetic guidance' } } };
  const { flow } = await ready({ recover: async () => ({ verifiedResults: [coverage, result] }) });
  await flow.recover('r'); const saved = flow.getSnapshot().requests[0].verifiedResults;
  assert.equal(saved.length, 1); assert.equal(saved[0].data.scannerStatuses.clamav, 'UNAVAILABLE'); assert.ok(saved[0].data.assistance);
});
test('privacy version change requires fresh acknowledgement', async () => {
  const { flow, calls } = await ready({ history: async (id) => ({ ...history(id), privacyNotice: { ...notice, version: 'v2' } }) });
  flow.edit('Hello'); await flow.send(); assert.equal(count(calls, 'send'), 0);
});
test('history pagination merges ordered messages without duplicates and preserves receipts', async () => {
  const { flow } = await ready({ history: async (id, before) => ({ ...history(id), messages: before ? [messages[0]] : [messages[1]], nextBefore: before ? null : 1, requests: [{ requestId: 'r', status: 'COMPLETED', toolMetadata: { results: [] } }] }) });
  await flow.older(); assert.deepEqual(flow.getSnapshot().messages, messages); assert.equal(flow.getSnapshot().requests.length, 1);
});
test('chat API sends credentialed same-origin requests with exact approval contracts and cancellation', async (t) => {
  const calls = []; t.mock.method(globalThis, 'fetch', async (path, options) => { calls.push({ path, options }); return { ok: true, status: 200, json: async () => ({}) }; });
  const signal = new AbortController().signal;
  await chatApi.privacy(signal); await chatApi.list('cursor', signal); await chatApi.create(signal); await chatApi.history('c', 4, signal);
  await chatApi.send('c', { content: 'Hello', requestId: 'r', privacyNoticeVersion: notice.version }, signal);
  await chatApi.recover('c', 'r', signal); await chatApi.review('c', 'a', signal); await chatApi.approval('c', 'a', signal);
  await chatApi.decide('c', 'a', 'CONFIRM', signal); await chatApi.decide('c', 'a', 'REJECT', signal); await chatApi.explain('c', 'a', notice.version, signal);
  assert.equal(calls[6].path, '/api/tool-approvals/conversations/c/requests/a/review');
  for (const [index, decision] of [[8, 'CONFIRM'], [9, 'REJECT']]) { assert.equal(calls[index].path, '/api/tool-approvals/conversations/c/requests/a/decision'); assert.deepEqual(JSON.parse(calls[index].options.body), { decision }); }
  assert.equal(calls[10].path, '/api/chat/conversations/c/approvals/a/explanation');
  for (const call of calls) { assert.ok(call.path.startsWith('/api/')); assert.equal(call.options.credentials, 'include'); assert.equal(call.options.signal, signal); }
});
test('operational components render real evidence, escaped text, nonclickable URLs and explicit consent', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' }); t.after(() => server.close());
  const evidence = await server.ssrLoadModule('/src/features/chat/ChatEvidence.jsx');
  const dialogs = await server.ssrLoadModule('/src/features/chat/ChatDialogs.jsx');
  const page = await server.ssrLoadModule('/src/features/chat/AssistantPage.jsx');
  const chat = await server.ssrLoadModule('/src/features/chat/ChatMessages.jsx');
  const render = (component, props) => renderToStaticMarkup(createElement(component, props));
  const html = render(evidence.ChatEvidence, { result }); assert.match(html, /High risk|HIGH/); assert.match(html, /70/); assert.match(html, /Synthetic verified reason/);
  assert.match(render(evidence.ChatEvidence, { result: { data: { risk: { score: 999, riskLevel: 'LOW' } } } }), /unavailable/);
  const unsafe = render(chat.AIMessage, { preview: false, content: '<script>bad()</script> https://suspicious.invalid/' });
  assert.match(unsafe, /&lt;script&gt;/); assert.doesNotMatch(unsafe, /<script|href=|Preview response/);
  const privacy = render(page.ChatPrivacy, { notice, acknowledged: false, onChange() {} }); assert.match(privacy, /Synthetic provider/); assert.doesNotMatch(privacy, /checked=""/);
  const review = render(dialogs.ApprovalDialog, { review: { approval: approval(), parameters: { body: '<script>private</script>' } }, busy: false });
  assert.match(review, /disabled=""[^>]*>Approve analysis/); assert.match(review, /&lt;script&gt;/); assert.doesNotMatch(review, /checked=""|href=/);
  const unavailable = render(evidence.ChatReceipt, { request: { requestId: 'r', approval: approval('COMPLETED'), verifiedResults: [{ ...result, key: 'r' }], explanation: { status: 'UNAVAILABLE' } } });
  assert.match(unavailable, /completed analysis and deterministic guidance remain/); assert.match(unavailable, /70/);
  assert.doesNotMatch(html + unsafe + unavailable, /Security incident created|PDPL Article|OPENAI_API_KEY/);
});
