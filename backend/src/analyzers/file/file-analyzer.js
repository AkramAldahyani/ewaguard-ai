import { buildIncidentAssistance } from '../../assistance/incident-assistance.js';
import { completeAnalysisEscalation } from '../../incidents/incident-engine.js';
import { inspectFile } from './file-inspection.js';
import { createFileTempStore } from './file-temp.js';
import { createFileScanners } from './file-scanners.js';
import { createThreatIntelligence } from '../../services/threat-intelligence.js';
import { FILE_PRIVACY_NOTICE } from '../../../../shared/file-policy.js';
import { evaluateRisk } from '../../risk/risk-engine.js';
import { riskColumns } from '../../risk/risk-persistence.js';
import { retentionExpiry } from '../../privacy/retention-policy.js';

export function fileIndicators({ file, validation }, clamav, yara, provider) {
  const values = [];
  const add = (condition, id, title) => { if (condition) values.push({ id, title }); };
  add(validation.extensionMismatch, 'TYPE_MISMATCH', 'The extension does not match the detected content type.');
  add(validation.mimeMismatch, 'MIME_MISMATCH', 'The supplied MIME type does not match the detected type.');
  add(validation.doubleExtension, 'DOUBLE_EXTENSION', 'A document or image extension is followed by another extension.');
  add(validation.suspiciousFilename, 'FILENAME_PATTERN', 'Filename path or control characters were discarded.');
  add(validation.scriptExtension || file.detectedType === 'PE', 'ACTIVE_CONTENT', 'This file type may execute code if opened or launched.');
  add(validation.archive?.status !== 'INSPECTED' && validation.archive, 'ARCHIVE_INCOMPLETE', 'Archive metadata could not be fully inspected within limits.');
  add(validation.archive?.encrypted, 'ENCRYPTED_ARCHIVE', 'Encrypted archive entries limit inspection.');
  add(validation.archive?.unsafePaths, 'ARCHIVE_PATH', 'The archive contains unsafe entry path patterns; nothing was extracted.');
  add(validation.archive?.executableEntries, 'ARCHIVE_EXECUTABLE', 'The archive contains executable or launcher filename patterns.');
  add(validation.archive?.nestedArchive, 'NESTED_ARCHIVE', 'Nested archive filenames were found; inspection coverage is limited.');
  add(validation.archive?.macroEntry, 'MACRO_ENTRY', 'The Office container includes a macro-related entry.');
  add(clamav.status === 'DETECTED', 'AV_DETECTION', 'ClamAV returned a detection. Do not open or execute this file.');
  add(yara.status === 'MATCH', 'YARA_MATCH', 'One or more static YARA rules matched. Review their descriptions.');
  add(provider.status === 'AVAILABLE' && provider.maliciousCount + provider.suspiciousCount > 0, 'HASH_REPUTATION', 'Existing hash reputation contains detections.');
  return values;
}

export function classifyFile(indicators, clamav, yara, provider) {
  if (clamav.status === 'DETECTED' || yara.matches.some((m) => m.strength === 'STRONG') ||
      (provider.status === 'AVAILABLE' && provider.maliciousCount >= 5)) return 'HIGHLY_SUSPICIOUS';
  const structural = indicators.some((i) => !['ACTIVE_CONTENT', 'MIME_MISMATCH', 'HASH_REPUTATION'].includes(i.id));
  if (structural || (provider.status === 'AVAILABLE' && provider.maliciousCount + provider.suspiciousCount >= 2)) return 'SUSPICIOUS';
  return 'NO_STRONG_INDICATORS';
}

export function createFileAnalyzer({ config = {}, scanners = createFileScanners(config), tempStore = createFileTempStore(),
  threatIntelligence = createThreatIntelligence({ apiKey: config.virusTotalApiKey }) } = {}) {
  return async (upload) => {
    try {
      const inspection = await inspectFile(upload);
      // Cleanup finishes before provider lookup and persistence. Original names
      // never become disk paths, command arguments, scanner metadata or DB fields.
      const { clamav, yara } = await tempStore.withFile(upload.buffer, async (file) => ({
        clamav: await scanners.clamav(file), yara: await scanners.yara(file),
      }));
      const provider = await threatIntelligence.lookupFileHash(inspection.file.sha256);
      const indicators = fileIndicators(inspection, clamav, yara, provider);
      const coverage = (clamav.status === 'CLEAN' || clamav.status === 'DETECTED') && !clamav.coverageLimited;
      return { analyzer: 'FILE', version: '6C.1', ...inspection, clamav, yara, threatIntelligence: provider, indicators,
        coverage: coverage && ['MATCH', 'NO_MATCH'].includes(yara.status) ? 'LOCAL_SCANNERS_COMPLETED' : 'PARTIAL_EVIDENCE',
        provisionalClassification: classifyFile(indicators, clamav, yara, provider),
        recommendations: [
          'Do not open an unexpected file. Verify the sender or source through a trusted channel.',
          'For suspicious findings, contact IT/security and follow company quarantine or deletion procedures. Do not forward the file to coworkers.',
          'If suspected malware was already executed, disconnect from the network where company procedure permits and contact IT/security immediately.',
        ], limitations: [
          'No strong indicators does not guarantee safety. This is an analyzer-local finding, not a final risk severity.',
          'Signature checks identify probable formats; they do not fully validate documents or detect every polyglot. MIME and extensions are untrusted.',
          'Uploaded content is never executed, previewed, or broadly extracted. ZIP inspection reads bounded metadata only. Encrypted and nested contents may remain uninspected.',
          'ClamAV depends on installed signatures and resource limits. CLEAN means no known detection from that scan, not that the file is safe.',
          'YARA uses a small curated ruleset on raw bytes. It can miss compressed, encoded or obfuscated content; rule matches may be false positives.',
          'Scanner errors, timeouts and unavailable checks are evidence gaps. Review scanner statuses even when no strong indicators were found.',
          'VirusTotal reports can be missing, stale or incorrect. A single weak provider vote does not establish maliciousness.',
          FILE_PRIVACY_NOTICE,
          'File hashes and minimized evidence are stored. Hash lookup reveals the file fingerprint to the provider; do not submit confidential material.',
        ] };
    } finally { upload.buffer?.fill(0); }
  };
}

const scannerStatus = (status) => ({ CLEAN: 'NO_KNOWN_DETECTION', NO_MATCH: 'NO_KNOWN_DETECTION', MATCH: 'DETECTED', DETECTED: 'DETECTED',
  UNAVAILABLE: 'UNAVAILABLE', TIMEOUT: 'ERROR', ERROR: 'ERROR' })[status] ?? 'ERROR';
export async function submitFileAnalysis(database, { userId, acknowledgementId, upload }, analyzer) {
  const result = await analyzer(upload);
  const now = new Date();
  result.risk = evaluateRisk({ analyzerType: 'FILE', evidence: result, evaluatedAt: now.toISOString() });
  const assistance = buildIncidentAssistance({ analyzerType: 'FILE', riskResult: result.risk });
  const stored = await database.fileAnalysis.create({ data: {
    userId, acknowledgementId, status: 'COMPLETED', sha256: result.file.sha256, sizeBytes: BigInt(result.file.size),
    extension: result.file.extension, detectedMime: result.file.mimeType, clamavStatus: scannerStatus(result.clamav.status), yaraStatus: scannerStatus(result.yara.status),
    evidence: result, analyzedAt: now, deletedAt: now, expiresAt: retentionExpiry('file', now),
    ...riskColumns(result.risk),
  }, select: { id: true, createdAt: true } });
  return { analysisId: stored.id, createdAt: stored.createdAt.toISOString(), result: { ...result, assistance },
    incident: await completeAnalysisEscalation(database, { userId, analyzerType: 'FILE', analysisId: stored.id }) };
}
