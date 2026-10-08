import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { inspectFile } from '../src/analyzers/file/file-inspection.js';
import { createFileTempStore } from '../src/analyzers/file/file-temp.js';
import { runScanner, normalizeClamav, normalizeYara, createFileScanners } from '../src/analyzers/file/file-scanners.js';
import { createFileAnalyzer, classifyFile, submitFileAnalysis } from '../src/analyzers/file/file-analyzer.js';
import { FILE_MAX_BYTES, DEFAULT_YARA_RULES } from '../src/analyzers/file/file-policy.js';
import { createThreatIntelligence } from '../src/services/threat-intelligence.js';
import { benignText, pdfFixture, executableFixture, zipFixture } from './file-fixtures.js';

const upload = (buffer = benignText(), originalname = 'fixture.txt', mimetype = 'text/plain') => ({ buffer, originalname, mimetype });
const clean = { status: 'CLEAN', detections: [] }; const noMatch = { status: 'NO_MATCH', matches: [] };
const scanners = { clamav: async () => clean, yara: async () => noMatch };
async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ewaguard-file-test-'));
  t.after(async () => { assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  return root;
}
test('layered file inspection, bounded archive metadata and hash', async (t) => {
  await t.test('benign text hash is correct and original filename omitted', async () => {
    const bytes = benignText(); const result = await inspectFile(upload(bytes, 'SECRET_FILENAME.txt'));
    assert.equal(result.file.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.file.detectedType, 'TEXT'); assert.doesNotMatch(JSON.stringify(result), /SECRET_FILENAME|Harmless synthetic/);
  });
  for (const [name, bytes, type] of [['document.pdf', pdfFixture(), 'PDF'], ['script.ps1', Buffer.from('# Harmless script fixture\n'), 'TEXT'], ['app.exe', executableFixture(), 'PE'],
    ['image.png', Buffer.from('89504e470d0a1a0a', 'hex'), 'PNG'], ['legacy.doc', Buffer.from('d0cf11e0a1b11ae1', 'hex'), 'OLE'], ['archive.zip', zipFixture(), 'ZIP']]) {
    await t.test(name, async () => assert.equal((await inspectFile(upload(bytes, name, 'application/octet-stream'))).file.detectedType, type));
  }
  await t.test('PE disguised as PDF, MIME mismatch, double extension and traversal are evidence', async () => {
    const mismatched = await inspectFile(upload(executableFixture(), 'invoice.pdf', 'application/pdf'));
    assert.equal(mismatched.validation.extensionMismatch, true); assert.equal(mismatched.validation.mimeMismatch, true);
    assert.equal((await inspectFile(upload(executableFixture(), 'invoice.pdf.exe'))).validation.doubleExtension, true);
    const traversal = await inspectFile(upload(benignText(), '../../SECRET.txt'));
    assert.equal(traversal.validation.suspiciousFilename, true); assert.equal(traversal.file.displayName, 'Submitted file.txt');
  });
  for (const [data, code] of [[upload(Buffer.alloc(0)), 'EMPTY_FILE'], [upload(Buffer.alloc(FILE_MAX_BYTES + 1)), 'FILE_TOO_LARGE'],
    [upload(benignText(), 'bad.iso'), 'UNSUPPORTED_FILE'], [upload(Buffer.from([0, 1, 2]), 'fake.txt'), 'UNSUPPORTED_FILE']]) {
    await t.test(code, () => assert.rejects(inspectFile(data), { code }));
  }
  await t.test('ZIP metadata identifies Office, encrypted/nested/executable/macro/path indicators without extraction', async () => {
    const bytes = zipFixture([{ name: '[Content_Types].xml' }, { name: 'word/document.xml' }, { name: 'word/vbaProject.bin' }, { name: '../launch.exe', encrypted: true }, { name: 'inner.zip' }]);
    const result = await inspectFile(upload(bytes, 'fixture.docx', 'application/octet-stream'));
    assert.equal(result.file.detectedType, 'DOCX'); assert.equal(result.validation.extensionMismatch, false);
    for (const key of ['encrypted', 'unsafePaths', 'executableEntries', 'nestedArchive', 'macroEntry']) assert.equal(result.validation.archive[key], true);
    assert.doesNotMatch(JSON.stringify(result), /launch.exe|word\/document|synthetic/);
  });
  await t.test('invalid ZIP and too many entries remain bounded coverage evidence', async () => {
    const invalid = await inspectFile(upload(Buffer.from('PK\x03\x04fake'), 'archive.zip'));
    assert.equal(invalid.validation.archive.status, 'INVALID');
    const large = await inspectFile(upload(zipFixture(Array.from({ length: 201 }, (_, i) => ({ name: `item${i}.txt` }))), 'archive.zip'));
    assert.equal(large.validation.archive.status, 'LIMIT_EXCEEDED');
  });
});

test('temporary lifecycle: randomized exclusive paths, success/failure cleanup and stale cleanup', async (t) => {
  const root = await temporary(t); const store = createFileTempStore(root); const paths = [];
  for (const fail of [false, true]) {
    const work = store.withFile(benignText(), async (file) => {
      paths.push(file.filename); assert.equal(path.dirname(file.directory), root);
      assert.match(path.basename(file.filename), /^[a-f0-9-]{36}\.upload$/);
      assert.deepEqual(await fs.readFile(file.filename), benignText());
      if (fail) throw new Error('synthetic failure'); return 'result';
    });
    if (fail) await assert.rejects(work, /synthetic failure/); else assert.equal(await work, 'result');
    assert.deepEqual(await fs.readdir(root), []);
  }
  assert.notEqual(paths[0], paths[1]);
  const stale = path.join(root, randomUUID()); const fresh = path.join(root, randomUUID()); const unrelated = path.join(root, 'do-not-delete');
  for (const directory of [stale, fresh, unrelated]) await fs.mkdir(directory);
  const old = new Date(Date.now() - 2 * 86400_000); await fs.utimes(stale, old, old); await fs.utimes(unrelated, old, old);
  assert.equal(await store.cleanupStale(), true);
  assert.deepEqual((await fs.readdir(root)).sort(), [path.basename(fresh), 'do-not-delete'].sort());
});
test('cleanup failure is sanitized and prevents persistence', async (t) => {
  const root = await temporary(t); const logs = [];
  t.mock.method(console, 'error', (message) => logs.push(message));
  const tempStore = createFileTempStore(root, { ...fs, rm: async () => { throw new Error('PRIVATE_PATH'); } });
  const analyzer = createFileAnalyzer({ scanners, tempStore });
  const bytes = benignText();
  await assert.rejects(submitFileAnalysis({ fileAnalysis: { create: () => assert.fail('must not persist') } }, { userId: 'employee', acknowledgementId: 'ack', upload: upload(bytes) }, analyzer), { code: 'FILE_CLEANUP_FAILED' });
  assert.ok(bytes.every((v) => v === 0)); assert.doesNotMatch(logs.join(''), /PRIVATE_PATH|ewaguard-file-test/);
});

test('direct scanner process contract and normalized failures', async (t) => {
  const directory = os.tmpdir(); const executable = path.join(directory, 'trusted-scanner.exe');
  await t.test('uses argument arrays, no shell, hidden windows, capped output and timeout; no secret env', async () => {
    const result = await runScanner(executable, ['one', 'two'], { directory, timeoutMs: 100 }, (exe, args, options, callback) => {
      assert.equal(exe, executable); assert.deepEqual(args, ['one', 'two']); assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
      assert.equal(options.timeout, 100); assert.equal(options.killSignal, 'SIGKILL'); assert.equal(options.maxBuffer, 65536);
      assert.equal(options.env.VIRUSTOTAL_API_KEY, undefined); assert.equal(options.env.DATABASE_URL, undefined);
      callback(null, '', '');
    });
    assert.equal(result.exitCode, 0);
  });
  for (const [error, expected] of [[{ code: 'ENOENT' }, 'UNAVAILABLE'], [{ killed: true, signal: 'SIGKILL' }, 'TIMEOUT'], [{ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', killed: true }, 'ERROR']]) {
    await t.test(expected, async () => assert.deepEqual(await runScanner(executable, [], { directory, timeoutMs: 1 }, (_exe, _args, _o, callback) => callback(error, 'SECRET', 'PRIVATE_PATH')), { status: expected }));
  }
  for (const exe of [null, 'relative.exe', path.join(directory, 'wrapper.cmd')]) assert.equal((await runScanner(exe, [], { directory, timeoutMs: 1 }, () => assert.fail())).status, 'UNAVAILABLE');
});
test('ClamAV and YARA status normalization never returns raw output or matching content', () => {
  const filename = path.join(os.tmpdir(), 'generated.upload');
  assert.deepEqual(normalizeClamav({ status: 'COMPLETED', exitCode: 0, stdout: '', stderr: '' }, filename), clean);
  const detected = normalizeClamav({ status: 'COMPLETED', exitCode: 1, stdout: `${filename}: Synthetic.Detection FOUND\n`, stderr: '' }, filename);
  assert.deepEqual(detected.detections, ['Synthetic.Detection']); assert.equal(detected.status, 'DETECTED');
  assert.equal(normalizeClamav({ status: 'COMPLETED', exitCode: 1, stdout: `${filename}: Heuristics.Limits.Exceeded.MaxFileSize FOUND\n`, stderr: '' }, filename).status, 'ERROR');
  assert.equal(normalizeClamav({ status: 'COMPLETED', exitCode: 2, stdout: 'PRIVATE_PATH', stderr: 'SECRET' }, filename).status, 'ERROR');
  for (const status of ['UNAVAILABLE', 'TIMEOUT']) assert.equal(normalizeClamav({ status }, filename).status, status);
  assert.deepEqual(normalizeYara({ status: 'COMPLETED', exitCode: 0, stdout: '', stderr: '' }, filename), noMatch);
  const yara = normalizeYara({ status: 'COMPLETED', exitCode: 0, stdout: `EWAGuard_Harmless_Demo ${filename}\n`, stderr: '' }, filename);
  assert.equal(yara.status, 'MATCH'); assert.equal(yara.matches[0].strength, 'DEMO');
  for (const [run, expected] of [[{ status: 'UNAVAILABLE' }, 'UNAVAILABLE'], [{ status: 'TIMEOUT' }, 'TIMEOUT'],
    [{ status: 'COMPLETED', exitCode: 1, stdout: '', stderr: 'syntax error PRIVATE_RULE_PATH' }, 'ERROR'],
    [{ status: 'COMPLETED', exitCode: 0, stdout: `untrusted contents ${filename}`, stderr: '' }, 'ERROR']]) assert.equal(normalizeYara(run, filename).status, expected);
  assert.doesNotMatch(JSON.stringify({ detected, yara }), /generated.upload|PRIVATE_PATH|SECRET/);
});
test('process deadline and output limit terminate harmless child processes', async () => {
  const options = { directory: os.tmpdir(), timeoutMs: 40 };
  assert.equal((await runScanner(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], options)).status, 'TIMEOUT');
  assert.equal((await runScanner(process.execPath, ['-e', "process.stdout.write('x'.repeat(100000))"], { ...options, timeoutMs: 2000 })).status, 'ERROR');
});
test('scanner concurrency permits one process and one waiter, and releases after failure', async () => {
  let release; const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const local = createFileScanners({ clamavPath: '/trusted/clamav' }, async () => { calls++; await gate; return { status: 'ERROR' }; });
  const file = { filename: path.join(os.tmpdir(), 'fixture.upload'), directory: os.tmpdir() };
  const first = local.clamav(file); const second = local.clamav(file);
  assert.equal((await local.clamav(file)).reason, 'BUSY'); assert.equal(calls, 1);
  release(); await Promise.all([first, second]); assert.equal(calls, 2);
  assert.equal((await local.clamav(file)).status, 'ERROR'); assert.equal(calls, 3);
});
test('scanner args use only generated paths, curated rules, and resource limits', async () => {
  const file = { filename: path.join(os.tmpdir(), 'uuid.upload'), directory: os.tmpdir() }; const calls = [];
  const local = createFileScanners({ clamavPath: '/trusted/clamav', yaraPath: '/trusted/yara', yaraRulesPath: DEFAULT_YARA_RULES }, async (exe, args, options) => {
    calls.push({ exe, args, options }); return { status: 'COMPLETED', exitCode: 0, stdout: '', stderr: '' };
  });
  assert.equal((await local.clamav(file)).status, 'CLEAN'); assert.equal((await local.yara(file)).status, 'NO_MATCH');
  assert.ok(calls[0].args.includes('--alert-exceeds-max=yes')); assert.ok(calls[0].args.includes('--max-scansize=50M'));
  assert.ok(!calls[1].args.some((arg) => ['-s', '--print-strings', '-m', '--print-meta'].includes(arg)));
  assert.equal(calls[1].args.at(-1), file.filename);
});

test('file hash provider uses existing bounded GET adapter only', async (t) => {
  const hash = 'a'.repeat(64); const calls = [];
  const p = createThreatIntelligence({ apiKey: 'KEY_SECRET', fetchImpl: async (url, options) => {
    calls.push({ url, options }); return Response.json({ data: { attributes: { last_analysis_stats: { malicious: 5, suspicious: 1, harmless: 50, undetected: 2 }, names: ['PRIVATE_NAME'], raw: 'RAW_SECRET' } } });
  } });
  const result = await p.lookupFileHash(hash);
  assert.equal(result.scope, 'FILE_HASH'); assert.equal(result.maliciousCount, 5);
  assert.equal(calls[0].url, `https://www.virustotal.com/api/v3/files/${hash}`); assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.body, undefined);
  assert.doesNotMatch(JSON.stringify(result), /KEY_SECRET|PRIVATE_NAME|RAW_SECRET/);
  await assert.rejects(p.lookupFileHash('../invalid')); assert.equal(calls.length, 1);
  for (const [status, expected] of [[404, 'NO_REPORT'], [429, 'RATE_LIMITED'], [503, 'UNAVAILABLE']]) await t.test(String(status), async () => {
    const client = createThreatIntelligence({ apiKey: 'KEY_SECRET', fetchImpl: async () => new Response('', { status }) });
    assert.equal((await client.lookupFileHash(hash)).status, expected);
  });
});
test('classification boundaries and persistence projection', async (t) => {
  assert.equal(classifyFile([], clean, noMatch, { status: 'UNAVAILABLE' }), 'NO_STRONG_INDICATORS');
  assert.equal(classifyFile([], clean, noMatch, { status: 'AVAILABLE', maliciousCount: 1, suspiciousCount: 0 }), 'NO_STRONG_INDICATORS');
  assert.equal(classifyFile([{ id: 'TYPE_MISMATCH' }], clean, noMatch, {}), 'SUSPICIOUS');
  assert.equal(classifyFile([], { status: 'DETECTED' }, noMatch, {}), 'HIGHLY_SUSPICIOUS');
  assert.equal(classifyFile([], clean, { matches: [{ strength: 'STRONG' }] }, {}), 'HIGHLY_SUSPICIOUS');
  assert.equal(classifyFile([], clean, noMatch, { status: 'AVAILABLE', maliciousCount: 5 }), 'HIGHLY_SUSPICIOUS');
  const root = await temporary(t); const tempStore = createFileTempStore(root);
  const analyzer = createFileAnalyzer({ scanners, tempStore }); let row;
  const result = await submitFileAnalysis({ fileAnalysis: { create: async ({ data }) => { row = data; return { id: 'id', createdAt: new Date() }; } } },
    { userId: 'employee', acknowledgementId: 'ack', upload: upload(benignText(), 'SECRET_NAME.txt') }, analyzer);
  assert.equal(row.userId, 'employee'); assert.equal(row.acknowledgementId, 'ack'); assert.equal(row.storageKey, undefined);
  assert.equal(row.clamavStatus, 'NO_KNOWN_DETECTION'); assert.equal(row.evidence.threatIntelligence.status, 'NOT_CONFIGURED');
  assert.doesNotMatch(JSON.stringify(result), /SECRET_NAME|Harmless synthetic|stdout|stderr/); assert.deepEqual(await fs.readdir(root), []);
  const failing = createFileAnalyzer({ tempStore, scanners: { clamav: async () => { throw new Error('scanner failed'); } } });
  await assert.rejects(failing(upload()), /scanner failed/); assert.deepEqual(await fs.readdir(root), []);
});
