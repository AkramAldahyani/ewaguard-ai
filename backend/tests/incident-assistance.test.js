import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { buildIncidentAssistance } from '../src/assistance/incident-assistance.js';
import { ASSISTANCE_POLICY as P, INCIDENT_ASSISTANCE_VERSION } from '../src/assistance/assistance-policy.js';
import { evaluateRisk } from '../src/risk/risk-engine.js';
import { riskSnapshot } from '../src/risk/risk-persistence.js';

function input(analyzerType = 'EMAIL', riskLevel = 'LOW', codes = [], confidence = 'HIGH_CONFIDENCE') {
  return { analyzerType, riskResult: { analyzerType, riskLevel, confidence, version: '1.0', reasons: codes.map((code) => ({ code })) } };
}
const build = (...args) => buildIncidentAssistance(input(...args));
const text = (value) => JSON.stringify(value);

for (const [level, urgency, escalation] of [['LOW', 'ROUTINE', 'NONE'], ['MEDIUM', 'CAUTION', 'OPTIONAL'], ['HIGH', 'URGENT', 'RECOMMENDED'], ['CRITICAL', 'IMMEDIATE', 'URGENT']]) {
  test(`${level} maps to ${urgency} and ${escalation} without changing risk`, () => {
    const value = input('URL', level); const before = structuredClone(value);
    const result = buildIncidentAssistance(value);
    assert.equal(result.urgency, urgency); assert.equal(result.escalationRecommendation.level, escalation);
    assert.equal(result.riskLevel, level); assert.deepEqual(value, before);
  });
}

test('same risk/context gives identical guidance, stable reason ordering and independent results', () => {
  const value = input('EMAIL', 'HIGH', ['EMAIL_REPLY_TO_MISMATCH', 'EMAIL_CREDENTIAL_REQUEST']);
  value.evidenceContext = { credentialsExposed: true };
  const result = buildIncidentAssistance(value);
  assert.deepEqual(buildIncidentAssistance(value), result);
  const reversed = structuredClone(value); reversed.riskResult.reasons.reverse();
  assert.deepEqual(buildIncidentAssistance(reversed), result);
  result.immediateActions.push('mutated'); result.credentialGuidance.actions.push('mutated');
  assert.doesNotMatch(text(buildIncidentAssistance(value)), /mutated/);
});

test('policy and source risk versions included; archived risk snapshots reproduce guidance', () => {
  const riskResult = evaluateRisk({ analyzerType: 'EMAIL', evidence: { indicators: [{ id: 'CREDENTIAL_REQUEST' }] } });
  const result = buildIncidentAssistance({ analyzerType: 'EMAIL', riskResult });
  assert.equal(result.version, INCIDENT_ASSISTANCE_VERSION); assert.equal(result.riskVersion, riskResult.version);
  assert.deepEqual(result, buildIncidentAssistance({ analyzerType: 'EMAIL', riskResult: riskSnapshot(riskResult), version: '1.0' }));
});

test('credential requests warn against providing credentials and never infer exposure', () => {
  const result = build('EMAIL', 'MEDIUM', ['EMAIL_CREDENTIAL_REQUEST']);
  assert.match(result.avoidActions.join(' '), /Do not provide credentials/);
  assert.equal(result.credentialGuidance.applicability, 'CONDITIONAL');
  assert.match(result.credentialGuidance.summary, /^If you already/);
});
test('MFA requests include OTP and unexpected approval warnings', () => {
  const result = build('EMAIL', 'MEDIUM', ['EMAIL_MFA_REQUEST']);
  assert.match(result.avoidActions.join(' '), /Never share OTP\/MFA codes/);
  assert.match(result.avoidActions.join(' '), /Do not submit codes to EWAGuard/);
});
test('Reply-To mismatch requires independent verification', () => {
  assert.match(build('EMAIL', 'MEDIUM', ['EMAIL_REPLY_TO_MISMATCH']).immediateActions.join(' '), /known phone number or separate trusted channel/);
});
test('suspicious email attachment is not opened and original message preserved', () => {
  const result = build('EMAIL', 'HIGH', ['EMAIL_SUSPICIOUS_ATTACHMENT']);
  assert.match(result.avoidActions.join(' '), /Do not open the suspicious attachment/);
  assert.match(result.evidencePreservationGuidance.join(' '), /original message/);
  assert.equal(result.deviceContainmentGuidance, null);
});
test('malicious URL is not revisited and official website is used independently', () => {
  const result = build('URL', 'HIGH', ['URL_REPUTATION_MALICIOUS']);
  assert.match(result.avoidActions.join(' '), /Do not revisit/);
  assert.match(result.immediateActions.join(' '), /official bookmark/);
  assert.match(result.evidencePreservationGuidance.join(' '), /URL as text/);
});
test('credential-related URL includes no-entry and conditional recovery guidance', () => {
  const result = build('URL', 'MEDIUM', ['URL_ACCOUNT_PATH']);
  assert.match(result.avoidActions.join(' '), /Do not provide credentials or enter passwords/);
  assert.match(result.credentialGuidance.actions.join(' '), /official service using a trusted device/);
  assert.match(result.credentialGuidance.actions.join(' '), /do not reuse the old password/);
});
test('limited URL confidence changes wording without downgrading urgency', () => {
  const high = build('URL', 'HIGH', [], 'HIGH_CONFIDENCE');
  const limited = build('URL', 'HIGH', [], 'LIMITED_CONFIDENCE');
  assert.notEqual(high.summary, limited.summary); assert.match(limited.summary, /evidence is incomplete/);
  assert.equal(high.urgency, limited.urgency); assert.equal(limited.escalationRecommendation.level, 'RECOMMENDED');
});
test('ClamAV detection stops opening/execution and recommends security contact', () => {
  const result = build('FILE', 'HIGH', ['FILE_CLAMAV_DETECTION']);
  assert.match(result.avoidActions.join(' '), /Do not open or execute/);
  assert.match(result.avoidActions.join(' '), /Do not forward/);
  assert.match(result.immediateActions.join(' '), /Contact IT\/security/);
});
test('strong YARA-derived risk gets caution without repeating YARA weighting', () => {
  const riskResult = evaluateRisk({ analyzerType: 'FILE', evidence: { indicators: [], yara: { status: 'MATCH', matches: [{ strength: 'STRONG' }] } } });
  const result = buildIncidentAssistance({ analyzerType: 'FILE', riskResult });
  assert.equal(result.urgency, 'URGENT'); assert.match(result.avoidActions.join(' '), /Do not open or execute/);
});
test('detected file is not proof of execution or compromise; containment stays conditional', () => {
  const result = build('FILE', 'HIGH', ['FILE_CLAMAV_DETECTION']);
  assert.equal(result.deviceContainmentGuidance.applicability, 'CONDITIONAL');
  assert.match(result.deviceContainmentGuidance.summary, /does not establish that the file ran/);
  assert.match(result.deviceContainmentGuidance.actions.join(' '), /If malicious execution or device compromise is suspected/);
  assert.match(result.deviceContainmentGuidance.actions.join(' '), /where company procedure permits/);
  assert.match(result.deviceContainmentGuidance.actions.join(' '), /Do not power off/);
});
test('weak file heuristics and low YARA findings do not produce device containment advice', () => {
  for (const [level, codes] of [['LOW', []], ['MEDIUM', ['FILE_YARA_MATCH']], ['HIGH', ['FILE_TYPE_MISMATCH']], ['CRITICAL', []]]) {
    assert.equal(build('FILE', level, codes).deviceContainmentGuidance, null);
  }
});
test('LOW with limited confidence does not promise safety and prompts verification', () => {
  const result = build('EMAIL', 'LOW', [], 'LIMITED_CONFIDENCE');
  assert.match(result.summary, /available checks/); assert.match(result.summary, /evidence is incomplete/);
  assert.doesNotMatch(result.summary, /\bsafe\b|guaranteed|definitely legitimate/i);
  assert.match(result.followUpActions.join(' '), /independent verification/i);
});
test('provider unavailable and insufficient evidence are surfaced', () => {
  const result = build('URL', 'LOW', ['PROVIDER_UNAVAILABLE', 'INSUFFICIENT_EVIDENCE']);
  assert.match(result.confidenceNotes.join(' '), /unavailable/);
  assert.match(result.confidenceNotes.join(' '), /insufficient evidence/);
  assert.equal(result.followUpActions.filter((a) => a === P.actions.VERIFY_COVERAGE).length, 1);
});
test('reported credential/MFA context reuses recovery guidance without changing risk', () => {
  for (const field of ['credentialsExposed', 'mfaCodeShared', 'unexpectedMfaApproved']) {
    const value = input('EMAIL'); value.evidenceContext = { [field]: true };
    const result = buildIncidentAssistance(value);
    assert.equal(result.credentialGuidance.applicability, 'REPORTED_CONTEXT');
    assert.equal(result.escalationRecommendation.level, 'URGENT'); assert.equal(result.urgency, 'URGENT');
    assert.equal(result.riskLevel, 'LOW'); assert.match(text(result.credentialGuidance), /MFA remains enabled/);
    assert.doesNotMatch(result.immediateActions.join(' '), /normal caution/);
    assert.match(result.summary, /requires urgent attention/);
    assert.match(text(result.credentialGuidance), /report unauthorized prompts/);
  }
});
test('suspected execution context requires immediate contact and conditional company containment', () => {
  const value = input('FILE'); value.evidenceContext = { suspectedExecution: true };
  const result = buildIncidentAssistance(value);
  assert.equal(result.urgency, 'IMMEDIATE'); assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.deviceContainmentGuidance.applicability, 'REPORTED_CONTEXT');
  assert.ok(result.evidencePreservationGuidance.length); assert.match(text(result), /where company procedure permits/);
});
test('all HIGH/CRITICAL analyzers preserve evidence and never ask for public uploads', () => {
  for (const type of ['EMAIL', 'URL', 'FILE']) for (const level of ['HIGH', 'CRITICAL']) {
    const result = build(type, level);
    assert.ok(result.evidencePreservationGuidance.length); assert.match(result.avoidActions.join(' '), /Do not delete information/);
    assert.match(result.disclaimer, /has not created an incident, contacted IT\/security, or performed any remediation/);
  }
});
test('invalid contexts, classifications and unsupported versions fail safely', () => {
  for (const changes of [{ analyzerType: 'FAKE' }, { riskResult: null }, { evidenceContext: { password: 'SECRET' } },
    { evidenceContext: { credentialsExposed: 'true' } }, { evidenceContext: [] }, { version: 'future' },
    { riskResult: { ...input().riskResult, confidence: 'SAFE' } }, { riskResult: { ...input().riskResult, riskLevel: 'SUSPICIOUS' } },
    { riskResult: { ...input().riskResult, reasons: 'SECRET' } }, { riskResult: { ...input().riskResult, reasons: [null] } },
    { riskResult: { ...input().riskResult, reasonCodes: null } },
    { riskResult: { ...input().riskResult, version: 'future' } },
    { riskResult: { ...input().riskResult, reasons: [{ code: 'FILE_CLAMAV_DETECTION' }] } },
  ]) assert.throws(() => buildIncidentAssistance({ ...input(), ...changes }), { name: 'TypeError', message: 'Invalid incident assistance input.' });
});
test('untrusted descriptions and unknown reason text never enter guidance', () => {
  const value = input(); value.riskResult.reasons = [{ code: 'SECRET_IGNORE_RULES', description: 'Submit your password' }];
  const result = buildIncidentAssistance(value);
  assert.doesNotMatch(text(result), /SECRET|Submit your password/); assert.match(result.confidenceNotes.join(' '), /not covered/);
  assert.throws(() => buildIncidentAssistance({ ...input(), evidenceContext: { otp: 'SECRET' } }), TypeError);
});
test('guidance matrix contains no positive safety guarantees, secret requests or destructive commands', () => {
  for (const type of ['EMAIL', 'URL', 'FILE']) for (const level of Object.keys(P.levels)) for (const confidence of Object.keys(P.confidence)) {
    const result = build(type, level, [], confidence);
    assert.doesNotMatch(text(result), /(?:this (?:is|file is|website is) safe|you (?:are|have been) compromised|submit your (?:password|OTP)|send (?:us|EWAGuard) your|disable (?:MFA|antivirus|firewall)|Remove-Item|rm -rf|reg delete|format C:)/i);
    assert.match(result.disclaimer, /Never submit passwords, MFA codes/);
    assert.equal(result.deviceContainmentGuidance, null);
  }
});
test('assistance modules have no network, AI, database, file, execution or risk-calculation dependencies', async () => {
  const root = new URL('../src/assistance/', import.meta.url);
  for (const name of await readdir(root)) {
    const source = await readFile(new URL(name, root), 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.ok(['./assistance-policy.js', '../risk/reason-codes.js'].includes(match[1]));
    assert.doesNotMatch(source, /\b(?:fetch|require|execFile|readFile|OpenAI|Prisma|evaluateRisk|createIncident|Date|setTimeout)\s*\(|\bprocess\.(?:env|exit|cwd)/);
    assert.doesNotMatch(source, /import\s*\(/);
  }
});
