import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { analyzeFile, createFileFlow, validateFile, fileErrorMessage } from '../src/features/file/file-state.js';
import { FILE_MAX_BYTES, FILE_EXTENSIONS } from '../../shared/file-policy.js';
import { createFileAnalyzer } from '../../backend/src/analyzers/file/file-analyzer.js';

test('employee file analyzer UI, safe presentation and interaction lifecycle', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { FileAnalyzerPage, FileInputForm } = await server.ssrLoadModule('/src/features/file/FileAnalyzerPage.jsx');
  const { FileResults } = await server.ssrLoadModule('/src/features/file/FileResults.jsx');
  const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
  const analyzer = createFileAnalyzer({
    tempStore: { withFile: async (_, operation) => operation({ filename: 'synthetic', directory: 'synthetic' }) },
    scanners: { clamav: async () => ({ status: 'UNAVAILABLE', detections: [] }), yara: async () => ({ status: 'NO_MATCH', matches: [] }) },
  });
  const analysis = { analysisId: 'fixture-id', createdAt: new Date().toISOString(), result: await analyzer({ originalname: 'private.txt', mimetype: 'text/plain', buffer: Buffer.from('PRIVATE_FILE_CONTENT') }) };
  const file = new File(['harmless text'], 'fixture.txt', { type: 'text/plain' });
  const ready = (submit = async () => analysis) => { const flow = createFileFlow(submit); flow.acknowledge(); flow.selectFiles([file]); return flow; };

  await t.test('active acknowledgement precedes file selection', async () => {
    const html = render(FileAnalyzerPage); assert.match(html, /Sensitive Information Notice/); assert.doesNotMatch(html, /type="file"|checked=""|Preview only/);
    assert.match(html, /SHA-256 reputation lookup only/);
    const flow = createFileFlow(() => assert.fail()); flow.selectFiles([file]); await flow.submit();
  });
  await t.test('upload form has keyboard picker, selected metadata, guidance, remove and Analyze controls', () => {
    const flow = ready(); const html = render(FileInputForm, { flow, state: flow.getSnapshot() });
    assert.match(html, /for="file-upload"/); assert.match(html, /type="file"/); assert.match(html, /Maximum 10 MiB/);
    assert.match(html, /fixture.txt/); assert.match(html, /Extension: TXT/); assert.match(html, /Remove file/);
    for (const ext of FILE_EXTENSIONS) assert.ok(html.includes(`.${ext}`));
    assert.doesNotMatch(html, /<iframe\b|<object\b|<embed\b|<img\b|<video\b|<audio\b|multiple=/);
  });
  await t.test('size, empty, extension and one-file limits match backend policy', () => {
    assert.ok(validateFile(null)); assert.ok(validateFile(new File([], 'empty.txt')));
    assert.ok(validateFile({ name: 'oversized.txt', size: FILE_MAX_BYTES + 1 }));
    assert.equal(validateFile({ name: 'maximum.txt', size: FILE_MAX_BYTES }), '');
    assert.ok(validateFile(new File(['text'], 'blocked.iso')));
    const flow = ready(); flow.selectFiles([file, file]); assert.equal(flow.getSnapshot().file, null); assert.match(flow.getSnapshot().error, /exactly one/);
    flow.selectFiles([file]); flow.selectFiles([]); assert.equal(flow.getSnapshot().file, null);
  });
  await t.test('multipart contract contains one file only, session cookie, and no hand-written boundary', async (t) => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, '/api/analysis/file'); assert.equal(options.credentials, 'include');
      assert.ok(options.body instanceof FormData); assert.deepEqual([...options.body.keys()], ['file']);
      assert.equal(options.headers['Content-Type'], undefined);
      return { ok: true, status: 201, json: async () => analysis };
    });
    await analyzeFile(file);
  });
  await t.test('all nine result sections show partial coverage and hash-only privacy', () => {
    const html = render(FileResults, { analysis });
    for (const title of ['Analysis Summary', 'File Information', 'File Validation', 'ClamAV Result', 'YARA Result', 'VirusTotal Hash Reputation', 'Indicators', 'Recommended Actions', 'Limitations']) assert.ok(html.includes(title));
    assert.match(html, /Partial evidence/); assert.match(html, /Local antivirus scanning was unavailable/); assert.match(html, /NOT CONFIGURED/);
    assert.match(html, /The file itself was not uploaded to VirusTotal/); assert.doesNotMatch(html, /PRIVATE_FILE_CONTENT|private.txt|<iframe\b|<object\b|<img\b|<embed\b|download=/);
  });
  await t.test('detection names, YARA descriptions, hash counts and no-report state render safely', () => {
    const result = { ...analysis.result, clamav: { status: 'DETECTED', detections: ['Synthetic.Detection'] },
      yara: { status: 'MATCH', matches: [{ name: 'EWAGuard_Harmless_Demo', strength: 'DEMO', description: 'Harmless rule fixture' }] },
      threatIntelligence: { status: 'AVAILABLE', maliciousCount: 7, suspiciousCount: 1, harmlessCount: 3, undetectedCount: 40 } };
    const html = render(FileResults, { analysis: { ...analysis, result } });
    assert.match(html, /Synthetic.Detection/); assert.match(html, /Harmless rule fixture/); assert.match(html, /Malicious detections/);
    assert.match(render(FileResults, { analysis: { ...analysis, result: { ...result, threatIntelligence: { status: 'NO_REPORT' } } } }), /file will not be submitted/);
    result.file = { ...result.file, displayName: '<img src=x onerror=alert(1)>' };
    const escaped = render(FileResults, { analysis: { ...analysis, result } }); assert.match(escaped, /&lt;img/); assert.doesNotMatch(escaped, /<img\b/);
  });
  await t.test('honest scanning state, duplicate protection, success/reset clear file and result', async () => {
    let finish; let calls = 0;
    const flow = ready(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
    const pending = flow.submit(); await flow.submit(); assert.equal(calls, 1);
    assert.match(render(FileInputForm, { flow, state: flow.getSnapshot() }), /aria-busy="true"/);
    assert.match(render(FileInputForm, { flow, state: flow.getSnapshot() }), /Scanning file/);
    finish(analysis); await pending; assert.equal(flow.getSnapshot().file, null); assert.ok(flow.getSnapshot().result);
    flow.reset(); assert.equal(flow.getSnapshot().result, null);
  });
  await t.test('abort prevents stale result; acknowledgement/session/failure messages are safe', async () => {
    let finish; let signal;
    const flow = ready((_, s) => { signal = s; return new Promise((resolve) => { finish = resolve; }); });
    const pending = flow.submit(); flow.reset(); assert.ok(signal.aborted); finish(analysis); await pending; assert.equal(flow.getSnapshot().result, null);
    const expired = ready(async () => { throw { code: 'FILE_ACKNOWLEDGEMENT_REQUIRED' }; }); await expired.submit();
    assert.equal(expired.getSnapshot().acknowledged, false); assert.equal(expired.getSnapshot().file, null);
    for (const status of [401, 429, 413, 500]) assert.doesNotMatch(fileErrorMessage({ status, message: 'RAW_SECRET' }), /RAW_SECRET/);
  });
});
