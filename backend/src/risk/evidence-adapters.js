import { RISK_POLICY as P } from './risk-policy.js';

const providerStatuses = [
  'AVAILABLE',
  'NOT_CONFIGURED',
  'NO_REPORT',
  'RATE_LIMITED',
  'BUSY',
  'UNAUTHORIZED',
  'UNAVAILABLE',
  'TIMEOUT',
  'MALFORMED_RESPONSE',
  'SKIPPED_DNS',
  'SKIPPED_PRIVACY',
  'NOT_APPLICABLE',
];
const empty = () => ({
  signals: [],
  available: new Set(),
  unavailable: new Set(),
  notes: new Set(),
  detectionSources: new Set(),
  cleanSources: new Set(),
  conflicting: false,
});
const invalid = () => {
  throw new TypeError('Invalid structured risk evidence.');
};
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value;
}
function array(value, maximum) {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  return value;
}
function status(value, allowed) {
  if (value === undefined) return 'MISSING';
  object(value);
  if (!allowed.includes(value.status)) invalid();
  return value.status;
}
function booleanFields(value, keys) {
  for (const key of keys) if (value?.[key] !== undefined && typeof value[key] !== 'boolean') invalid();
}
function source(n, name, available, detection = false) {
  (available ? n.available : n.unavailable).add(name);
  if (available && detection) n.detectionSources.add(name);
}
function signal(n, code, category, weight, sourceName, strong = false) {
  n.signals.push({ code, category, weight, source: sourceName, strong });
}
function indicators(n, values, rules, name, ignored = []) {
  source(n, name, values !== undefined);
  if (values === undefined) return;
  for (const item of array(values, P.limits.indicators)) {
    object(item);
    if (typeof item.id !== 'string' || item.id.length > 100) invalid();
    const rule = Object.hasOwn(rules, item.id) ? rules[item.id] : null;
    if (rule) signal(n, ...rule, name);
    else if (!ignored.includes(item.id)) n.notes.add('COVERAGE_LIMITED');
  }
}

function reputation(n, reports, type, evaluatedAt) {
  const scores = [];
  let positive = false,
    negative = false;
  if (!reports.length) source(n, 'VIRUSTOTAL', false);
  for (const report of reports) {
    const state = status(report, providerStatuses);
    if (report?.provider !== undefined && report.provider !== 'VIRUSTOTAL') invalid();
    if (
      report?.scope !== undefined &&
      !(type === 'URL' ? ['URL', 'DOMAIN', 'URL_AND_DOMAIN'] : ['FILE_HASH']).includes(report.scope)
    )
      invalid();
    const name = `VIRUSTOTAL_${report?.scope ?? type}`;
    if (state !== 'AVAILABLE') {
      source(n, name, false);
      continue;
    }
    const counts = ['maliciousCount', 'suspiciousCount', 'harmlessCount', 'undetectedCount'].map((key) => {
      const count = report[key];
      if (!Number.isSafeInteger(count) || count < 0 || count > P.limits.providerCount) invalid();
      return count;
    });
    const total = counts.reduce((sum, value) => sum + value, 0);
    source(n, name, total > 0);
    if (!total) continue;
    n.detectionSources.add('VIRUSTOTAL'); // URL/domain reports are one correlated provider.
    const [malicious, suspicious] = counts;
    positive ||= malicious + suspicious > 0;
    negative ||= malicious + suspicious === 0;
    let fresh = false;
    if (
      report.lastAnalysisDate != null &&
      (typeof report.lastAnalysisDate !== 'string' || !Number.isFinite(Date.parse(report.lastAnalysisDate)))
    )
      invalid();
    if (report.lastAnalysisDate && evaluatedAt) {
      const age = Date.parse(evaluatedAt) - Date.parse(report.lastAnalysisDate);
      fresh = age >= 0 && age <= P.reputation.staleDays * 86400_000;
      n.notes.add(age < 0 ? 'REPUTATION_FRESHNESS_UNKNOWN' : fresh ? 'FRESH_REPORT' : 'REPUTATION_STALE');
    } else n.notes.add('REPUTATION_FRESHNESS_UNKNOWN');
    const consensus =
      malicious >= P.reputation.consensusCount &&
      total >= P.reputation.minimumTotal &&
      malicious / total >= P.reputation.consensusRatio;
    const weight = consensus
      ? P.reputation.strongWeight
      : malicious >= P.reputation.moderateCount
        ? P.reputation.moderateWeight
        : malicious
          ? P.reputation.weakWeight
          : suspicious
            ? P.reputation.suspiciousWeight
            : 0;
    const code =
      type === 'URL'
        ? malicious
          ? 'URL_REPUTATION_MALICIOUS'
          : 'URL_REPUTATION_SUSPICIOUS'
        : malicious
          ? 'FILE_VT_MALICIOUS'
          : 'FILE_VT_SUSPICIOUS';
    scores.push({ code, category: 'reputation', weight, source: 'VIRUSTOTAL', strong: consensus && fresh });
  }
  // Never sum overlapping reports or discount a detection using harmless votes.
  scores.sort((a, b) => b.weight - a.weight || Number(b.strong) - Number(a.strong) || a.code.localeCompare(b.code));
  if (scores[0]?.weight) n.signals.push(scores[0]);
  if (negative) n.cleanSources.add('VIRUSTOTAL');
  if (positive && negative) n.conflicting = true;
  if (
    !scores.length ||
    [...n.unavailable].some((name) => name.startsWith('VIRUSTOTAL') || ['CLAMAV', 'YARA'].includes(name))
  )
    n.notes.add('PROVIDER_UNAVAILABLE');
  n.notes.delete('FRESH_REPORT');
}

function email(e) {
  const n = empty();
  indicators(n, e.indicators, P.email, 'EMAIL_LOCAL', [
    'SENDER_MISSING',
    'AUTHENTICATION_CONFLICT',
    'URL_LIMIT',
    'URL_UNPARSEABLE',
  ]);
  if (e.authentication !== undefined) object(e.authentication);
  for (const method of ['spf', 'dkim', 'dmarc']) {
    const value = e.authentication?.[method];
    const state = status(value, ['HEADER_CLAIM', 'CONFLICTING_CLAIMS', 'UNAVAILABLE']);
    source(n, `EMAIL_${method.toUpperCase()}_CLAIMS`, ['HEADER_CLAIM', 'CONFLICTING_CLAIMS'].includes(state));
    if (value) {
      for (const claim of array(value.claimedResults, P.limits.indicators))
        if (!['PASS', 'FAIL', 'SOFTFAIL', 'NEUTRAL', 'NONE', 'TEMPERROR', 'PERMERROR'].includes(claim)) invalid();
      n.conflicting ||= state === 'CONFLICTING_CLAIMS';
    }
  }
  if (n.unavailable.size) n.notes.add('EMAIL_AUTH_UNAVAILABLE');
  n.notes.add('EMAIL_UNVERIFIED_HEADERS');
  for (const field of ['attachments', 'urls']) {
    if (e[field] !== undefined && array(e[field], P.limits.indicators).length) {
      source(n, field === 'urls' ? 'EMAIL_LINK_REPUTATION' : 'EMAIL_ATTACHMENT_SCANS', false);
    }
  }
  if (e.indicators?.some(({ id }) => ['URL_LIMIT', 'URL_UNPARSEABLE', 'SENDER_MISSING'].includes(id)))
    n.notes.add('COVERAGE_LIMITED');
  n.conflicting ||= Boolean(e.indicators?.some(({ id }) => id === 'AUTHENTICATION_CONFLICT'));
  return n;
}

function url(e, evaluatedAt) {
  const n = empty();
  indicators(n, e.localIndicators, P.url, 'URL_LOCAL', ['SENSITIVE_QUERY']);
  source(
    n,
    'DNS',
    ['RESOLVED', 'IP_LITERAL'].includes(status(e.dnsEvidence, ['RESOLVED', 'IP_LITERAL', 'UNAVAILABLE'])),
  );
  const tls = status(e.tlsEvidence, ['AVAILABLE', 'UNAVAILABLE', 'TIMEOUT', 'NOT_APPLICABLE', 'SKIPPED_PORT']);
  if (tls !== 'NOT_APPLICABLE') source(n, 'TLS', tls === 'AVAILABLE');
  booleanFields(e.tlsEvidence, ['expired', 'notYetValid', 'hostnameMatch', 'chainAuthorized']);
  if (
    tls === 'AVAILABLE' &&
    (e.tlsEvidence.expired ||
      e.tlsEvidence.notYetValid ||
      e.tlsEvidence.hostnameMatch === false ||
      e.tlsEvidence.chainAuthorized === false)
  ) {
    signal(n, 'URL_TLS_CONCERN', 'tls', P.weights.tls, 'TLS');
  }
  reputation(
    n,
    e.threatIntelligence === undefined ? [] : array(e.threatIntelligence, P.limits.reports),
    'URL',
    evaluatedAt,
  );
  return n;
}

function file(e, evaluatedAt) {
  const n = empty();
  // These IDs already reflect the analyzer's type validation; do not detect again.
  indicators(n, e.indicators, P.file, 'FILE_LOCAL', [
    'AV_DETECTION',
    'YARA_MATCH',
    'HASH_REPUTATION',
    'ARCHIVE_INCOMPLETE',
    'ENCRYPTED_ARCHIVE',
    'NESTED_ARCHIVE',
  ]);
  const clam = status(e.clamav, ['CLEAN', 'DETECTED', 'UNAVAILABLE', 'ERROR', 'TIMEOUT']);
  source(n, 'CLAMAV', ['CLEAN', 'DETECTED'].includes(clam), true);
  booleanFields(e.clamav, ['coverageLimited']);
  if (e.clamav?.coverageLimited) n.notes.add('COVERAGE_LIMITED');
  if (clam === 'DETECTED') signal(n, 'FILE_CLAMAV_DETECTION', 'scanner', P.weights.clamav, 'CLAMAV', true);
  if (clam === 'CLEAN') n.cleanSources.add('CLAMAV');
  const yara = status(e.yara, ['MATCH', 'NO_MATCH', 'UNAVAILABLE', 'ERROR', 'TIMEOUT']);
  source(n, 'YARA', ['MATCH', 'NO_MATCH'].includes(yara), true);
  if (e.yara?.matches !== undefined) {
    for (const match of array(e.yara.matches, P.limits.matches)) {
      object(match);
      if (!['STRONG', 'WARNING', 'DEMO'].includes(match.strength)) invalid();
    }
  }
  if (yara === 'MATCH') {
    if (!e.yara.matches?.length) invalid();
    const strong = e.yara.matches.some((m) => m.strength === 'STRONG');
    const warning = e.yara.matches.some((m) => m.strength === 'WARNING');
    if (strong || warning)
      signal(n, 'FILE_YARA_MATCH', 'scanner', strong ? P.weights.yaraStrong : P.weights.yaraWarning, 'YARA', strong);
    else n.notes.add('FILE_YARA_DEMO');
  } else if (e.yara?.matches?.length) invalid();
  if (e.indicators?.some(({ id }) => ['ARCHIVE_INCOMPLETE', 'ENCRYPTED_ARCHIVE', 'NESTED_ARCHIVE'].includes(id)))
    n.notes.add('COVERAGE_LIMITED');
  reputation(n, e.threatIntelligence === undefined ? [] : [e.threatIntelligence], 'FILE', evaluatedAt);
  const detectedSources = new Set(
    n.signals.filter((s) => ['scanner', 'reputation'].includes(s.category)).map((s) => s.source),
  );
  n.conflicting ||= [...n.cleanSources].some((clean) => [...detectedSources].some((detected) => detected !== clean));
  return n;
}

export function normalizeRiskEvidence(analyzerType, evidence, evaluatedAt) {
  object(evidence);
  if (evidence.analyzer !== undefined && evidence.analyzer !== analyzerType) invalid();
  if (!['EMAIL', 'URL', 'FILE'].includes(analyzerType)) invalid();
  const provisional = evidence.provisionalClassification;
  if (provisional !== undefined && !['NO_STRONG_INDICATORS', 'SUSPICIOUS', 'HIGHLY_SUSPICIOUS'].includes(provisional))
    invalid();
  return { EMAIL: email, URL: url, FILE: file }[analyzerType](evidence, evaluatedAt);
}
