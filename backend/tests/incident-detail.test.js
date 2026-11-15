import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { projectIncidentDetail } from '../src/incidents/incident-detail.js';
import { buildIncidentAssistance } from '../src/assistance/incident-assistance.js';

function fixture(type = 'FILE') {
  const id = randomUUID();
  const risk = {
    analyzerType: type,
    score: 60,
    riskLevel: 'HIGH',
    version: '1.0',
    confidence: 'LIMITED_CONFIDENCE',
    reasonCodes: [
      type === 'FILE' ? 'FILE_CLAMAV_DETECTION' : type === 'URL' ? 'URL_ACCOUNT_PATH' : 'EMAIL_CREDENTIAL_REQUEST',
    ],
  };
  const snapshot = {
    analyzerType: type,
    analysisId: id,
    analyzedAt: '2026-10-10T10:00:00.000Z',
    risk,
    indicatorCodes: [type === 'FILE' ? 'ACTIVE_CONTENT' : type === 'URL' ? 'ACCOUNT_PATH' : 'CREDENTIAL_REQUEST'],
    scannerStatuses: { clamav: 'DETECTED', yara: 'UNAVAILABLE' },
    providerStatuses: [{ provider: 'VIRUSTOTAL', status: 'NOT_FOUND' }],
    evidenceCoverage: { availableSources: ['FILE_LOCAL'], unavailableSources: ['YARA'], conflicting: true },
    checks: {
      normalizedType: 'TEXT',
      reputation: [
        {
          provider: 'VIRUSTOTAL',
          available: true,
          maliciousCount: 7,
          suspiciousCount: 2,
          harmlessCount: 0,
          undetectedCount: 9,
        },
      ],
      authentication: { spf: { status: 'HEADER_CLAIM', claimedResults: ['FAIL'], verified: true } },
    },
    sha256: 'a'.repeat(64),
    sizeBytes: '512',
    assistance: buildIncidentAssistance({ analyzerType: type, riskResult: risk }),
  };
  const row = {
    sourceKey: `${type}:${id}`,
    detectionSource: `${type}_ANALYSIS`,
    severity: 'HIGH',
    riskScore: 60,
    riskRuleVersion: '1.0',
    escalationMetadata: { policyVersion: '1.0' },
    evidence: [{ snapshot }],
  };
  return { row, snapshot };
}
for (const type of ['EMAIL', 'URL', 'FILE'])
  test(`${type} saved risk, reasons, source and guidance project without recalculation`, () => {
    const { row, snapshot } = fixture(type);
    const original = structuredClone(row);
    const result = projectIncidentDetail(row, false);
    assert.equal(result.risk.score, 60);
    assert.equal(result.risk.confidence, 'LIMITED_CONFIDENCE');
    assert.equal(result.risk.reasons[0].code, snapshot.risk.reasonCodes[0]);
    assert.equal(result.source.analysisId, snapshot.analysisId);
    assert.equal(result.riskPolicyVersion, '1.0');
    assert.equal(result.guidance.status, 'AVAILABLE');
    assert.deepEqual(result.guidance.assistance.immediateActions, snapshot.assistance.immediateActions);
    assert.deepEqual(result.guidance.assistance.credentialGuidance, snapshot.assistance.credentialGuidance);
    assert.deepEqual(
      result.guidance.assistance.deviceContainmentGuidance,
      snapshot.assistance.deviceContainmentGuidance,
    );
    assert.deepEqual(row, original);
  });
test('historical guidance remains unavailable even with complete stored risk', () => {
  const { row, snapshot } = fixture();
  delete snapshot.assistance;
  const result = projectIncidentDetail(row, false);
  assert.equal(result.risk.status, 'AVAILABLE');
  assert.deepEqual(result.guidance, { status: 'UNAVAILABLE', reason: 'GUIDANCE_NOT_SAVED' });
});
test('legacy incident without a source snapshot has explicit unavailable states', () => {
  const result = projectIncidentDetail({ riskRuleVersion: '1.0', evidence: [] }, true);
  for (const key of ['risk', 'source', 'evidence', 'guidance']) assert.equal(result[key].status, 'UNAVAILABLE');
});
test('employee projection excludes hashes and reputation counts; admin receives normalized values', () => {
  const { row } = fixture();
  const employee = projectIncidentDetail(row, false);
  const admin = projectIncidentDetail(row, true);
  assert.equal(employee.evidence.file, undefined);
  assert.equal(employee.evidence.reputation, undefined);
  assert.equal(admin.evidence.file.sha256, 'a'.repeat(64));
  assert.equal(admin.evidence.reputation[0].maliciousCount, 7);
});
test('untrusted JSON strings and extra fields never escape the incident detail projection', () => {
  const { row, snapshot } = fixture();
  row.aiSummary = 'SECRET_AI';
  row.recommendedActions = ['SECRET_ACTION'];
  row.escalationMetadata.secret = 'SECRET_TOKEN';
  snapshot.body = 'SECRET_BODY';
  snapshot.fileContents = 'SECRET_BYTES';
  snapshot.url = 'https://user:SECRET_CREDENTIAL@example.invalid/?token=SECRET_QUERY';
  snapshot.indicatorCodes.push('SECRET_INDICATOR');
  snapshot.risk.reasonCodes.push('SECRET_REASON');
  snapshot.risk.reasons = [{ description: 'SECRET_DESCRIPTION' }];
  snapshot.scannerStatuses.yara = 'SECRET_SCANNER';
  snapshot.checks.reputation[0].maliciousCount = 'SECRET_COUNT';
  snapshot.checks.reputation[0].raw = 'SECRET_RESPONSE';
  snapshot.evidenceCoverage.availableSources.push('SECRET_COVERAGE');
  snapshot.assistance.extra = 'SECRET_EXTRA';
  const result = projectIncidentDetail(row, true);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_|https:|token=/);
  assert.equal(result.risk.reasonsStatus, 'PARTIAL');
  assert.equal(result.evidence.scannerStatuses.yara, 'UNAVAILABLE');
  assert.equal(result.evidence.reputation[0].maliciousCount, null);
});
test('unsupported guidance versions or injected action/summary text fail closed', () => {
  for (const change of [
    { version: 'old' },
    { immediateActions: ['SECRET_ACTION'] },
    { summary: 'SECRET_SUMMARY' },
    { analyzerType: 'URL' },
  ]) {
    const { row, snapshot } = fixture();
    Object.assign(snapshot.assistance, change);
    const result = projectIncidentDetail(row, true);
    assert.equal(result.guidance.status, 'UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(result), /SECRET_/);
  }
});
test('mismatched source references and risk tuples never reconstruct details', () => {
  for (const change of [
    { sourceKey: `FILE:${randomUUID()}` },
    { riskScore: 90 },
    { riskRuleVersion: '9.0' },
    { detectionSource: 'EMAIL_ANALYSIS' },
  ]) {
    const { row } = fixture();
    Object.assign(row, change);
    const result = projectIncidentDetail(row, false);
    assert.equal(result.risk.status, 'UNAVAILABLE');
    assert.equal(result.guidance.status, 'UNAVAILABLE');
  }
});
test('email authentication remains explicitly unverified', () => {
  const { row } = fixture('EMAIL');
  const result = projectIncidentDetail(row, false);
  assert.equal(result.evidence.authentication.spf.verified, false);
  assert.equal(result.evidence.authentication.dkim.status, 'UNAVAILABLE');
});
test('unknown confidence and absent evidence are unavailable without changing score', () => {
  const { row, snapshot } = fixture();
  snapshot.risk.confidence = { toString: {} };
  for (const key of ['indicatorCodes', 'scannerStatuses', 'providerStatuses', 'evidenceCoverage', 'checks'])
    delete snapshot[key];
  const result = projectIncidentDetail(row, false);
  assert.equal(result.risk.confidence, 'UNAVAILABLE');
  assert.equal(result.risk.score, 60);
  assert.equal(result.evidence.status, 'UNAVAILABLE');
});

test('BUG-004 saved 1.0 guidance stays valid and shows corrected notification wording', async () => {
  const { ASSISTANCE_POLICY: P } = await import('../src/assistance/assistance-policy.js');
  const { row, snapshot } = fixture('EMAIL');
  // Rebuild the snapshot exactly as version 1.0 stored it, with the outdated sentences.
  snapshot.assistance = {
    ...snapshot.assistance,
    version: '1.0',
    disclaimer: P.legacyTexts.disclaimer,
    escalationRecommendation: { level: 'RECOMMENDED', description: P.legacyTexts.escalation.RECOMMENDED },
  };
  const result = projectIncidentDetail(row, false);
  assert.equal(result.guidance.status, 'AVAILABLE');
  assert.equal(result.guidance.assistance.version, '1.0');
  assert.equal(result.guidance.assistance.escalationRecommendation.description, P.escalation.RECOMMENDED);
  assert.equal(result.guidance.assistance.disclaimer, P.disclaimer);
  assert.doesNotMatch(JSON.stringify(result.guidance), /notifications (and automated remediation )?are not enabled/);
  for (const text of [...Object.values(P.escalation), P.disclaimer]) assert.doesNotMatch(text, /not enabled/);
  snapshot.assistance.disclaimer = 'Injected text';
  assert.equal(projectIncidentDetail(row, false).guidance.reason, 'GUIDANCE_UNSUPPORTED_OR_INCONSISTENT');
  snapshot.assistance = { ...snapshot.assistance, disclaimer: P.disclaimer, version: '9.9' };
  assert.equal(projectIncidentDetail(row, false).guidance.reason, 'GUIDANCE_UNSUPPORTED_OR_INCONSISTENT');
});
