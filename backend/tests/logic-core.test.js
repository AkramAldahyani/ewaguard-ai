import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { evaluateRisk, escalateConfirmedRisk } from '../src/risk/risk-engine.js';
import { RISK_POLICY, RISK_ENGINE_VERSION, riskLevelForScore } from '../src/risk/risk-policy.js';
import { REASON_CODES } from '../src/risk/reason-codes.js';
import { escalationDecision, incidentTypeFor, INCIDENT_TYPE_RULES } from '../src/incidents/escalation-policy.js';
import { STATUSES, OPEN_STATUSES, CLOSED_STATUSES, TRANSITIONS } from '../src/incidents/management-policy.js';
import { projectStoredGuidance } from '../src/incidents/incident-detail.js';
import { buildIncidentAssistance } from '../src/assistance/incident-assistance.js';
import { ASSISTANCE_POLICY } from '../src/assistance/assistance-policy.js';
import { analyzeEmail } from '../src/analyzers/email/email-analyzer.js';
import { EMAIL_LIMITS } from '../src/analyzers/email/email-policy.js';
import { normalizeUrl, isPublicAddress } from '../src/analyzers/url/url-normalization.js';
import { localUrlIndicators } from '../src/analyzers/url/url-local.js';
import { brandInHostname } from '../src/analyzers/domain-indicators.js';
import { analyzeFileHash } from '../src/analyzers/file/hash-analysis.js';
import { projectToolResult } from '../src/ai/tools/tool-results.js';
import { validateGroundedText } from '../src/ai/tool-orchestration.js';
import { containsSecret, containsAnalysisInput } from '../src/ai/chat-policy.js';
import { validateQuizDraft } from '../src/training/course-quiz-service.js';
import { nearestMonthOrder } from '../src/training/monthly-quiz-service.js';
import { securityPeriod } from '../src/analytics/security-analytics.js';
import { createThreatIntelligence } from '../src/services/threat-intelligence.js';

// Cross-module logic checks. Everything here is pure: no database, network, or provider.
const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const rank = (level) => LEVELS.indexOf(level);
const NOW = '2026-11-24T12:00:00.000Z';
const vt = (malicious, suspicious = 0, scope = 'URL', date = NOW) => ({
  provider: 'VIRUSTOTAL',
  scope,
  status: 'AVAILABLE',
  maliciousCount: malicious,
  suspiciousCount: suspicious,
  harmlessCount: 60,
  undetectedCount: 10,
  lastAnalysisDate: date,
});
const emailEvidence = (ids) => ({ analyzer: 'EMAIL', indicators: ids.map((id) => ({ id })) });
const urlEvidence = (ids, reports = []) => ({
  analyzer: 'URL',
  localIndicators: ids.map((id) => ({ id })),
  dnsEvidence: { status: 'RESOLVED' },
  tlsEvidence: {
    status: 'AVAILABLE',
    expired: false,
    notYetValid: false,
    hostnameMatch: true,
    chainAuthorized: true,
  },
  threatIntelligence: reports,
});
const fileEvidence = (ids, extra = {}) => ({
  analyzer: 'FILE',
  indicators: ids.map((id) => ({ id })),
  clamav: { status: 'CLEAN', detections: [] },
  yara: { status: 'NO_MATCH', matches: [] },
  threatIntelligence: vt(0, 0, 'FILE_HASH'),
  ...extra,
});
const evidenceFor = { EMAIL: emailEvidence, URL: urlEvidence, FILE: fileEvidence };
const risk = (analyzerType, evidence, extra = {}) =>
  evaluateRisk({ analyzerType, evidence, evaluatedAt: NOW, ...extra });

test('risk thresholds map every score from 0 to 100 to exactly one level', () => {
  for (let score = 0; score <= 100; score++) {
    const expected = score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';
    assert.equal(riskLevelForScore(score), expected, String(score));
  }
  for (const bad of [-1, 101, 24.5, NaN, '50', null]) assert.throws(() => riskLevelForScore(bad), TypeError);
});

test('every configured indicator scores deterministically, stays in bounds and is explained', () => {
  for (const type of ['EMAIL', 'URL', 'FILE']) {
    const rules = RISK_POLICY[type.toLowerCase()];
    for (const [id, [code]] of Object.entries(rules)) {
      const evidence = evidenceFor[type]([id]);
      const first = risk(type, evidence);
      assert.deepEqual(risk(type, evidence), first, `${type} ${id} is not deterministic`);
      assert.ok(Number.isInteger(first.score) && first.score > 0 && first.score <= 100, `${type} ${id}`);
      assert.equal(first.riskLevel, riskLevelForScore(first.score));
      assert.ok(first.reasons.some((reason) => reason.code === code));
      for (const reason of first.reasons)
        assert.equal(typeof reason.description, 'string', `${reason.code} has no description`);
      assert.notEqual(first.riskLevel, 'CRITICAL', `${type} ${id} alone must never be CRITICAL`);
    }
  }
});

test('adding an indicator never lowers a score, and heuristics alone never reach CRITICAL', () => {
  for (const type of ['EMAIL', 'URL', 'FILE']) {
    const ids = Object.keys(RISK_POLICY[type.toLowerCase()]);
    let previous = 0;
    for (let count = 0; count <= ids.length; count++) {
      const { score, riskLevel } = risk(type, evidenceFor[type](ids.slice(0, count)));
      assert.ok(score >= previous, `${type} fell from ${previous} to ${score} after ${ids[count - 1]}`);
      assert.notEqual(riskLevel, 'CRITICAL', `${type} with ${count} heuristics`);
      previous = score;
    }
  }
});

test('CRITICAL requires two strong sources, corroborated structure, or a confirmed exposure', () => {
  const clam = { clamav: { status: 'DETECTED', detections: ['Synthetic'] } };
  const strongYara = { yara: { status: 'MATCH', matches: [{ name: 'R', strength: 'STRONG', description: 'd' }] } };
  assert.equal(risk('FILE', fileEvidence([], clam)).riskLevel, 'HIGH');
  assert.equal(risk('FILE', fileEvidence([], { ...clam, ...strongYara })).riskLevel, 'CRITICAL');
  assert.equal(risk('URL', urlEvidence([], [vt(15)])).riskLevel, 'HIGH');
  assert.equal(risk('URL', urlEvidence(['IDN', 'ACCOUNT_PATH', 'BRAND_PATTERN'], [vt(15)])).riskLevel, 'CRITICAL');
  // The same detection in a stale report is not a strong source.
  const stale = vt(15, 0, 'URL', '2020-01-01T00:00:00.000Z');
  assert.notEqual(risk('URL', urlEvidence(['IDN', 'ACCOUNT_PATH', 'BRAND_PATTERN'], [stale])).riskLevel, 'CRITICAL');
  const confirmed = risk('EMAIL', emailEvidence([]), {
    confirmedContext: { corporateCredentialsSubmittedToPhishingSite: true },
  });
  assert.equal(confirmed.riskLevel, 'CRITICAL');
  for (const context of [{ other: true }, { corporateCredentialsSubmittedToPhishingSite: 'true' }, [], 'yes', null])
    assert.throws(() => risk('EMAIL', emailEvidence([]), { confirmedContext: context }), TypeError);
});

test('harmless votes and clean scanners never cancel a detection; overlapping reports are not summed', () => {
  const single = risk('URL', urlEvidence([], [vt(6)])).score;
  const overlapping = risk('URL', urlEvidence([], [vt(6), vt(6, 0, 'DOMAIN')])).score;
  assert.equal(overlapping, single);
  const conflict = risk('URL', urlEvidence([], [vt(6), vt(0, 0, 'DOMAIN')]));
  assert.equal(conflict.score, single);
  assert.equal(conflict.evidenceCoverage.conflicting, true);
  assert.notEqual(conflict.confidence, 'HIGH_CONFIDENCE');
});

test('missing scanners lower confidence, never the score, and are never reported as clean', () => {
  const full = risk('FILE', fileEvidence(['DOUBLE_EXTENSION']));
  const missing = risk(
    'FILE',
    fileEvidence(['DOUBLE_EXTENSION'], {
      clamav: { status: 'UNAVAILABLE', detections: [] },
      yara: { status: 'UNAVAILABLE', matches: [] },
      threatIntelligence: { provider: 'VIRUSTOTAL', scope: 'FILE_HASH', status: 'NOT_CONFIGURED' },
    }),
  );
  assert.equal(missing.score, full.score);
  assert.equal(missing.confidence, 'LIMITED_CONFIDENCE');
  for (const source of ['CLAMAV', 'YARA']) {
    assert.ok(missing.evidenceCoverage.unavailableSources.includes(source));
    assert.ok(!missing.evidenceCoverage.availableSources.includes(source));
  }
});

test('malformed evidence fails closed instead of scoring LOW', () => {
  for (const [type, evidence] of [
    ['EMAIL', null],
    ['EMAIL', []],
    ['EMAIL', { analyzer: 'URL' }],
    ['EMAIL', { indicators: 'URGENCY' }],
    ['EMAIL', { indicators: [{ id: 7 }] }],
    ['URL', urlEvidence([], [{ ...vt(1), maliciousCount: -1 }])],
    ['URL', urlEvidence([], [{ ...vt(1), status: 'INVENTED' }])],
    ['FILE', fileEvidence([], { clamav: { status: 'SAFE' } })],
    ['FILE', fileEvidence([], { yara: { status: 'MATCH', matches: [] } })],
    ['SMS', {}],
  ])
    assert.throws(() => risk(type, evidence), TypeError, `${type} ${JSON.stringify(evidence)}`);
});

test('confirmed exposure is monotonic, always CRITICAL, and limited to email and URL', () => {
  const context = { corporateCredentialsSubmittedToPhishingSite: true };
  for (let score = 0; score <= 100; score += 5) {
    const snapshot = {
      analyzerType: 'EMAIL',
      score,
      riskLevel: riskLevelForScore(score),
      version: RISK_ENGINE_VERSION,
      confidence: 'LIMITED_CONFIDENCE',
      reasonCodes: ['EMAIL_URGENCY'],
    };
    const raised = escalateConfirmedRisk(snapshot, context);
    assert.equal(raised.riskLevel, 'CRITICAL');
    assert.ok(raised.score >= score);
    assert.deepEqual(escalateConfirmedRisk(raised, context), raised, 'repeating changes nothing');
    assert.throws(() => escalateConfirmedRisk({ ...snapshot, analyzerType: 'FILE' }, context), TypeError);
    assert.throws(() => escalateConfirmedRisk({ ...snapshot, score: 101 }, context), TypeError);
    for (const forged of [{}, { corporateCredentialsSubmittedToPhishingSite: false }, { ...context, admin: true }])
      assert.throws(() => escalateConfirmedRisk(snapshot, forged), TypeError);
  }
});

test('escalation follows the level and incident categories use only known reason codes', () => {
  for (const level of LEVELS) {
    const decision = escalationDecision({ riskLevel: level, confidence: 'LIMITED_CONFIDENCE' });
    assert.equal(decision.eligible, rank(level) >= rank('HIGH'));
    assert.equal(decision.urgent, level === 'CRITICAL');
    assert.equal(decision.humanReviewRequired, true);
  }
  for (const codes of Object.values(INCIDENT_TYPE_RULES))
    for (const code of codes) assert.ok(Object.hasOwn(REASON_CODES, code), `${code} is not a reason code`);
  assert.equal(incidentTypeFor(['EMAIL_URGENCY']), 'SUSPICIOUS_ACTIVITY');
  assert.equal(incidentTypeFor(['EMAIL_CREDENTIAL_REQUEST']), 'PHISHING');
  assert.equal(incidentTypeFor(['FILE_CLAMAV_DETECTION', 'EMAIL_URGENCY']), 'MALWARE');
  assert.equal(
    incidentTypeFor(['CONFIRMED_CREDENTIAL_SUBMISSION', 'EMAIL_CREDENTIAL_REQUEST']),
    'CREDENTIAL_COMPROMISE',
  );
  for (const value of [undefined, null, 'x', {}]) assert.equal(incidentTypeFor(value), 'SUSPICIOUS_ACTIVITY');
});

test('incident lifecycle is closed over known statuses, reachable and always reopenable', () => {
  assert.deepEqual([...OPEN_STATUSES, ...CLOSED_STATUSES].sort(), [...STATUSES].sort());
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...STATUSES].sort());
  for (const [from, targets] of Object.entries(TRANSITIONS)) {
    assert.ok(targets.length, `${from} is a dead end`);
    for (const to of targets) assert.ok(STATUSES.includes(to) && to !== from);
    if (CLOSED_STATUSES.includes(from)) assert.ok(targets.includes('UNDER_INVESTIGATION'), `${from} cannot reopen`);
  }
  const reached = new Set(['NEW']);
  for (const status of reached) for (const next of TRANSITIONS[status]) reached.add(next);
  assert.deepEqual([...reached].sort(), [...STATUSES].sort());
  assert.ok(!TRANSITIONS.NEW.includes('CLOSED') && !TRANSITIONS.UNDER_INVESTIGATION.includes('CLOSED'));
});

test('guidance exists for every analyzer, level and confidence, and round-trips through storage', () => {
  for (const analyzerType of ['EMAIL', 'URL', 'FILE'])
    for (const riskLevel of LEVELS)
      for (const confidence of Object.keys(ASSISTANCE_POLICY.confidence)) {
        const riskResult = {
          analyzerType,
          score: { LOW: 10, MEDIUM: 30, HIGH: 60, CRITICAL: 90 }[riskLevel],
          riskLevel,
          confidence,
          version: RISK_ENGINE_VERSION,
          reasonCodes: ['INSUFFICIENT_EVIDENCE'],
        };
        const guidance = buildIncidentAssistance({ analyzerType, riskResult });
        assert.ok(guidance.immediateActions.length && guidance.immediateActions.every(Boolean));
        assert.ok(guidance.avoidActions.every(Boolean) && guidance.followUpActions.every(Boolean));
        assert.doesNotMatch(JSON.stringify(guidance), /\bis (?:completely )?safe\b|undefined/i);
        const stored = projectStoredGuidance(JSON.parse(JSON.stringify(guidance)), riskResult);
        assert.equal(stored.status, 'AVAILABLE', `${analyzerType} ${riskLevel} ${confidence}`);
        const urgent = buildIncidentAssistance({
          analyzerType,
          riskResult,
          evidenceContext: { credentialsExposed: true },
        });
        const order = ASSISTANCE_POLICY.urgencyOrder;
        assert.ok(order.indexOf(urgent.urgency) >= order.indexOf(guidance.urgency));
      }
});

const PASTED_FROM = 'From: Alice <alice@example.org>';
const emailIds = async (body, headers = PASTED_FROM) =>
  (await analyzeEmail({ inputType: 'PASTED', body, headers })).indicators.map(({ id }) => id);

test('phishing phrases are found when wrapped, folded by HTML or split with invisible characters', async () => {
  for (const body of [
    'Please confirm your account password today.',
    'Please confirm your account\npassword today.',
    'Please confirm your account\r\npassword today.',
    '<p>Please confirm your\n      account\n   password</p>',
    'Please confirm your account pass\u200bword today.',
    'Please confirm your account pass\u00adword today.',
  ])
    assert.ok((await emailIds(body)).includes('CREDENTIAL_REQUEST'), JSON.stringify(body));
  assert.ok((await emailIds('<b>reset</b> your\n password')).includes('PASSWORD_RESET'));
  assert.ok((await emailIds('We need a wire\ntransfer now')).includes('PAYMENT_REQUEST'));
});

test('line folding does not join separate paragraphs, bullets or quoted lines', async () => {
  for (const body of [
    'Please share\n\npassword policy is attached',
    'Please share:\n- password policy\n- calendar',
    'Please share\n> password policy',
    'Please share\n2. password policy',
  ])
    assert.ok(!(await emailIds(body)).includes('CREDENTIAL_REQUEST'), JSON.stringify(body));
  assert.deepEqual(await emailIds('Lunch is at noon.\nSee you there.'), []);
});

test('link text is compared with its destination without flagging the same owner', async () => {
  const link = (href, label) => emailIds(`<a href="${href}">${label}</a>`);
  const mismatched = [
    ['https://evil.example.net/a', 'https://example.org/login'],
    ['https://evil.example.net/a', 'www.example.org'],
    ['https://evil.example.net/a', 'example.org/login'],
    ['https://example.org.evil.net/a', 'example.org'],
    ['https://notexample.org/a', 'example.org'],
  ];
  for (const [href, label] of mismatched)
    assert.ok((await link(href, label)).includes('URL_LABEL_MISMATCH'), `${label} -> ${href}`);
  const matching = [
    ['https://example.org/a', 'www.example.org'],
    ['https://www.example.org/a', 'example.org'],
    ['https://login.example.org/a', 'example.org'],
    ['https://example.net/a', 'Open the report'],
    ['https://example.net/a', 'report.pdf'],
    ['https://example.net/a', 'Node.js'],
  ];
  for (const [href, label] of matching)
    assert.ok(!(await link(href, label)).includes('URL_LABEL_MISMATCH'), `${label} -> ${href}`);
});

test('telephone links are ordinary; script and data links are still reported', async () => {
  assert.ok(!(await emailIds('<a href="tel:+97317000000">Call</a>')).includes('URL_SCHEME'));
  for (const href of ['javascript:alert(1)', 'data:text/html,x', 'file:///c:/x'])
    assert.ok((await emailIds(`<a href="${href}">Open</a>`)).includes('URL_SCHEME'), href);
});

test('exported messages with realistic header sizes are analyzed, and limits still apply', async () => {
  const message = (headers) => ({ inputType: 'EML', eml: Buffer.from(`${headers.join('\r\n')}\r\n\r\nHello`) });
  const relay = Array.from({ length: 150 }, (_, index) => `X-Relay-${index}: ${'x'.repeat(100)}`);
  const base = ['From: a@example.org', 'Subject: Hello'];
  assert.equal((await analyzeEmail(message([...base, ...relay]))).inputType, 'EML');
  const code = (expected) => (error) => error.code === expected;
  await assert.rejects(
    analyzeEmail(message([...base, `X-Big: ${'x'.repeat(EMAIL_LIMITS.emlHeaderBytes)}`])),
    code('EMAIL_INPUT_TOO_LARGE'),
  );
  const many = Array.from({ length: EMAIL_LIMITS.emlHeaderCount + 1 }, (_, index) => `X-${index}: y`);
  await assert.rejects(analyzeEmail(message([...base, ...many])), code('EMAIL_INPUT_TOO_LARGE'));
  await assert.rejects(
    analyzeEmail({ inputType: 'PASTED', body: 'x', headers: `X: ${'x'.repeat(EMAIL_LIMITS.headerBytes)}` }),
    code('EMAIL_INPUT_TOO_LARGE'),
  );
});

test('unavailable email authentication is reported as unavailable, and claims are never verified', async () => {
  const none = await analyzeEmail({ inputType: 'PASTED', body: 'Hello', headers: PASTED_FROM });
  for (const method of ['spf', 'dkim', 'dmarc']) assert.equal(none.authentication[method].status, 'UNAVAILABLE');
  const claimed = await analyzeEmail({
    inputType: 'PASTED',
    body: 'Hello',
    headers: `${PASTED_FROM}\r\nAuthentication-Results: mx.example.org; spf=pass; dkim=fail; dmarc=pass`,
  });
  for (const method of ['spf', 'dkim', 'dmarc']) assert.equal(claimed.authentication[method].verified, false);
  assert.ok(claimed.indicators.some(({ id }) => id === 'AUTHENTICATION_CONCERN'));
});

test('URL targets: local, private, metadata and disguised addresses are always blocked', () => {
  for (const url of [
    'http://localhost/',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://0177.0.0.1/',
    'http://10.0.0.1/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://metadata.google.internal/',
    'http://printer.local/',
    'http://intranet/',
    'http://router.lan/',
  ])
    assert.throws(() => normalizeUrl(url), { code: 'URL_TARGET_BLOCKED' }, url);
  for (const url of [
    'ftp://example.com/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'http://user:pass@example.com/',
    'http://example.com\\@evil.com/',
    'http:/example.com',
    'http://exa mple.com/',
    'http://example.com/%zz',
    '',
    null,
    {},
  ])
    assert.throws(() => normalizeUrl(url), { code: 'INVALID_URL' }, String(url));
  for (const address of ['8.8.8.8', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true);
  for (const address of ['224.0.0.1', '255.255.255.255', '2002::1', 'not-an-ip'])
    assert.equal(isPublicAddress(address), false);
});

test('brand detection finds lookalikes and ignores ordinary words and official domains', () => {
  for (const host of [
    'paypa1.com',
    'paypai.com',
    'secure-paypal.net',
    'securepaypal.com',
    'paypal.com.evil.net',
    'micros0ft-support.net',
    'g00gle.net',
    'apple-id.net',
    'xn--pple-43d.com',
  ])
    assert.equal(brandInHostname(host), true, host);
  for (const host of [
    'pineapple.com',
    'applesauce.org',
    'paypal.com',
    'www.paypal.com',
    'login.microsoftonline.com',
    'store.apple.com',
    'example.com',
    'ewa.bh',
  ])
    assert.equal(brandInHostname(host), false, host);
  const ids = (url) => localUrlIndicators(normalizeUrl(url)).map(({ id }) => id);
  assert.ok(ids('https://paypa1.com/').includes('BRAND_PATTERN'));
  assert.ok(!ids('https://pineapple.com/').includes('BRAND_PATTERN'));
});

test('a hash lookup never claims that the file itself was inspected', async () => {
  for (const report of [
    { provider: 'VIRUSTOTAL', scope: 'FILE_HASH', status: 'NO_REPORT' },
    vt(0, 0, 'FILE_HASH'),
    vt(12, 0, 'FILE_HASH'),
  ]) {
    const result = await analyzeFileHash('a'.repeat(64), { lookupFileHash: async () => report });
    assert.equal(result.localScans, 'NOT_SCANNED');
    const { availableSources, unavailableSources } = result.risk.evidenceCoverage;
    for (const source of ['FILE_LOCAL', 'CLAMAV', 'YARA']) {
      assert.ok(!availableSources.includes(source), source);
      assert.ok(unavailableSources.includes(source), source);
    }
  }
});

test('every status the reputation client can return survives to the assistant unchanged', async () => {
  const seen = new Set(['NOT_APPLICABLE', 'SKIPPED_DNS', 'SKIPPED_PRIVACY', 'BUSY', 'TIMEOUT', 'AVAILABLE']);
  seen.add((await createThreatIntelligence().lookupFileHash('a'.repeat(64))).status);
  for (const status of [200, 401, 403, 404, 429, 500]) {
    const client = createThreatIntelligence({
      apiKey: 'synthetic',
      fetchImpl: async () => new Response('{}', { status }),
    });
    seen.add((await client.lookupFileHash('b'.repeat(64))).status);
  }
  assert.ok(seen.has('NO_REPORT') && seen.has('UNAUTHORIZED') && seen.has('MALFORMED_RESPONSE'));
  for (const status of seen) {
    const record = {
      id: randomUUID(),
      riskScore: 0,
      severity: 'LOW',
      riskRuleVersion: RISK_ENGINE_VERSION,
      clamavStatus: 'NOT_SCANNED',
      yaraStatus: 'NOT_SCANNED',
      evidence: {
        indicators: [],
        threatIntelligence: { provider: 'VIRUSTOTAL', status },
        risk: {
          analyzerType: 'FILE',
          score: 0,
          riskLevel: 'LOW',
          version: RISK_ENGINE_VERSION,
          confidence: 'LIMITED_CONFIDENCE',
          reasonCodes: ['INSUFFICIENT_EVIDENCE'],
        },
      },
    };
    const projected = projectToolResult({ name: 'get_analysis_result' }, 'FILE', record);
    assert.deepEqual(projected.data.providerStatuses, [{ provider: 'VIRUSTOTAL', status }]);
  }
});

test('AI answers: advice about verifying is accepted, assertions of safety are rejected', () => {
  for (const text of [
    'Check whether the sender is legitimate before you reply.',
    'If you are not sure the link is safe, report it.',
    'Never assume an email is legitimate because it has a logo.',
    'Don’t assume the attachment is safe.',
    "A padlock doesn't mean the site is safe.",
    'If the sender is legitimate, they will not mind a call.',
    'I cannot guarantee that the file is safe.',
  ])
    assert.equal(validateGroundedText(text, []), text);
  for (const text of [
    'This file is safe.',
    'The sender is legitimate.',
    'I am not sure who sent it, but this link is safe.',
    'Whether or not you agree, this file is safe.',
    'If you ask me this file is safe.',
    'Do not worry. The site is safe.',
    'Check whether it is completely safe.',
    'It is definitely legitimate.',
    'I created an incident for you.',
  ])
    assert.throws(() => validateGroundedText(text, []), { code: 'AI_INVALID_RESPONSE' }, text);
});

test('AI answers may state the analysis risk and the linked incident severity, and nothing else', () => {
  const result = (incident) => ({
    data: { risk: { riskLevel: 'HIGH', score: 67 }, ...(incident ? { incident } : {}) },
  });
  const raised = [result({ recorded: true, severity: 'CRITICAL' })];
  const text = 'The analysis risk is HIGH with score 67, and the incident severity is CRITICAL.';
  assert.equal(validateGroundedText(text, raised), text);
  assert.throws(() => validateGroundedText(text, [result()]), { code: 'AI_INVALID_RESPONSE' });
  assert.throws(() => validateGroundedText('The risk is LOW.', raised), { code: 'AI_INVALID_RESPONSE' });
  assert.throws(() => validateGroundedText('The risk score is 12.', raised), { code: 'AI_INVALID_RESPONSE' });
  assert.throws(() => validateGroundedText('I rate it 99/100.', raised), { code: 'AI_INVALID_RESPONSE' });
});

test('chat privacy gates block secrets and raw analysis input but not security questions', () => {
  for (const text of [
    'password: hunter2',
    'my password is hunter2',
    'the OTP is 123456',
    '123456',
    'sk-abcdefghijklmnop',
    'Bearer abc.def',
    '-----BEGIN RSA PRIVATE KEY-----',
    'https://user:pw@example.com',
  ])
    assert.equal(containsSecret(text), true, text);
  for (const text of [
    'My password is stolen, what should I do?',
    'How long should a password be?',
    'What is the status of INC-2026-000123?',
    'Is my password strong enough?',
    'My verification code is not working',
  ])
    assert.equal(containsSecret(text), false, text);
  assert.equal(containsAnalysisInput('see http://example.com'), true);
  assert.equal(containsAnalysisInput('From: attacker@example.com'), true);
  assert.equal(containsAnalysisInput('I received an email from my bank'), false);
});

test('quiz drafts require exactly one correct, distinct option and valid bounds', () => {
  const question = (overrides = {}) => ({
    text: 'Which is right?',
    type: 'MULTIPLE_CHOICE',
    explanation: 'Because.',
    points: 1,
    options: [
      { text: 'A', isCorrect: true },
      { text: 'B', isCorrect: false },
    ],
    ...overrides,
  });
  const draft = (overrides = {}) => ({
    title: 'Quiz',
    passingPercent: 80,
    maxAttempts: 3,
    questions: [question()],
    ...overrides,
  });
  assert.equal(validateQuizDraft(draft()).questions.length, 1);
  const options = (...flags) => flags.map((isCorrect, index) => ({ text: `Option ${index}`, isCorrect }));
  for (const bad of [
    draft({ passingPercent: 0 }),
    draft({ passingPercent: 101 }),
    draft({ maxAttempts: 11 }),
    draft({ questions: [] }),
    draft({ questions: Array(31).fill(question()) }),
    draft({ title: '<b>x</b>' }),
    draft({ extra: true }),
    draft({ questions: [question({ points: 0 })] }),
    draft({ questions: [question({ options: options(true, true) })] }),
    draft({ questions: [question({ options: options(false, false) })] }),
    draft({ questions: [question({ options: options(true) })] }),
    draft({
      questions: [
        question({
          options: [
            { text: 'Same', isCorrect: true },
            { text: ' same ', isCorrect: false },
          ],
        }),
      ],
    }),
    draft({ questions: [question({ type: 'TRUE_FALSE' })] }),
    draft({ questions: [question({ options: [{ text: 'A', isCorrect: 1 }, ...options(false)] })] }),
  ])
    assert.throws(() => validateQuizDraft(bad), { status: 400 });
});

test('period and ordering rules are UTC, bounded and stable', () => {
  const now = new Date('2026-11-24T22:30:00.000Z');
  for (const [period, days] of [
    ['7d', 7],
    ['30d', 30],
    ['90d', 90],
  ]) {
    const range = securityPeriod({ period }, now);
    assert.equal(range.days, days);
    assert.equal(range.endExclusive.toISOString(), '2026-11-25T00:00:00.000Z');
  }
  assert.equal(securityPeriod({ period: 'custom', start: '2026-02-28', end: '2026-02-28' }, now).days, 1);
  for (const query of [
    { period: 'custom', start: '2026-02-30', end: '2026-03-01' },
    { period: 'custom', start: '2026-03-02', end: '2026-03-01' },
    { period: 'custom', start: '2026-01-01', end: '2026-12-31' },
    { period: '7d', start: '2026-01-01' },
    { period: 'all' },
    { unknown: '1' },
  ])
    assert.throws(() => securityPeriod(query, now), { status: 400 }, JSON.stringify(query));
  const rows = ['2026-09', '2026-12', '2026-11', '2026-10'].map((value) => ({
    id: value,
    period: new Date(`${value}-01T00:00:00Z`),
  }));
  assert.deepEqual(
    nearestMonthOrder(rows, now).map(({ id }) => id),
    ['2026-11', '2026-12', '2026-10', '2026-09'],
  );
});
