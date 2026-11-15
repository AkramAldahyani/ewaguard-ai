import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { evaluateRisk } from '../src/risk/risk-engine.js';
import { RISK_POLICY as P, RISK_ENGINE_VERSION, riskLevelForScore } from '../src/risk/risk-policy.js';
import { REASON_CODES } from '../src/risk/reason-codes.js';
import { riskColumns, riskSnapshot } from '../src/risk/risk-persistence.js';
import { analyzeEmail } from '../src/analyzers/email/email-analyzer.js';

const evaluatedAt = '2026-10-08T12:00:00.000Z';
const ids = (...values) => values.map((id) => ({ id }));
const vt = (maliciousCount = 0, changes = {}) => ({
  provider: 'VIRUSTOTAL',
  status: 'AVAILABLE',
  maliciousCount,
  suspiciousCount: 0,
  harmlessCount: 0,
  undetectedCount: 60 - maliciousCount,
  lastAnalysisDate: evaluatedAt,
  ...changes,
});
const email = (...values) => ({
  indicators: ids(...values),
  authentication: Object.fromEntries(
    ['spf', 'dkim', 'dmarc'].map((method) => [
      method,
      { status: 'HEADER_CLAIM', claimedResults: ['PASS'], verified: false },
    ]),
  ),
  urls: [],
  attachments: [],
});
const url = (values = [], provider = vt()) => ({
  localIndicators: ids(...values),
  dnsEvidence: { status: 'RESOLVED' },
  tlsEvidence: { status: 'AVAILABLE', expired: false, notYetValid: false, hostnameMatch: true, chainAuthorized: true },
  threatIntelligence: [provider],
});
const file = (changes = {}) => ({
  indicators: [],
  clamav: { status: 'CLEAN' },
  yara: { status: 'NO_MATCH', matches: [] },
  threatIntelligence: vt(),
  ...changes,
});
const risk = (analyzerType, evidence) => evaluateRisk({ analyzerType, evidence, evaluatedAt });
const has = (result, code) => result.reasons.some((reason) => reason.code === code);

test('email matrix: benign, urgency, requests and independent phishing categories', async () => {
  const benign = await analyzeEmail({
    inputType: 'PASTED',
    body: 'The meeting agenda is ready. Thank you.',
    headers: 'From: colleague@example.invalid',
  });
  assert.equal(risk('EMAIL', benign).riskLevel, 'LOW');
  assert.equal(risk('EMAIL', email('URGENCY')).riskLevel, 'LOW');
  const credential = risk('EMAIL', email('CREDENTIAL_REQUEST'));
  assert.equal(credential.riskLevel, 'MEDIUM');
  assert.ok(has(credential, 'EMAIL_CREDENTIAL_REQUEST'));
  const combined = risk('EMAIL', email('CREDENTIAL_REQUEST', 'REPLY_DOMAIN_MISMATCH'));
  assert.equal(combined.riskLevel, 'HIGH');
  assert.ok(combined.score > credential.score);
  assert.equal(
    risk('EMAIL', email('CREDENTIAL_REQUEST', 'AUTHENTICATION_CONCERN', 'ATTACHMENT_EXECUTABLE')).riskLevel,
    'HIGH',
  );
  assert.equal(risk('EMAIL', email('MFA_REQUEST')).riskLevel, 'MEDIUM');
  const unavailable = email();
  delete unavailable.authentication;
  assert.equal(risk('EMAIL', unavailable).confidence, 'LIMITED_CONFIDENCE');
  assert.equal(risk('EMAIL', email()).confidence, 'MODERATE_CONFIDENCE');
  assert.ok(has(risk('EMAIL', unavailable), 'EMAIL_AUTH_UNAVAILABLE'));
});

test('email: forged header claims and repeated heuristics cannot produce CRITICAL', () => {
  const all = email(...Object.keys(P.email));
  assert.equal(risk('EMAIL', all).riskLevel, 'HIGH');
  assert.equal(risk('EMAIL', email('URGENCY', 'URGENCY', 'URGENCY')).score, risk('EMAIL', email('URGENCY')).score);
  assert.equal(risk('EMAIL', email('REPLY_ADDRESS_MISMATCH', 'REPLY_DOMAIN_MISMATCH')).score, 18);
  const conflicting = email();
  conflicting.authentication.spf = { status: 'CONFLICTING_CLAIMS', claimedResults: ['PASS', 'FAIL'] };
  assert.ok(has(risk('EMAIL', conflicting), 'CONFLICTING_SECURITY_EVIDENCE'));
  const attachment = email();
  attachment.attachments.push({ scanStatus: 'NOT_SCANNED' });
  assert.equal(risk('EMAIL', attachment).confidence, 'LIMITED_CONFIDENCE');
});

test('URL matrix: structural heuristics, reputation, critical corroboration and TLS', () => {
  assert.equal(risk('URL', url()).riskLevel, 'LOW');
  assert.equal(risk('URL', url(['HTTP'])).riskLevel, 'LOW');
  assert.equal(risk('URL', url(['IDN', 'ACCOUNT_PATH'])).riskLevel, 'MEDIUM');
  const reputation = risk('URL', url([], vt(15)));
  assert.equal(reputation.riskLevel, 'HIGH');
  const combined = risk('URL', url(['IDN', 'ACCOUNT_PATH', 'BRAND_PATTERN'], vt(15)));
  assert.equal(combined.riskLevel, 'CRITICAL');
  const noTls = url([], vt(15));
  noTls.tlsEvidence = { status: 'UNAVAILABLE' };
  assert.equal(risk('URL', noTls).score, reputation.score);
  assert.equal(has(risk('URL', noTls), 'PROVIDER_UNAVAILABLE'), false);
  assert.ok(risk('URL', noTls).evidenceCoverage.unavailableSources.includes('TLS'));
  assert.equal(risk('URL', url([], { status: 'UNAVAILABLE' })).confidence, 'LIMITED_CONFIDENCE');
  assert.ok(has(risk('URL', url([], { status: 'NO_REPORT' })), 'INSUFFICIENT_EVIDENCE'));
  assert.ok(has(risk('URL', url([], { status: 'UNAVAILABLE' })), 'PROVIDER_UNAVAILABLE'));
  assert.equal(risk('URL', url(['HTTP', 'UNUSUAL_PORT'], vt(15))).riskLevel, 'HIGH');
  assert.notEqual(risk('URL', url(Object.keys(P.url))).riskLevel, 'CRITICAL');
});

test('VirusTotal uses counts and ratio; overlapping URL/domain reports do not add', () => {
  assert.equal(risk('URL', url([], vt(1))).riskLevel, 'LOW');
  assert.equal(risk('URL', url([], vt(2))).riskLevel, 'MEDIUM');
  assert.equal(risk('URL', url([], vt(5, { undetectedCount: 95 }))).riskLevel, 'MEDIUM');
  assert.equal(risk('URL', url([], vt(5, { undetectedCount: 45 }))).riskLevel, 'HIGH');
  assert.equal(risk('URL', url([], vt(0, { suspiciousCount: 50 }))).riskLevel, 'LOW');
  const duplicate = url([], vt(15, { scope: 'URL' }));
  duplicate.threatIntelligence.push(vt(15, { scope: 'DOMAIN' }));
  assert.equal(risk('URL', duplicate).score, 60);
  duplicate.threatIntelligence[1] = vt(0, { scope: 'DOMAIN' });
  const result = risk('URL', duplicate);
  assert.equal(result.score, 60);
  assert.ok(result.evidenceCoverage.conflicting);
  const empty = risk('URL', url([], vt(0, { undetectedCount: 0 })));
  assert.equal(empty.confidence, 'LIMITED_CONFIDENCE');
});

test('freshness: stale, absent and future dates limit confidence and critical eligibility, not erase detections', () => {
  for (const lastAnalysisDate of ['2020-01-01T00:00:00Z', null, '2030-01-01T00:00:00Z']) {
    const result = risk('URL', url(['IDN', 'ACCOUNT_PATH'], vt(15, { lastAnalysisDate })));
    assert.equal(result.riskLevel, 'HIGH');
    assert.notEqual(result.confidence, 'HIGH_CONFIDENCE');
  }
  const exact = new Date(Date.parse(evaluatedAt) - P.reputation.staleDays * 86400_000).toISOString();
  assert.equal(risk('URL', url(['IDN', 'ACCOUNT_PATH'], vt(15, { lastAnalysisDate: exact }))).riskLevel, 'CRITICAL');
  assert.equal(evaluateRisk({ analyzerType: 'URL', evidence: url([], vt(15)) }).riskLevel, 'HIGH');
});

test('file matrix: scanner strength, consensus, coverage and contradictions', () => {
  const limited = risk('FILE', file({ yara: { status: 'UNAVAILABLE' }, threatIntelligence: { status: 'NO_REPORT' } }));
  assert.equal(limited.riskLevel, 'LOW');
  assert.equal(limited.confidence, 'MODERATE_CONFIDENCE');
  assert.ok(has(limited, 'INSUFFICIENT_EVIDENCE'));
  const warning = { status: 'MATCH', matches: [{ strength: 'WARNING' }] };
  const strong = { status: 'MATCH', matches: [{ strength: 'STRONG' }] };
  assert.equal(risk('FILE', file({ yara: warning })).riskLevel, 'MEDIUM');
  assert.equal(risk('FILE', file({ yara: strong })).riskLevel, 'HIGH');
  assert.equal(risk('FILE', file({ clamav: { status: 'DETECTED' } })).riskLevel, 'HIGH');
  assert.equal(risk('FILE', file({ threatIntelligence: vt(15) })).riskLevel, 'HIGH');
  const critical = risk('FILE', file({ clamav: { status: 'DETECTED' }, yara: strong, threatIntelligence: vt(15) }));
  assert.equal(critical.riskLevel, 'CRITICAL');
  assert.equal(critical.confidence, 'HIGH_CONFIDENCE');
  assert.equal(critical.score, 100);
  const unavailable = risk(
    'FILE',
    file({
      clamav: { status: 'UNAVAILABLE' },
      yara: { status: 'UNAVAILABLE' },
      threatIntelligence: { status: 'NO_REPORT' },
    }),
  );
  assert.equal(unavailable.confidence, 'LIMITED_CONFIDENCE');
  assert.ok(has(unavailable, 'INSUFFICIENT_EVIDENCE'));
  const conflict = risk('FILE', file({ threatIntelligence: vt(15) }));
  assert.ok(conflict.evidenceCoverage.conflicting);
  assert.ok(has(conflict, 'CONFLICTING_SECURITY_EVIDENCE'));
  assert.equal(conflict.score, 60);
  assert.notEqual(conflict.confidence, 'HIGH_CONFIDENCE');
});

test('file: demo rules, duplicate scanner IDs, mismatches and limited archive coverage', () => {
  assert.equal(risk('FILE', file({ yara: { status: 'MATCH', matches: [{ strength: 'DEMO' }] } })).score, 0);
  const detection = file({
    clamav: { status: 'DETECTED' },
    indicators: ids('AV_DETECTION', 'YARA_MATCH', 'HASH_REPUTATION'),
  });
  assert.equal(risk('FILE', detection).score, 60);
  assert.equal(risk('FILE', file({ indicators: ids('TYPE_MISMATCH', 'ACTIVE_CONTENT') })).riskLevel, 'MEDIUM');
  assert.equal(
    risk('FILE', file({ indicators: ids('TYPE_MISMATCH', 'ACTIVE_CONTENT'), clamav: { status: 'DETECTED' } }))
      .riskLevel,
    'CRITICAL',
  );
  const partial = risk(
    'FILE',
    file({ indicators: ids('ENCRYPTED_ARCHIVE'), clamav: { status: 'CLEAN', coverageLimited: true } }),
  );
  assert.ok(has(partial, 'COVERAGE_LIMITED'));
  assert.notEqual(partial.confidence, 'HIGH_CONFIDENCE');
});

test('all exact risk thresholds and invalid score inputs', () => {
  for (const [score, level] of [
    [0, 'LOW'],
    [24, 'LOW'],
    [25, 'MEDIUM'],
    [49, 'MEDIUM'],
    [50, 'HIGH'],
    [74, 'HIGH'],
    [75, 'CRITICAL'],
    [100, 'CRITICAL'],
  ])
    assert.equal(riskLevelForScore(score), level);
  for (const value of [-1, 101, NaN, Infinity, undefined, '50', 24.5])
    assert.throws(() => riskLevelForScore(value), TypeError);
});

test('general invariants, stable reason codes, recommendation policy, no mutation and order independence', () => {
  for (const [type, evidence] of [
    ['EMAIL', email(...Object.keys(P.email))],
    ['URL', url(Object.keys(P.url), vt(30))],
    ['FILE', file()],
    ['EMAIL', {}],
    ['URL', {}],
    ['FILE', {}],
  ]) {
    const before = structuredClone(evidence);
    const result = risk(type, evidence);
    assert.deepEqual(result, risk(type, evidence));
    assert.deepEqual(evidence, before);
    assert.ok(Number.isInteger(result.score) && result.score >= 0 && result.score <= 100);
    assert.equal(result.riskLevel, riskLevelForScore(result.score));
    assert.equal(result.version, RISK_ENGINE_VERSION);
    assert.equal(result.evaluatedAt, evaluatedAt);
    assert.deepEqual(result.recommendedActions, P.recommendations[result.riskLevel]);
    assert.equal(new Set(result.reasons.map((r) => r.code)).size, result.reasons.length);
    for (const r of result.reasons) {
      assert.equal(r.description, REASON_CODES[r.code]);
      assert.equal(typeof r.description, 'string');
      assert.ok(r.contribution >= 0);
    }
    if (!Object.keys(evidence).length) {
      assert.equal(result.confidence, 'LIMITED_CONFIDENCE');
      assert.ok(has(result, 'INSUFFICIENT_EVIDENCE'));
    }
  }
  const a = email('MFA_REQUEST', 'CREDENTIAL_REQUEST', 'URGENCY', 'AUTHENTICATION_CONCERN');
  assert.deepEqual(risk('EMAIL', a), risk('EMAIL', { ...a, indicators: [...a.indicators].reverse() }));
  const original = risk('FILE', file());
  original.recommendedActions.push('mutated');
  assert.ok(!risk('FILE', file()).recommendedActions.includes('mutated'));
});

test('malformed consumed evidence rejected safely; extra client risk fields ignored', () => {
  for (const args of [
    undefined,
    {},
    { analyzerType: 'FAKE', evidence: {} },
    { analyzerType: 'URL', evidence: [] },
    { analyzerType: 'FILE', evidence: { indicators: 'text' } },
    { analyzerType: 'URL', evidence: url([], vt(NaN)) },
    { analyzerType: 'URL', evidence: url([], vt(-1)) },
    { analyzerType: 'URL', evidence: url([], vt(1, { harmlessCount: '30' })) },
    { analyzerType: 'URL', evidence: url([], vt(1, { lastAnalysisDate: 'invalid' })) },
    { analyzerType: 'URL', evidence: { ...url(), tlsEvidence: { status: 'AVAILABLE', expired: 'false' } } },
    { analyzerType: 'FILE', evidence: file({ yara: { status: 'MATCH', matches: [{ strength: 'arbitrary' }] } }) },
    { analyzerType: 'FILE', evidence: file({ yara: { status: 'MATCH', matches: [] } }) },
    { analyzerType: 'EMAIL', evidence: { indicators: [null] } },
    { analyzerType: 'EMAIL', evidence: { indicators: ids(...Array(129).fill('URGENCY')) } },
    { analyzerType: 'FILE', evidence: file({ clamav: { status: 'SAFE' } }) },
    { analyzerType: 'FILE', evidence: file(), evaluatedAt: 'invalid' },
  ])
    assert.throws(() => evaluateRisk(args), { name: 'TypeError' });
  const original = url([], vt(15));
  assert.deepEqual(
    risk('URL', original),
    risk('URL', {
      ...original,
      score: 0,
      riskLevel: 'LOW',
      confidence: 'HIGH_CONFIDENCE',
      risk: { score: 0 },
      provisionalClassification: 'NO_STRONG_INDICATORS',
    }),
  );
  assert.deepEqual(risk('URL', original), risk('URL', { ...original, provisionalClassification: 'HIGHLY_SUSPICIOUS' }));
  assert.ok(has(risk('URL', { ...url(), localIndicators: ids('UNKNOWN_RULE') }), 'COVERAGE_LIMITED'));
});

test('audit-compatible minimized persistence and fixed explanation privacy', () => {
  const result = risk(
    'FILE',
    file({
      clamav: { status: 'DETECTED', detections: ['SECRET_SIGNATURE'] },
      yara: { status: 'MATCH', matches: [{ strength: 'WARNING', name: 'SECRET_RULE', description: 'SECRET_PAYLOAD' }] },
    }),
  );
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  assert.deepEqual(riskColumns(result), {
    riskScore: result.score,
    severity: result.riskLevel,
    riskRuleVersion: RISK_ENGINE_VERSION,
  });
  assert.deepEqual(
    riskSnapshot(result).reasonCodes,
    result.reasons.map((r) => r.code),
  );
});

test('risk modules have only local pure imports: no network, AI, secrets, process, files or database access', async () => {
  const root = new URL('../src/risk/', import.meta.url);
  for (const name of await readdir(root)) {
    const source = await readFile(new URL(name, root), 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.match(match[1], /^\.\/[^/]+\.js$/);
    assert.doesNotMatch(
      source,
      /\b(?:fetch|require|import\s*\(|process\.|execFile|readFile|OpenAI|Prisma|Date\.now)\b/,
    );
  }
});

test('confirmed credential exposure raises a stored email/URL risk to CRITICAL deterministically', async () => {
  const { escalateConfirmedRisk } = await import('../src/risk/risk-engine.js');
  const confirmed = { corporateCredentialsSubmittedToPhishingSite: true };
  const stored = (score, changes = {}) => ({
    analyzerType: 'EMAIL',
    score,
    riskLevel: Number.isInteger(score) && score >= 0 && score <= 100 ? riskLevelForScore(score) : 'LOW',
    version: '1.1',
    confidence: 'LIMITED_CONFIDENCE',
    reasonCodes: ['INSUFFICIENT_EVIDENCE'],
    ...changes,
  });
  for (const score of [0, 24, 25, 49, 50, 74]) {
    const result = escalateConfirmedRisk(stored(score), confirmed);
    assert.equal(result.score, P.thresholds.CRITICAL);
    assert.equal(result.riskLevel, 'CRITICAL');
    assert.deepEqual(result.reasonCodes, ['CONFIRMED_CREDENTIAL_SUBMISSION', 'INSUFFICIENT_EVIDENCE']);
  }
  assert.equal(escalateConfirmedRisk(stored(92), confirmed).score, 92, 'never lowers a higher score');
  assert.equal(escalateConfirmedRisk(stored(30, { analyzerType: 'URL' }), confirmed).analyzerType, 'URL');
  const twice = escalateConfirmedRisk(escalateConfirmedRisk(stored(10), confirmed), confirmed);
  assert.deepEqual(twice, escalateConfirmedRisk(stored(10), confirmed), 'idempotent');
  for (const context of [
    undefined,
    {},
    { corporateCredentialsSubmittedToPhishingSite: false },
    { corporateCredentialsSubmittedToPhishingSite: 'true' },
    { corporateCredentialsSubmittedToPhishingSite: true, severity: 'CRITICAL' },
    [true],
  ]) {
    assert.throws(() => escalateConfirmedRisk(stored(30), context), TypeError);
  }
  for (const bad of [
    stored(30, { analyzerType: 'FILE' }),
    stored(30, { riskLevel: 'HIGH' }),
    stored(101),
    stored(-1),
    stored(3.5),
    stored(30, { reasonCodes: ['MADE_UP_CODE'] }),
    stored(30, { reasonCodes: 'x' }),
    null,
  ]) {
    assert.throws(() => escalateConfirmedRisk(bad, confirmed), TypeError);
  }
});
