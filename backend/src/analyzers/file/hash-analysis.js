import { evaluateRisk } from '../../risk/risk-engine.js';
import { riskColumns } from '../../risk/risk-persistence.js';
import { retentionExpiry } from '../../privacy/retention-policy.js';

export function normalizeSha256(value) {
  if (typeof value !== 'string' || value.length > 128 || !/^[a-f0-9]{64}$/i.test(value.trim())) return null;
  return value.trim().toLowerCase();
}

// A fingerprint lookup cannot supply file size/type or local scanner evidence.
// Hash-only records never invent metadata or local scanning evidence.
export async function analyzeFileHash(sha256, threatIntelligence) {
  const report = await threatIntelligence.lookupFileHash(sha256);
  const evidence = { analyzer: 'FILE', indicators: [], threatIntelligence: report };
  const risk = evaluateRisk({ analyzerType: 'FILE', evidence, evaluatedAt: new Date().toISOString() });
  const detections = report.status === 'AVAILABLE' && report.maliciousCount + report.suspiciousCount > 0;
  const total =
    report.status === 'AVAILABLE'
      ? report.maliciousCount + report.suspiciousCount + report.harmlessCount + report.undetectedCount
      : 0;
  return {
    lookupType: 'SHA256_REPUTATION',
    sha256,
    risk,
    threatIntelligence: report,
    finding: detections ? 'DETECTIONS_REPORTED' : total > 0 ? 'NO_KNOWN_DETECTION' : 'UNKNOWN',
    localScans: 'NOT_SCANNED',
  };
}

export function hashLookupReceipt(row) {
  const result = row.evidence;
  return {
    analysisId: row.id,
    createdAt: row.createdAt.toISOString(),
    lookupType: 'SHA256_REPUTATION',
    sha256: row.sha256,
    risk: result.risk,
    threatIntelligence: result.threatIntelligence,
    finding: result.finding,
    localScans: 'NOT_SCANNED',
  };
}

export async function submitHashAnalysis(database, { userId, sha256 }, threatIntelligence) {
  const result = await analyzeFileHash(sha256, threatIntelligence);
  const now = new Date();
  const row = await database.fileAnalysis.create({
    data: {
      userId,
      sha256,
      kind: 'HASH_LOOKUP',
      status: 'COMPLETED',
      sizeBytes: null,
      detectedMime: null,
      extension: null,
      clamavStatus: 'NOT_SCANNED',
      yaraStatus: 'NOT_SCANNED',
      evidence: result,
      analyzedAt: now,
      expiresAt: retentionExpiry('file', now),
      ...riskColumns(result.risk),
    },
  });
  return hashLookupReceipt(row);
}
