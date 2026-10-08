import { ASSISTANCE_POLICY as P, INCIDENT_ASSISTANCE_VERSION } from './assistance-policy.js';
import { REASON_CODES } from '../risk/reason-codes.js';

const invalid = () => { throw new TypeError('Invalid incident assistance input.'); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function inputs(analyzerType, risk, context) {
  if (!Object.hasOwn(P.analyzers, analyzerType) || !isObject(risk) || risk.analyzerType !== analyzerType ||
      !Object.hasOwn(P.levels, risk.riskLevel) || !Object.hasOwn(P.confidence, risk.confidence) ||
      !P.supportedRiskVersions.includes(risk.version) || !isObject(context)) invalid();
  for (const [key, value] of Object.entries(context)) if (!P.contextFields.includes(key) || typeof value !== 'boolean') invalid();
  // Accept the minimized email persistence snapshot as well as the API result.
  const suppliedReasons = risk.reasonCodes === undefined ? risk.reasons : risk.reasonCodes;
  if (!Array.isArray(suppliedReasons) || suppliedReasons.length > P.maximumReasons) invalid();
  const codes = risk.reasonCodes === undefined
    ? suppliedReasons.map((reason) => isObject(reason) ? reason.code : invalid()) : suppliedReasons;
  if (!Array.isArray(codes) || codes.length > P.maximumReasons || codes.some((code) => typeof code !== 'string' || code.length > 100)) invalid();
  return [...new Set(codes)].sort();
}

// Pure guidance projection: never recalculates risk or reads raw analyzer input.
// evidenceContext is an optional, strictly boolean server-side contract for later
// integrations. Current analyzer endpoints do not accept or infer these events.
export function buildIncidentAssistance({ analyzerType, riskResult, evidenceContext = {}, version = INCIDENT_ASSISTANCE_VERSION } = {}) {
  if (version !== INCIDENT_ASSISTANCE_VERSION) invalid();
  const codes = inputs(analyzerType, riskResult, evidenceContext);
  const riskLevelPolicy = P.levels[riskResult.riskLevel];
  const exposure = evidenceContext.credentialsExposed || evidenceContext.mfaCodeShared || evidenceContext.unexpectedMfaApproved;
  const execution = evidenceContext.suspectedExecution;
  const override = execution ? P.reportedExecution : exposure ? P.reportedExposure : null;
  const urgency = override
    ? P.urgencyOrder[Math.max(P.urgencyOrder.indexOf(riskLevelPolicy.urgency), P.urgencyOrder.indexOf(override.urgency))]
    : riskLevelPolicy.urgency;
  const escalation = override?.escalation ?? riskLevelPolicy.escalation;
  // Upgrade guidance, never risk. Reported exposure must not retain routine
  // actions merely because the original analyzer result was LOW.
  const level = Object.values(P.levels).find((entry) => entry.urgency === urgency);
  const analyzer = P.analyzers[analyzerType];
  const buckets = { immediate: new Set(level.immediate), avoid: new Set(level.avoid), followUp: new Set(level.followUp) };
  const merge = (rule) => {
    for (const key of Object.keys(buckets)) for (const action of rule?.[key] ?? []) buckets[key].add(action);
  };
  merge(analyzer);
  const notes = new Set(); const reasons = [];
  let credentialRelevant = false;
  for (const code of codes) {
    if (!Object.hasOwn(REASON_CODES, code)) { notes.add(P.unknownReasonText); buckets.followUp.add('VERIFY_COVERAGE'); continue; }
    if (/^(EMAIL|URL|FILE)_/.test(code) && !code.startsWith(`${analyzerType}_`)) invalid();
    reasons.push({ code, description: REASON_CODES[code] });
    const rule = Object.hasOwn(P.reasonActions, code) ? P.reasonActions[code] : undefined;
    merge(rule); credentialRelevant ||= Boolean(rule?.credential);
    if (rule?.note) notes.add(rule.note);
  }
  if (riskResult.confidence === 'LIMITED_CONFIDENCE') buckets.followUp.add('VERIFY_COVERAGE');
  if (P.suspiciousLevels.includes(riskResult.riskLevel)) {
    for (const action of analyzer.suspiciousAvoid) buckets.avoid.add(action);
  }
  if (exposure || execution) {
    buckets.immediate.delete('CONTACT_SECURITY');
    buckets.immediate.add('CONTACT_URGENTLY');
  }
  const texts = (keys) => [...keys].map((key) => P.actions[key]);
  const containment = execution || (analyzerType === 'FILE' && P.containment.levels.includes(riskResult.riskLevel) && codes.some((code) => P.containment.reasons.includes(code)));
  const section = (enabled, reported, policy) => enabled ? {
    applicability: reported ? 'REPORTED_CONTEXT' : 'CONDITIONAL',
    summary: reported ? policy.reportedSummary : policy.conditionalSummary,
    actions: texts(policy.actions),
  } : null;
  return {
    version: INCIDENT_ASSISTANCE_VERSION, riskVersion: riskResult.version, analyzerType, riskLevel: riskResult.riskLevel,
    urgency, headline: level.headline,
    summary: `${override?.summary ?? level.summary} ${P.confidence[riskResult.confidence]}`,
    confidenceNotes: [...notes], immediateActions: texts(buckets.immediate), avoidActions: texts(buckets.avoid), followUpActions: texts(buckets.followUp),
    escalationRecommendation: { level: escalation, description: P.escalation[escalation] },
    credentialGuidance: section(credentialRelevant || exposure, exposure, P.credentials),
    deviceContainmentGuidance: section(containment, execution, P.containment),
    evidencePreservationGuidance: P.preservationLevels.includes(riskResult.riskLevel) || exposure || execution ? [...analyzer.preservation] : [],
    reasons, disclaimer: P.disclaimer,
  };
}
