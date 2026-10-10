export const INCIDENT_ESCALATION_POLICY_VERSION = '1.0';
export const INCIDENT_ESCALATION_POLICY = Object.freeze({
  levels: Object.freeze(['HIGH', 'CRITICAL']),
  urgentLevel: 'CRITICAL',
  initialStatus: 'NEW',
  // Development review deadline, not an approved EWA deletion schedule.
  reviewAfterDays: 90,
});

export function escalationDecision(risk) {
  return {
    eligible: INCIDENT_ESCALATION_POLICY.levels.includes(risk.riskLevel),
    urgent: risk.riskLevel === INCIDENT_ESCALATION_POLICY.urgentLevel,
    humanReviewRequired: true,
    limitedConfidence: risk.confidence === 'LIMITED_CONFIDENCE',
    policyVersion: INCIDENT_ESCALATION_POLICY_VERSION,
  };
}
