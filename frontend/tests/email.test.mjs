import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createEmailFlow, validateEmailInput, emailErrorMessage, byteLength, EMAIL_INPUT_LIMITS } from '../src/features/email/email-state.js';
import { analyzePastedEmail, analyzeEml } from '../src/features/email/email-api.js';
import { analyzeEmail } from '../../backend/src/analyzers/email/email-analyzer.js';
import { EMAIL_LIMITS } from '../../backend/src/analyzers/email/email-policy.js';

test('employee email UI, state transitions and API contract', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { EmailAnalyzerPage, EmailInputForm } = await server.ssrLoadModule('/src/features/email/EmailAnalyzerPage.jsx');
  const { EmailResults } = await server.ssrLoadModule('/src/features/email/EmailResults.jsx');
  const render = (Component, props = {}) => renderToStaticMarkup(createElement(Component, props));
  const eml = 'From: Help Desk <support@example.invalid>\r\nReply-To: other@elsewhere.invalid\r\nSubject: Review request\r\nAuthentication-Results: inbound.invalid; spf=pass; dkim=fail; dmarc=fail\r\nContent-Type: multipart/mixed; boundary=fixture\r\n\r\n--fixture\r\nContent-Type: text/plain\r\n\r\nUrgent: provide your password. Visit http://example.invalid/account?secret=hidden\r\n--fixture\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="report.exe"\r\n\r\nHarmless synthetic attachment\r\n--fixture--';
  const result = await analyzeEmail({ inputType: 'EML', eml: Buffer.from(eml) });
  const analysis = { analysisId: 'test-analysis', createdAt: '2026-10-06T12:00:00Z', result };
  const valid = { mode: 'paste', body: 'A synthetic message', headers: '', file: null };
  const api = { analyzePastedEmail: async () => analysis, analyzeEml: async () => analysis };
  const ready = (client = api) => { const flow = createEmailFlow(client); flow.acknowledge(); flow.edit('body', valid.body); return flow; };

  await t.test('disclaimer is mandatory before any form or submission', async () => {
    const html = render(EmailAnalyzerPage);
    assert.match(html, /Sensitive Information Notice/);
    assert.doesNotMatch(html, /type="file"|<textarea|checked=""|Preview only/);
    assert.match(html, /disabled=""[^>]*>Acknowledge and continue/);
    let calls = 0;
    const flow = createEmailFlow({ analyzePastedEmail: () => { calls += 1; } });
    flow.edit('body', 'Hello');
    await flow.submit();
    assert.equal(calls, 0);
  });
  await t.test('paste mode renders associated labels, required body and byte guidance', () => {
    const flow = ready();
    const html = render(EmailInputForm, { flow, state: flow.getSnapshot() });
    assert.match(html, /for="email-body"/);
    assert.match(html, /id="email-body"[^>]*required/);
    assert.match(html, /Raw headers \(optional\)/);
    assert.match(html, /24 KiB|8 KiB/);
    assert.match(html, /type="radio"/);
  });
  await t.test('upload mode renders keyboard-accessible picker and one-file guidance', () => {
    const flow = ready(); flow.changeMode('eml');
    const html = render(EmailInputForm, { flow, state: flow.getSnapshot() });
    assert.match(html, /type="file"/);
    assert.match(html, /accept=".eml,message\/rfc822"/);
    assert.match(html, /for="email-file"/);
    assert.match(html, /1 MiB/);
    assert.doesNotMatch(html, /<textarea|multiple=/);
  });
  await t.test('blank body is rejected before API invocation', async () => {
    const flow = ready(); flow.edit('body', ' \n\t');
    await flow.submit();
    assert.equal(flow.getSnapshot().status, 'error');
    assert.match(flow.getSnapshot().error, /Enter the email body/);
  });
  await t.test('body limits use UTF-8 bytes and match backend without truncation', () => {
    assert.equal(EMAIL_INPUT_LIMITS.body, EMAIL_LIMITS.bodyBytes);
    assert.equal(byteLength('é'), 2);
    assert.match(validateEmailInput({ ...valid, body: 'é'.repeat(12289) }), /24 KiB/);
    assert.equal(validateEmailInput({ ...valid, body: 'x'.repeat(24576) }), '');
    const flow = ready(); const value = 'x'.repeat(24577); flow.edit('body', value);
    assert.equal(flow.getSnapshot().body, value);
  });
  await t.test('header limit is enforced independently', () => {
    assert.equal(EMAIL_INPUT_LIMITS.headers, EMAIL_LIMITS.headerBytes);
    assert.match(validateEmailInput({ ...valid, headers: 'x'.repeat(8193) }), /8 KiB/);
  });
  await t.test('invalid, multiple and empty files are rejected', () => {
    const flow = ready(); flow.changeMode('eml');
    for (const files of [[new File(['text'], 'report.pdf')], [new File([], 'empty.eml')], [new File(['a'], 'a.eml'), new File(['b'], 'b.eml')]]) {
      flow.selectFiles(files); assert.equal(flow.getSnapshot().file, null); assert.equal(flow.getSnapshot().status, 'error');
    }
    assert.match(validateEmailInput(flow.getSnapshot()), /Choose one/);
  });
  await t.test('1 MiB file boundary enforced and selected name/size displayed', () => {
    assert.equal(EMAIL_INPUT_LIMITS.file, EMAIL_LIMITS.emlBytes);
    const flow = ready(); flow.changeMode('eml');
    flow.selectFiles([new File(['x'.repeat(1048577)], 'large.eml')]);
    assert.match(flow.getSnapshot().error, /1 MiB/);
    flow.selectFiles([new File(['x'.repeat(1048576)], 'message.eml')]);
    const html = render(EmailInputForm, { flow, state: flow.getSnapshot() });
    assert.match(html, /message.eml/); assert.match(html, /1024.0 KiB/); assert.match(html, /Remove file/);
  });
  await t.test('API functions use correct paths, credentials and multipart boundary behavior', async (t) => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (path, options) => { calls.push({ path, options }); return { ok: true, status: 201, json: async () => analysis }; });
    await analyzePastedEmail({ body: 'hello', headers: '' });
    await analyzeEml(new File([eml], 'message.eml'));
    assert.equal(calls[0].path, '/api/analysis/email/text');
    assert.deepEqual(JSON.parse(calls[0].options.body), { body: 'hello', headers: '' });
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.equal(calls[1].path, '/api/analysis/email/eml');
    assert.ok(calls[1].options.body instanceof FormData);
    assert.deepEqual([...calls[1].options.body.keys()], ['file']);
    assert.equal(calls[1].options.headers['Content-Type'], undefined);
    for (const { options } of calls) assert.equal(options.credentials, 'include');
  });
  await t.test('duplicate submission blocked; loading announced and controls disabled', async () => {
    let finish; let calls = 0;
    const flow = ready({ analyzePastedEmail: () => { calls += 1; return new Promise((resolve) => { finish = resolve; }); } });
    const pending = flow.submit(); await flow.submit();
    assert.equal(calls, 1);
    assert.equal(flow.getSnapshot().status, 'submitting');
    const html = render(EmailInputForm, { flow, state: flow.getSnapshot() });
    assert.match(html, /aria-busy="true"/); assert.match(html, /<fieldset disabled/); assert.match(html, /Analyzing email/);
    flow.edit('body', 'ignored'); flow.changeMode('eml');
    assert.equal(flow.getSnapshot().body, valid.body);
    finish(analysis); await pending;
    assert.equal(flow.getSnapshot().status, 'success');
  });
  await t.test('structured result renders all sections from real analyzer output', () => {
    const html = render(EmailResults, { analysis });
    for (const title of ['Analysis Summary', 'Sender Information', 'Reply-To Information', 'Authentication Evidence', 'Detected Indicators', 'URLs Found', 'Attachments', 'Recommended Actions', 'Limitations']) assert.ok(html.includes(title));
    assert.match(html, /Sender and Reply-To differ/);
    assert.match(html, /local part omitted/);
  });
  await t.test('all provisional classifications display without final severity or score', () => {
    for (const [value, label] of [['NO_STRONG_INDICATORS', 'No Strong Indicators'], ['SUSPICIOUS', 'Suspicious'], ['HIGHLY_SUSPICIOUS', 'Highly Suspicious']]) {
      const html = render(EmailResults, { analysis: { ...analysis, result: { ...result, provisionalClassification: value } } });
      assert.ok(html.includes(label)); assert.match(html, /Final risk evaluation will use the EWAGuard risk engine/);
      assert.doesNotMatch(html, /Low risk|Medium risk|High risk|Critical risk|\/100/);
    }
  });
  await t.test('authentication claims and unavailable/conflicting states never imply verification', () => {
    const html = render(EmailResults, { analysis });
    assert.match(html, />spf</); assert.match(html, />dkim</); assert.match(html, />dmarc</);
    assert.match(html, /PASS/); assert.match(html, /FAIL/); assert.match(html, /Not independently verified/);
    const altered = { ...result, authentication: { ...result.authentication, spf: { status: 'CONFLICTING_CLAIMS', claimedResults: ['PASS', 'FAIL'] }, dkim: { status: 'UNAVAILABLE', claimedResults: [] } } };
    const states = render(EmailResults, { analysis: { ...analysis, result: altered } });
    assert.match(states, /CONFLICTING CLAIMS/); assert.match(states, /UNAVAILABLE/);
  });
  await t.test('indicator titles and evidence notes render; internal weights stay hidden', () => {
    const html = render(EmailResults, { analysis });
    assert.match(html, /Request to provide credentials/);
    assert.match(html, /Observed by a local heuristic/);
    assert.doesNotMatch(html, /severityWeight|CREDENTIAL_REQUEST/);
  });
  await t.test('URL origins remain text with no links, images or previews', () => {
    const html = render(EmailResults, { analysis });
    assert.match(html, /http:\/\/example.invalid/);
    assert.doesNotMatch(html, /<a\b|<img\b|<iframe\b|secret=hidden/);
    assert.match(html, /URL reputation checking is not included/);
  });
  await t.test('attachment metadata is NOT SCANNED with no open/download controls', () => {
    const html = render(EmailResults, { analysis });
    assert.match(html, /report.exe/); assert.match(html, /NOT SCANNED/);
    assert.match(html, /not malware-scanned/); assert.doesNotMatch(html, /download=|>Open<|Harmless synthetic attachment/);
  });
  await t.test('limitations and deterministic recommended actions are visible', () => {
    const html = render(EmailResults, { analysis });
    assert.match(html, /Pattern checks can miss attacks/);
    assert.match(html, /Do not provide passwords or authentication codes/);
  });
  await t.test('hostile display metadata is escaped; no raw HTML rendering', () => {
    const hostile = '<img src="https://hostile.invalid" onerror="alert(1)">';
    const html = render(EmailResults, { analysis: { ...analysis, result: { ...result, subject: hostile, sender: { ...result.sender, displayName: hostile } } } });
    assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img\b|<script\b/);
  });
  await t.test('backend errors map to fixed safe messages; raw exceptions never display', async () => {
    for (const error of [{ status: 500 }, { status: 429 }, { status: 413 }, { status: 401 }, { code: 'MALFORMED_EMAIL' }, { code: 'EMAIL_PARSE_FAILED' }, { code: 'INVALID_EMAIL_UPLOAD' }]) assert.ok(emailErrorMessage({ ...error, message: 'SECRET SQL STACK' }));
    const flow = ready({ analyzePastedEmail: async () => { throw new Error('SECRET SQL STACK'); } });
    await flow.submit(); assert.equal(flow.getSnapshot().status, 'error'); assert.doesNotMatch(flow.getSnapshot().error, /SECRET|SQL|STACK/);
  });
  await t.test('expired acknowledgement clears content and reopens renewable disclaimer', async () => {
    const flow = ready({ analyzePastedEmail: async () => { throw { code: 'EMAIL_ACKNOWLEDGEMENT_REQUIRED', status: 403 }; } });
    await flow.submit();
    assert.equal(flow.getSnapshot().acknowledged, false);
    assert.equal(flow.getSnapshot().noticeKey, 1);
    assert.equal(flow.getSnapshot().body, '');
    assert.match(flow.getSnapshot().error, /renewed/);
    flow.acknowledge(); assert.equal(flow.getSnapshot().acknowledged, true); assert.equal(flow.getSnapshot().error, '');
  });
  await t.test('success and reset clear sensitive form and result state', async () => {
    const flow = ready(); flow.edit('headers', 'From: person@example.invalid'); await flow.submit();
    assert.equal(flow.getSnapshot().body, ''); assert.equal(flow.getSnapshot().headers, '');
    assert.equal(flow.getSnapshot().result, analysis);
    flow.reset(); assert.equal(flow.getSnapshot().result, null); assert.equal(flow.getSnapshot().error, '');
    flow.changeMode('eml'); flow.selectFiles([new File([eml], 'message.eml')]); await flow.submit();
    assert.equal(flow.getSnapshot().file, null); flow.reset(); assert.equal(flow.getSnapshot().result, null);
  });
  await t.test('reset aborts pending request and ignores late result; mode change clears drafts', async () => {
    let finish; let signal;
    const flow = ready({ analyzePastedEmail: (_, requestSignal) => { signal = requestSignal; return new Promise((resolve) => { finish = resolve; }); } });
    const pending = flow.submit(); flow.reset(); assert.equal(signal.aborted, true);
    finish(analysis); await pending; assert.equal(flow.getSnapshot().result, null);
    flow.edit('body', 'sensitive draft'); flow.changeMode('eml'); assert.equal(flow.getSnapshot().body, '');
    flow.dispose(); assert.equal(flow.getSnapshot().file, null);
  });
});
