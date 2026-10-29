import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeFileHash, normalizeSha256 } from '../src/analyzers/file/hash-analysis.js';
import { createThreatIntelligence } from '../src/services/threat-intelligence.js';

const hash = 'a'.repeat(64);
const report = (changes = {}) => ({ provider: 'VIRUSTOTAL', scope: 'FILE_HASH', status: 'AVAILABLE',
  maliciousCount: 0, suspiciousCount: 0, harmlessCount: 10, undetectedCount: 50,
  lastAnalysisDate: new Date().toISOString(), ...changes });
test('SHA-256 validation accepts uppercase and trims whitespace; rejects other input', () => {
  assert.equal(normalizeSha256(` ${hash.toUpperCase()}\n`), hash);
  for (const input of [null, 42, {}, '', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), `https://example.com/${hash}`, `${hash.slice(0, 32)} ${hash.slice(32)}`]) {
    assert.equal(normalizeSha256(input), null);
  }
});
test('hash lookup uses reputation evidence and central risk without fabricating file scans', async () => {
  let seen;
  const result = await analyzeFileHash(hash, { lookupFileHash: async (value) => { seen = value; return report({ maliciousCount: 15 }); } });
  assert.equal(seen, hash);
  assert.equal(result.finding, 'DETECTIONS_REPORTED');
  assert.equal(result.risk.riskLevel, 'HIGH');
  assert.equal(result.localScans, 'NOT_SCANNED');
  assert.equal(result.file, undefined);
  assert.ok(result.risk.evidenceCoverage.unavailableSources.includes('CLAMAV'));
  assert.ok(result.risk.evidenceCoverage.unavailableSources.includes('YARA'));
});
test('no detections, suspicious votes, absent reports and provider failures stay distinct', async () => {
  const check = (value) => analyzeFileHash(hash, { lookupFileHash: async () => value });
  assert.equal((await check(report())).finding, 'NO_KNOWN_DETECTION');
  assert.equal((await check(report({ suspiciousCount: 1 }))).finding, 'DETECTIONS_REPORTED');
  assert.equal((await check(report({ harmlessCount: 0, undetectedCount: 0 }))).finding, 'UNKNOWN');
  for (const status of ['NO_REPORT', 'NOT_CONFIGURED', 'RATE_LIMITED', 'UNAVAILABLE', 'UNAUTHORIZED', 'TIMEOUT', 'MALFORMED_RESPONSE']) {
    const result = await check({ provider: 'VIRUSTOTAL', scope: 'FILE_HASH', status });
    assert.equal(result.finding, 'UNKNOWN');
    assert.equal(result.threatIntelligence.status, status);
    assert.equal(result.risk.confidence, 'LIMITED_CONFIDENCE');
  }
});
test('provider receives only a hash in a GET to its fixed host; no upload or redirect', async () => {
  const calls = [];
  const provider = createThreatIntelligence({ apiKey: 'test-only', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(null, { status: 404 });
  } });
  const result = await analyzeFileHash(hash, provider);
  assert.equal(result.finding, 'UNKNOWN');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://www.virustotal.com/api/v3/files/${hash}`);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.redirect, 'error');
});
