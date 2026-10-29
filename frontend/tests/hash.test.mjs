import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createHashFlow, lookupFileHash, validateSha256 } from '../src/features/file/hash-state.js';
import { analyzeFileHash } from '../../backend/src/analyzers/file/hash-analysis.js';
import { waitForSubmission } from './analysis-wait.mjs';

const hash = 'a'.repeat(64);
test('hash form validation, normalization, duplicate prevention and reset cancellation', async () => {
  assert.equal(validateSha256(` ${hash.toUpperCase()} `), '');
  for (const value of ['', 'xyz', 'a'.repeat(63), 'a'.repeat(65)]) assert.ok(validateSha256(value));
  let finish, calls = 0, signal;
  const flow = createHashFlow((value, abort) => {
    calls++; assert.equal(value, hash); signal = abort;
    return new Promise((resolve) => { finish = resolve; });
  });
  await flow.submit(); assert.equal(calls, 0);
  flow.edit(hash.toUpperCase()); const pending = flow.submit(); await flow.submit();
  await waitForSubmission(() => calls === 1);
  assert.equal(calls, 1);
  assert.equal(flow.getSnapshot().status, 'submitting');
  flow.reset(); assert.equal(signal.aborted, true);
  finish({ finding: 'UNKNOWN' }); await pending;
  assert.equal(flow.getSnapshot().result, null);
  assert.equal(flow.getSnapshot().hash, '');
});
test('hash lookup sends normalized hash JSON, retry key and cookies to the dedicated endpoint', async (t) => {
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, '/api/analysis/file/hash');
    assert.deepEqual(JSON.parse(options.body), { sha256: hash });
    assert.equal(options.credentials, 'include');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.headers['Idempotency-Key'], 'test-key');
    return Response.json({ finding: 'UNKNOWN' });
  });
  assert.equal((await lookupFileHash(hash.toUpperCase(), undefined, 'test-key')).finding, 'UNKNOWN');
});
test('ambiguous hash failures retain the retry key; successful checks create a fresh key', async () => {
  const keys = [];
  const flow = createHashFlow(async (_, __, key) => {
    keys.push(key);
    if (keys.length === 1) throw new Error('network failure');
    return { finding: 'UNKNOWN' };
  });
  flow.edit(hash); await flow.submit(); await flow.submit();
  assert.equal(keys[0], keys[1]);
  await flow.submit();
  assert.notEqual(keys[1], keys[2]);
});
test('hash success and failure states remain distinct and failures hide internal details', async () => {
  const flow = createHashFlow(async () => ({ finding: 'UNKNOWN' }));
  flow.edit(hash); await flow.submit();
  assert.equal(flow.getSnapshot().status, 'success');
  flow.edit('b'.repeat(64)); assert.equal(flow.getSnapshot().result, null);
  const failed = createHashFlow(async () => { throw new Error('PRIVATE_DATABASE_SECRET'); });
  failed.edit(hash); await failed.submit();
  assert.equal(failed.getSnapshot().status, 'error');
  assert.doesNotMatch(failed.getSnapshot().error, /PRIVATE/);
});
test('hash UI labels, unknown/zero/detected findings, coverage and provider status', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { HashLookup, HashResult } = await server.ssrLoadModule('/src/features/file/HashLookup.jsx');
  const form = renderToStaticMarkup(createElement(HashLookup));
  assert.match(form, /for="file-sha256"/);
  assert.match(form, /Check a SHA-256 hash/);
  assert.match(form, /hash is sent to VirusTotal/);
  for (const [report, expected] of [
    [{ status: 'NO_REPORT' }, /Unknown.*no usable reputation result/],
    [{ status: 'NOT_CONFIGURED' }, /Reputation service is not configured/],
    [{ status: 'RATE_LIMITED' }, /Provider rate limit/],
    [{ status: 'AVAILABLE', maliciousCount: 0, suspiciousCount: 0, harmlessCount: 10, undetectedCount: 50 }, /No known detection/],
    [{ status: 'AVAILABLE', maliciousCount: 15, suspiciousCount: 0, harmlessCount: 10, undetectedCount: 35 }, /Suspicious or malicious detections reported/],
  ]) {
    const result = await analyzeFileHash(hash, { lookupFileHash: async () => ({ provider: 'VIRUSTOTAL', scope: 'FILE_HASH', ...report }) });
    const html = renderToStaticMarkup(createElement(HashResult, { result }));
    assert.match(html, expected);
    assert.match(html, /zero detections do not establish safety/);
    assert.match(html, /not a file scan/);
    assert.doesNotMatch(html, /<a\b|<iframe\b|file is safe/);
  }
});
