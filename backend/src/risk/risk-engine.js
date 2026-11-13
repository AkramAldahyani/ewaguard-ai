import { RISK_ENGINE_VERSION, RISK_POLICY as P, riskLevelForScore } from './risk-policy.js';
import { REASON_CODES } from './reason-codes.js';
import { normalizeRiskEvidence } from './evidence-adapters.js';

// Pure: callers supply a timestamp for report freshness. No clock, IO or secrets.
export function evaluateRisk({ analyzerType, evidence, evaluatedAt, confirmedContext = {} } = {}) {
  if (evaluatedAt !== undefined && (typeof evaluatedAt !== 'string' || !Number.isFinite(Date.parse(evaluatedAt)))) throw new TypeError('Invalid risk evaluation timestamp.');
  // Only a trusted application caller may supply separately confirmed events.
  // Never derive this context from email text, analyzer fields or LLM arguments.
  if (!confirmedContext || typeof confirmedContext !== 'object' || Array.isArray(confirmedContext) ||
      Object.entries(confirmedContext).some(([key, value]) => key !== 'corporateCredentialsSubmittedToPhishingSite' || typeof value !== 'boolean')) {
    throw new TypeError('Invalid confirmed risk context.');
  }
  const n = normalizeRiskEvidence(analyzerType, evidence, evaluatedAt);
  const unique = new Map();
  for (const s of n.signals) if (!unique.has(s.code) || unique.get(s.code).weight < s.weight) unique.set(s.code, s);
  const signals = [...unique.values()].sort((a, b) => b.weight - a.weight || a.code.localeCompare(b.code));
  const groups = new Map();
  for (const s of signals) {
    const used = groups.get(s.category) ?? 0;
    s.contribution = Math.min(s.weight, (P.caps[s.category] ?? P.maximum) - used);
    groups.set(s.category, used + s.contribution);
  }
  if (analyzerType === 'EMAIL' && signals.some((s) => ['EMAIL_CREDENTIAL_REQUEST', 'EMAIL_MFA_REQUEST'].includes(s.code)) && groups.size >= P.emailCombination.minimumGroups) {
    signals.push({ code: 'EMAIL_COMBINED_PHISHING', category: 'combination', contribution: P.emailCombination.contribution });
  }
  const strong = new Set(signals.filter((s) => s.strong).map((s) => s.source));
  const structural = signals.filter((s) => s.category === 'structure' && s.contribution > 0);
  const criticalEligible = confirmedContext.corporateCredentialsSubmittedToPhishingSite === true || strong.size >= P.critical.strongSources || (strong.size > 0 && structural.length >= P.critical.structuralGroups &&
    (groups.get('structure') ?? 0) >= P.critical.structuralContribution);
  let rawScore = signals.reduce((sum, s) => sum + s.contribution, 0);
  if (confirmedContext.corporateCredentialsSubmittedToPhishingSite) {
    const contribution = Math.max(0, P.thresholds.CRITICAL - rawScore);
    signals.push({ code: 'CONFIRMED_CREDENTIAL_SUBMISSION', category: 'interaction', contribution });
    rawScore += contribution;
  }
  const score = Math.min(rawScore, criticalEligible ? P.maximum : P.thresholds.CRITICAL - 1);
  if (n.unavailable.size) n.notes.add('INSUFFICIENT_EVIDENCE');
  if (n.conflicting) n.notes.add('CONFLICTING_SECURITY_EVIDENCE');
  if (!signals.length) n.notes.add('NO_KNOWN_INDICATORS');
  const limited = n.notes.has('COVERAGE_LIMITED') || n.notes.has('REPUTATION_STALE') || n.notes.has('REPUTATION_FRESHNESS_UNKNOWN');
  let confidence = 'LIMITED_CONFIDENCE';
  if (analyzerType === 'EMAIL') {
    if (n.available.has('EMAIL_LOCAL') && !n.unavailable.size && !limited) confidence = 'MODERATE_CONFIDENCE';
  } else if (n.detectionSources.size >= P.confidence.moderateSources) {
    confidence = 'MODERATE_CONFIDENCE';
    const sources = analyzerType === 'FILE' ? n.detectionSources.size : n.available.size;
    if (sources >= P.confidence.highSources && !n.unavailable.size && !limited) confidence = 'HIGH_CONFIDENCE';
  }
  if (n.conflicting) confidence = confidence === 'HIGH_CONFIDENCE' ? 'MODERATE_CONFIDENCE' : 'LIMITED_CONFIDENCE';
  if (confidence === 'LIMITED_CONFIDENCE' || limited) n.notes.add('INSUFFICIENT_EVIDENCE');
  const reason = (code, category, contribution) => ({ code, category, contribution, description: REASON_CODES[code] });
  const reasons = signals.map((s) => reason(s.code, s.category, s.contribution));
  reasons.push(...[...n.notes].sort().map((code) => reason(code, 'coverage', 0)));
  const riskLevel = riskLevelForScore(score);
  return {
    analyzerType, score, riskLevel, confidence, version: RISK_ENGINE_VERSION, reasons,
    evidenceCoverage: { availableSources: [...n.available].sort(), unavailableSources: [...n.unavailable].sort(), conflicting: n.conflicting },
    scoring: { uncappedScore: rawScore, capped: score !== rawScore, criticalEligible },
    recommendedActions: [...P.recommendations[riskLevel]],
    ...(evaluatedAt ? { evaluatedAt } : {}),
  };
}

const escalationAnalyzers = ['EMAIL', 'URL'];
// Applies an employee's explicit confirmation ("I entered my credentials") to a stored final risk snapshot.
// Deterministic and monotonic: the same rule as CONFIRMED_CREDENTIAL_SUBMISSION above, so the level becomes
// CRITICAL and the score never decreases. Only trusted application code may call this, after a separate
// confirmation step; never derive the context from analyzed content, chat text or LLM output.
export function escalateConfirmedRisk(snapshot, confirmedContext) {
  if (!confirmedContext || typeof confirmedContext !== 'object' || Array.isArray(confirmedContext) ||
      Object.keys(confirmedContext).join() !== 'corporateCredentialsSubmittedToPhishingSite' ||
      confirmedContext.corporateCredentialsSubmittedToPhishingSite !== true) throw new TypeError('Invalid confirmed risk context.');
  if (!snapshot || typeof snapshot !== 'object' || !escalationAnalyzers.includes(snapshot.analyzerType) ||
      !Number.isInteger(snapshot.score) || snapshot.score < 0 || snapshot.score > P.maximum ||
      snapshot.riskLevel !== riskLevelForScore(snapshot.score) || typeof snapshot.version !== 'string' ||
      typeof snapshot.confidence !== 'string' || !Array.isArray(snapshot.reasonCodes) || snapshot.reasonCodes.length > P.limits.indicators ||
      snapshot.reasonCodes.some((code) => typeof code !== 'string' || !Object.hasOwn(REASON_CODES, code))) throw new TypeError('Invalid stored risk snapshot.');
  const score = Math.max(snapshot.score, P.thresholds.CRITICAL);
  return { analyzerType: snapshot.analyzerType, score, riskLevel: riskLevelForScore(score), version: snapshot.version,
    confidence: snapshot.confidence, reasonCodes: [...new Set([...snapshot.reasonCodes, 'CONFIRMED_CREDENTIAL_SUBMISSION'])].sort() };
}
