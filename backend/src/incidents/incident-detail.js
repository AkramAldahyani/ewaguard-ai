import { REASON_CODES } from '../risk/reason-codes.js';
import { RISK_POLICY } from '../risk/risk-policy.js';
import { ASSISTANCE_POLICY as P, INCIDENT_ASSISTANCE_VERSION } from '../assistance/assistance-policy.js';

const sources = ['EMAIL', 'URL', 'FILE'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = (reason) => ({ status: 'UNAVAILABLE', reason });
const version = (value) => typeof value === 'string' && /^\d{1,3}\.\d{1,3}$/.test(value) ? value : null;
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const known = (value, allowed) => allowed.includes(value) ? value : 'UNAVAILABLE';
const count = (value) => Number.isInteger(value) && value >= 0 && value <= 10000 ? value : null;
const list = (value, allowed, max = 128) => Array.isArray(value) ? [...new Set(value.slice(0, max).filter((item) => allowed.includes(item)))] : [];
const coverageSources = ['EMAIL_LOCAL', 'EMAIL_SPF_CLAIMS', 'EMAIL_DKIM_CLAIMS', 'EMAIL_DMARC_CLAIMS', 'EMAIL_LINK_REPUTATION',
  'EMAIL_ATTACHMENT_SCANS', 'URL_LOCAL', 'DNS', 'TLS', 'VIRUSTOTAL', 'VIRUSTOTAL_URL', 'VIRUSTOTAL_DOMAIN',
  'VIRUSTOTAL_URL_AND_DOMAIN', 'VIRUSTOTAL_FILE', 'VIRUSTOTAL_FILE_HASH', 'CLAMAV', 'YARA', 'FILE_LOCAL'];
const scannerStates = ['NOT_SCANNED', 'UNAVAILABLE', 'ERROR', 'NO_KNOWN_DETECTION', 'DETECTED'];
const providerStates = ['AVAILABLE', 'NOT_CONFIGURED', 'NOT_FOUND', 'RATE_LIMITED', 'UNAVAILABLE', 'ERROR', 'TIMEOUT',
  'SKIPPED_DNS', 'SKIPPED_PRIVACY', 'BUSY', 'MALFORMED_RESPONSE', 'AUTH_ERROR'];

// Validate persisted guidance against its versioned vocabulary. Never build new
// guidance at read time or return arbitrary strings from stored JSON.
export function projectStoredGuidance(value, risk) {
  if (!value) return unavailable('GUIDANCE_NOT_SAVED');
  if (!risk || value.version !== INCIDENT_ASSISTANCE_VERSION || value.riskVersion !== risk.version ||
      value.analyzerType !== risk.analyzerType || value.riskLevel !== risk.riskLevel) return unavailable('GUIDANCE_UNSUPPORTED_OR_INCONSISTENT');
  const actions = Object.values(P.actions);
  const texts = (items, allowed = actions) => {
    if (!Array.isArray(items) || items.length > 128 || items.some((item) => !allowed.includes(item))) throw new Error('Unsupported guidance');
    return [...items];
  };
  const text = (item, allowed) => { if (!allowed.includes(item)) throw new Error('Unsupported guidance'); return item; };
  const conditional = (section, policy) => section === null ? null : {
    applicability: text(section?.applicability, ['CONDITIONAL', 'REPORTED_CONTEXT']),
    summary: text(section?.summary, [policy.conditionalSummary, policy.reportedSummary]), actions: texts(section?.actions),
  };
  try {
    const summaries = [...Object.values(P.levels), P.reportedExposure, P.reportedExecution].flatMap((entry) =>
      Object.values(P.confidence).map((confidence) => `${entry.summary} ${confidence}`));
    const assistance = {
      version: value.version, riskVersion: risk.version, analyzerType: risk.analyzerType, riskLevel: risk.riskLevel,
      urgency: text(value.urgency, P.urgencyOrder), headline: text(value.headline, Object.values(P.levels).map((entry) => entry.headline)),
      summary: text(value.summary, summaries), confidenceNotes: texts(value.confidenceNotes, [...Object.values(P.reasonActions).map((entry) => entry.note).filter(Boolean), P.unknownReasonText]),
      immediateActions: texts(value.immediateActions), avoidActions: texts(value.avoidActions), followUpActions: texts(value.followUpActions),
      escalationRecommendation: { level: text(value.escalationRecommendation?.level, Object.keys(P.escalation)),
        description: text(value.escalationRecommendation?.description, Object.values(P.escalation)) },
      credentialGuidance: conditional(value.credentialGuidance, P.credentials),
      deviceContainmentGuidance: conditional(value.deviceContainmentGuidance, P.containment),
      evidencePreservationGuidance: texts(value.evidencePreservationGuidance, P.analyzers[risk.analyzerType].preservation),
      disclaimer: text(value.disclaimer, [P.disclaimer]),
    };
    return { status: 'AVAILABLE', provenance: 'SAVED_INCIDENT_ASSISTANCE', assistance };
  } catch { return unavailable('GUIDANCE_UNSUPPORTED_OR_INCONSISTENT'); }
}

function evidence(snapshot, type, admin) {
  const dictionary = RISK_POLICY[type.toLowerCase()];
  const indicatorCodes = list(snapshot.indicatorCodes, Object.keys(dictionary));
  const result = {
    status: 'AVAILABLE',
    indicators: indicatorCodes.map((code) => ({ code, explanation: REASON_CODES[dictionary[code][0]] })),
    scannerStatuses: type === 'FILE' ? Object.fromEntries(['clamav', 'yara'].map((key) => [key, known(snapshot.scannerStatuses?.[key], scannerStates)])) : {},
    providerStatuses: Array.isArray(snapshot.providerStatuses) ? snapshot.providerStatuses.slice(0, 4).filter((item) => item?.provider === 'VIRUSTOTAL')
      .map((item) => ({ provider: 'VIRUSTOTAL', status: known(item.status, providerStates) })) : [],
    coverage: snapshot.evidenceCoverage ? { status: snapshot.evidenceCoverage.unavailable === true ? 'UNAVAILABLE' : 'AVAILABLE',
      availableSources: list(snapshot.evidenceCoverage.availableSources, coverageSources),
      unavailableSources: list(snapshot.evidenceCoverage.unavailableSources, coverageSources), conflicting: snapshot.evidenceCoverage.conflicting === true } : unavailable('COVERAGE_NOT_SAVED'),
  };
  if (type === 'EMAIL') result.authentication = Object.fromEntries(['spf', 'dkim', 'dmarc'].map((key) => [key, {
    status: known(snapshot.checks?.authentication?.[key]?.status, ['HEADER_CLAIM', 'CONFLICTING_CLAIMS', 'UNAVAILABLE']),
    claimedResults: list(snapshot.checks?.authentication?.[key]?.claimedResults, ['PASS', 'FAIL', 'SOFTFAIL', 'NEUTRAL', 'NONE', 'TEMPERROR', 'PERMERROR']), verified: false,
  }]));
  if (admin) {
    result.reputation = Array.isArray(snapshot.checks?.reputation) ? snapshot.checks.reputation.slice(0, 4).filter((item) => item?.provider === 'VIRUSTOTAL')
      .map((item) => ({ provider: 'VIRUSTOTAL', available: item.available === true,
        ...(item.available === true ? Object.fromEntries(['maliciousCount', 'suspiciousCount', 'harmlessCount', 'undetectedCount'].map((key) => [key, count(item[key])])) : {}) })) : [];
    if (type === 'FILE') result.file = {
      sha256: typeof snapshot.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(snapshot.sha256) ? snapshot.sha256 : null,
      sizeBytes: typeof snapshot.sizeBytes === 'string' && /^\d{1,12}$/.test(snapshot.sizeBytes) ? snapshot.sizeBytes : null,
      normalizedType: known(snapshot.checks?.normalizedType, ['PDF', 'ZIP', 'DOCX', 'XLSX', 'PPTX', 'PE', 'TEXT', 'PNG', 'JPEG', 'GIF']),
    };
  }
  return result;
}

export function projectIncidentDetail(row, admin) {
  const output = { riskPolicyVersion: version(row.riskRuleVersion), escalationPolicyVersion: version(row.escalationMetadata?.policyVersion),
    risk: unavailable('RISK_DETAIL_NOT_SAVED'), source: unavailable('SOURCE_REFERENCE_NOT_SAVED'),
    evidence: unavailable('EVIDENCE_NOT_SAVED'), guidance: unavailable('GUIDANCE_NOT_SAVED') };
  // Only the original automatic snapshot is authoritative. Later internal
  // evidence rows and arbitrary free-form incident JSON are not employee data.
  const snapshot = row.evidence?.[0]?.snapshot;
  const type = snapshot?.analyzerType;
  if (!sources.includes(type) || typeof snapshot.analysisId !== 'string' || !uuid.test(snapshot.analysisId) ||
      row.sourceKey !== `${type}:${snapshot.analysisId}` || row.detectionSource !== `${type}_ANALYSIS`) return output;
  output.source = { status: 'AVAILABLE', analyzerType: type, analysisId: snapshot.analysisId, analyzedAt: date(snapshot.analyzedAt),
    provenance: 'INCIDENT_CREATION_SNAPSHOT' };
  const risk = snapshot.risk;
  if (!P.supportedRiskVersions.includes(risk?.version) || risk.version !== row.riskRuleVersion || risk.analyzerType !== type ||
      risk.score !== row.riskScore || risk.riskLevel !== row.severity || !Number.isInteger(risk.score) || risk.score < 0 || risk.score > 100) {
    output.risk = unavailable('RISK_VERSION_UNSUPPORTED_OR_INCONSISTENT');
    output.evidence = unavailable('RISK_VERSION_UNSUPPORTED_OR_INCONSISTENT');
    return output;
  }
  const codes = Array.isArray(risk.reasonCodes) ? risk.reasonCodes.slice(0, 128) : [];
  const reasons = [...new Set(codes.filter((code) => typeof code === 'string' && Object.hasOwn(REASON_CODES, code) &&
    (!/^(EMAIL|URL|FILE)_/.test(code) || code.startsWith(`${type}_`))))];
  output.risk = { status: 'AVAILABLE', score: risk.score, severity: risk.riskLevel,
    confidence: typeof risk.confidence === 'string' && Object.hasOwn(P.confidence, risk.confidence) ? risk.confidence : 'UNAVAILABLE',
    reasonsStatus: Array.isArray(risk.reasonCodes) && codes.length === risk.reasonCodes.length && reasons.length === new Set(codes).size ? 'AVAILABLE' : 'PARTIAL',
    reasons: reasons.map((code) => ({ code, explanation: REASON_CODES[code] })) };
  output.evidence = ['indicatorCodes', 'scannerStatuses', 'providerStatuses', 'evidenceCoverage', 'checks'].some((key) => Object.hasOwn(snapshot, key))
    ? evidence(snapshot, type, admin) : unavailable('EVIDENCE_NOT_SAVED');
  output.guidance = projectStoredGuidance(snapshot.assistance, risk);
  return output;
}
