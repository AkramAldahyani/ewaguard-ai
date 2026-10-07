import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { normalizeUrl, isPublicAddress } from '../src/analyzers/url/url-normalization.js';
import { localUrlIndicators, classifyUrl } from '../src/analyzers/url/url-local.js';
import { resolvePublicTarget, inspectTls, certificateEvidence } from '../src/analyzers/url/url-network.js';
import { createUrlAnalyzer } from '../src/analyzers/url/url-analyzer.js';
import { createThreatIntelligence } from '../src/services/threat-intelligence.js';

const ids = (url) => localUrlIndicators(normalizeUrl(url)).map((item) => item.id);
const publicTarget = async () => ({ addresses: ['93.184.215.14'], evidence: { status: 'RESOLVED', resolvedIpCount: 1, publicAddressesOnly: true } });
const payload = (malicious = 0) => ({ data: { attributes: { last_analysis_stats: { malicious, suspicious: 0, harmless: 70, undetected: 2 }, reputation: 5, last_analysis_date: 1700000000, rawSecret: 'DO_NOT_EXPOSE' } } });

test('URL normalization and deterministic heuristics', async (t) => {
  await t.test('normal HTTPS, whitespace, canonical domain, default port', () => {
    const value = normalizeUrl('  HTTPS://EXAMPLE.COM:443/  ');
    assert.equal(value.url.href, 'https://example.com/');
    assert.equal(value.normalized.hostname, 'example.com');
    assert.deepEqual(ids(value.url.href), []);
  });
  for (const [url, id] of [
    ['http://example.com', 'HTTP'], ['https://8.8.8.8/', 'IP_HOST'], ['https://xn--pple-43d.com/', 'IDN'],
    ['https://a.b.c.d.e.example.com/', 'MANY_SUBDOMAINS'], ['https://example.com/login/verify', 'ACCOUNT_PATH'],
    ['https://example.com/?access_token=SECRET', 'SENSITIVE_QUERY'], ['https://example.com/' + 'a'.repeat(1900), 'LONG_URL'],
    ['https://bit.ly/', 'SHORTENER'], ['https://secure-paypal.other.com:8443/login', 'BRAND_PATTERN'],
    ['https://example.com/%25aa', 'ENCODING'], ['https://example.com/?' + Array.from({ length: 13 }, (_, i) => `q=${i}`).join('&'), 'MANY_PARAMETERS'],
  ]) await t.test(id, () => assert.ok(ids(url).includes(id)));
  await t.test('mixed script detection is conservative', () => assert.ok(ids('https://xn--pple-43d.com/').includes('MIXED_SCRIPT')));
  await t.test('an ASCII TLD does not make a Greek-only label mixed-script', () => assert.equal(normalizeUrl('https://παράδειγμα.com').normalized.mixedScript, false));
  await t.test('invalid UTF-8 percent bytes do not crash local checks', () => assert.doesNotThrow(() => ids('https://example.com/%ff')));
  await t.test('all values, path segments, fragment and unknown names omitted', () => {
    const n = normalizeUrl('https://example.com/PATH_SECRET?token=VALUE_SECRET&NAME_SECRET=OTHER_SECRET#FRAGMENT_SECRET').normalized;
    assert.doesNotMatch(JSON.stringify(n), /PATH_SECRET|VALUE_SECRET|NAME_SECRET|OTHER_SECRET|FRAGMENT_SECRET/);
    assert.deepEqual(n.queryParameterNames, ['token']);
    assert.equal(n.queryCount, 2);
  });
});

for (const input of ['', ' ', null, 7, 'example.com', 'https:/example.com', 'https:////example.com', 'https://example.com\\foo',
  'https://exam\nple.com', 'https://example.com/%zz', 'https://%65xample.com', 'https://user:password@example.com',
  'https://@example.com', 'https://example.com:65536', 'https://example..com', 'https://' + 'a'.repeat(64) + '.com',
  'https://example.com/' + 'a'.repeat(4096), 'ftp://example.com', 'javascript:alert(1)', 'file:///etc/passwd',
  'data:text/plain,test', 'chrome://settings', 'blob:https://example.com/test', 'mailto:test@example.com',
]) test(`reject malformed input ${String(input).slice(0, 65)}`, () => assert.throws(() => normalizeUrl(input), { code: 'INVALID_URL' }));

for (const host of ['localhost', 'localhost.', 'a.localhost', 'printer', 'app.local', 'test.internal', 'dev.lan', 'app.home',
  '127.0.0.1', '127.1', '2130706433', '0x7f000001', '0177.0.0.1', '0.0.0.0', '10.0.0.1', '172.16.0.1', '172.31.255.255',
  '192.168.1.1', '169.254.169.254', '100.64.0.1', '224.0.0.1', '240.0.0.1', '192.0.0.9', '192.0.2.1', '198.18.0.1',
  '[::1]', '[::]', '[fc00::1]', '[fe80::1]', '[ff02::1]', '[::ffff:127.0.0.1]', '[2001:db8::1]', '[2002:7f00:1::1]', '[64:ff9b::a00:1]',
]) test(`block nonpublic target ${host}`, () => assert.throws(() => normalizeUrl(`https://${host}/`), { code: 'URL_TARGET_BLOCKED' }));

test('public address boundaries', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
});
test('DNS fails closed for any private answer, or incomplete queries', async () => {
  const resolver = (a, aaaa) => ({ resolve4: async () => a, resolve6: async () => aaaa, cancel() {} });
  await assert.rejects(resolvePublicTarget('example.com', resolver(['8.8.8.8', '10.0.0.1'], [])), { code: 'URL_TARGET_BLOCKED' });
  await assert.rejects(resolvePublicTarget('example.com', resolver(['8.8.8.8'], ['::1'])), { code: 'URL_TARGET_BLOCKED' });
  assert.equal((await resolvePublicTarget('example.com', resolver(['8.8.8.8'], []))).evidence.status, 'RESOLVED');
  for (const code of ['ENOTFOUND', 'ETIMEOUT']) {
    const result = await resolvePublicTarget('example.com', { resolve4: async () => { throw { code }; }, resolve6: async () => { throw { code }; }, cancel() {} });
    assert.equal(result.evidence.status, 'UNAVAILABLE'); assert.deepEqual(result.addresses, []);
  }
  const partial = await resolvePublicTarget('example.com', { resolve4: async () => ['8.8.8.8'], resolve6: async () => { throw { code: 'ETIMEOUT' }; }, cancel() {} });
  assert.deepEqual(partial.addresses, []);
});
test('TLS expiry, hostname match, pinned IP, no application writes and port restriction', async () => {
  const cert = { valid_from: 'Jan 1 00:00:00 2020 GMT', valid_to: 'Jan 1 00:00:00 2021 GMT', subjectaltname: 'DNS:example.com' };
  assert.equal(certificateEvidence(cert, 'example.com', false).expired, true);
  assert.equal(certificateEvidence(cert, 'elsewhere.com', false).hostnameMatch, false);
  let options; let destroyed = false;
  const connect = (o) => { options = o; const socket = new EventEmitter(); socket.destroy = () => { destroyed = true; }; socket.getPeerCertificate = () => cert; queueMicrotask(() => socket.emit('secureConnect')); return socket; };
  const n = normalizeUrl('https://example.com').normalized;
  const result = await inspectTls(n, ['8.8.8.8'], connect);
  assert.equal(result.expired, true); assert.equal(options.host, '8.8.8.8'); assert.equal(options.servername, 'example.com'); assert.ok(destroyed);
  assert.equal((await inspectTls({ ...n, port: '8443' }, ['8.8.8.8'], () => assert.fail())).status, 'SKIPPED_PORT');
  await assert.rejects(inspectTls(n, ['127.0.0.1'], () => assert.fail()), { code: 'URL_TARGET_BLOCKED' });
  const failed = await inspectTls(n, ['8.8.8.8'], () => { const socket = new EventEmitter(); socket.destroy = () => {}; queueMicrotask(() => socket.emit('error', new Error('private error'))); return socket; });
  assert.deepEqual(failed, { status: 'UNAVAILABLE' });
});

test('VirusTotal owned evidence, graceful statuses, privacy and quota', async (t) => {
  const key = 'SENTINEL_API_KEY';
  const provider = (fetchImpl, extra = {}) => createThreatIntelligence({ apiKey: key, fetchImpl, ...extra });
  for (const count of [0, 6]) await t.test(`normalized detections ${count}`, async () => {
    let options; let path;
    const p = provider(async (url, o) => { path = url; options = o; return Response.json(payload(count)); });
    const result = await p.lookupUrl('https://example.com/');
    assert.equal(result.maliciousCount, count); assert.equal(result.status, 'AVAILABLE');
    assert.equal(options.headers['x-apikey'], key); assert.equal(options.redirect, 'error'); assert.equal(options.method, 'GET');
    assert.match(path, /^https:\/\/www\.virustotal\.com\/api\/v3\/urls\//);
    assert.doesNotMatch(JSON.stringify(result), /SENTINEL_API_KEY|DO_NOT_EXPOSE|attributes|last_analysis_stats/);
  });
  for (const [status, expected] of [[401, 'UNAUTHORIZED'], [403, 'UNAUTHORIZED'], [404, 'NO_REPORT'], [429, 'RATE_LIMITED'], [500, 'UNAVAILABLE']]) {
    await t.test(`HTTP ${status}`, async () => assert.equal((await provider(async () => new Response('private provider error', { status })).lookupDomain('example.com')).status, expected));
  }
  await t.test('missing key makes no requests', async () => assert.equal((await createThreatIntelligence({ fetchImpl: () => assert.fail() }).lookupUrl('https://example.com/')).status, 'NOT_CONFIGURED'));
  await t.test('timeout and network errors are sanitized', async () => {
    const p = provider((_url, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error(key)))), { timeoutMs: 5 });
    assert.equal((await p.lookupUrl('https://example.com/')).status, 'TIMEOUT');
    assert.equal((await provider(async () => { throw new Error(key); }).lookupUrl('https://example.com/')).status, 'UNAVAILABLE');
  });
  for (const body of [{}, { data: { attributes: { last_analysis_stats: { malicious: -1 } } } }]) await t.test('malformed response', async () => assert.equal((await provider(async () => Response.json(body)).lookupDomain('example.com')).status, 'MALFORMED_RESPONSE'));
  await t.test('oversized provider response bounded', async () => assert.equal((await provider(async () => new Response('x'.repeat(524289))).lookupDomain('example.com')).status, 'MALFORMED_RESPONSE'));
  await t.test('sensitive exact URLs never leave server', async () => {
    const p = provider(() => assert.fail());
    for (const suffix of ['/token', '/?key=secret', '/#secret']) assert.equal((await p.lookupUrl('https://example.com' + suffix)).status, 'SKIPPED_PRIVACY');
    await assert.rejects(p.lookupUrl('http://localhost/'));
  });
  await t.test('cache expires and local quota prevents excess calls', async () => {
    let time = Date.now(); let calls = 0;
    const p = provider(async () => { calls++; return Response.json(payload()); }, { now: () => time });
    await p.lookupDomain('example.com'); assert.equal((await p.lookupDomain('example.com')).cached, true); assert.equal(calls, 1);
    time += 600001; await p.lookupDomain('example.com'); assert.equal(calls, 2);
    for (const host of ['a.com', 'b.com', 'c.com']) await p.lookupDomain(host);
    assert.equal((await p.lookupDomain('d.com')).status, 'RATE_LIMITED'); assert.equal(calls, 5);
  });
  await t.test('429 cooldown prevents domain lookup after URL failure', async () => {
    let calls = 0; const p = provider(async () => { calls++; return new Response('', { status: 429 }); });
    await p.lookupUrl('https://example.com'); await p.lookupDomain('example.com'); assert.equal(calls, 1);
  });
  await t.test('provider concurrency rejects excess work and releases slots', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const p = provider(async () => { await gate; return Response.json(payload()); });
    const first = p.lookupDomain('example.com'); const second = p.lookupDomain('example.org');
    assert.equal((await p.lookupDomain('example.net')).status, 'BUSY');
    release(); await Promise.all([first, second]);
    assert.equal((await p.lookupDomain('example.net')).status, 'AVAILABLE');
  });
});

test('analyzer separates sources, handles DNS/provider failure and avoids final severity', async () => {
  const analyzer = createUrlAnalyzer({ resolveTarget: publicTarget, tlsInspector: async () => ({ status: 'UNAVAILABLE' }) });
  const result = await analyzer('https://example.com/?password=SECRET');
  assert.equal(result.threatIntelligence[1].status, 'NOT_CONFIGURED');
  assert.equal(result.provisionalClassification, 'NO_STRONG_INDICATORS');
  assert.doesNotMatch(JSON.stringify(result), /SECRET|"riskScore"|"severity"/);
  const failedDns = createUrlAnalyzer({ resolveTarget: async () => ({ addresses: [], evidence: { status: 'UNAVAILABLE' } }),
    threatIntelligence: { lookupUrl: () => assert.fail(), lookupDomain: () => assert.fail() } });
  assert.equal((await failedDns('https://example.com')).threatIntelligence[0].status, 'SKIPPED_DNS');
  const blocked = createUrlAnalyzer({ resolveTarget: () => resolvePublicTarget('example.com', { resolve4: async () => ['10.0.0.1'], resolve6: async () => [], cancel() {} }),
    tlsInspector: () => assert.fail(), threatIntelligence: { lookupUrl: () => assert.fail() } });
  await assert.rejects(blocked('https://example.com'), { code: 'URL_TARGET_BLOCKED' });
});
test('classification boundaries: one weak heuristic or one detection never determines maliciousness', () => {
  const weak = [{ id: 'HTTP', weight: 1 }];
  const strong = [{ id: 'A', weight: 2 }, { id: 'B', weight: 2 }, { id: 'C', weight: 2 }];
  const providers = (n) => [{ status: 'AVAILABLE', maliciousCount: n, suspiciousCount: 0 }];
  assert.equal(classifyUrl(weak, {}, []), 'NO_STRONG_INDICATORS');
  assert.equal(classifyUrl([], {}, providers(1)), 'NO_STRONG_INDICATORS');
  assert.equal(classifyUrl([], {}, providers(10)), 'SUSPICIOUS');
  assert.equal(classifyUrl(strong, {}, []), 'SUSPICIOUS');
  assert.equal(classifyUrl(strong, {}, providers(3)), 'HIGHLY_SUSPICIOUS');
  assert.equal(classifyUrl(weak, {}, [...providers(2), ...providers(2)]), 'NO_STRONG_INDICATORS');
});
