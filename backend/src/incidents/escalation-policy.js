export const INCIDENT_ESCALATION_POLICY_VERSION = '1.0';
export const INCIDENT_ESCALATION_POLICY = Object.freeze({
  levels: Object.freeze(['HIGH', 'CRITICAL']),
  urgentLevel: 'CRITICAL',
  initialStatus: 'NEW',
  // Development review deadline, not an approved EWA deletion schedule.
  reviewAfterDays: 90,
});

// An employee's explicit "I entered my credentials" confirmation on their own email or URL analysis.
export const EXPOSURE_REPORT_POLICY = Object.freeze({
  type: 'CREDENTIALS_SUBMITTED',
  source: 'EMPLOYEE_CONFIRMATION',
  analyzers: Object.freeze(['EMAIL', 'URL']),
  incidentType: 'CREDENTIAL_COMPROMISE',
  // Finished incidents go back to investigation when the exposure is reported afterwards.
  reopenFrom: Object.freeze(['RESOLVED', 'FALSE_POSITIVE', 'CLOSED']),
  reopenTo: 'UNDER_INVESTIGATION',
});

// Deterministic incident category from the analyzer and the stored risk reason codes. Never from analyzed text,
// chat or model output. Anything not clearly covered stays SUSPICIOUS_ACTIVITY; DATA_EXPOSURE and OTHER are left
// for human categorisation because no analyzer evidence establishes them.
export const INCIDENT_TYPE_RULES = Object.freeze({
  CREDENTIAL_COMPROMISE: Object.freeze(['CONFIRMED_CREDENTIAL_SUBMISSION']),
  MALWARE: Object.freeze(['FILE_CLAMAV_DETECTION', 'FILE_YARA_MATCH', 'FILE_VT_MALICIOUS', 'FILE_VT_SUSPICIOUS']),
  PHISHING: Object.freeze(['EMAIL_CREDENTIAL_REQUEST', 'EMAIL_MFA_REQUEST', 'EMAIL_LOGIN_REQUEST', 'EMAIL_COMBINED_PHISHING',
    'EMAIL_LINK_CREDENTIALS', 'EMAIL_LINK_DESTINATION_MISMATCH', 'EMAIL_REPLY_TO_MISMATCH', 'EMAIL_DISPLAY_NAME_CLAIM',
    'EMAIL_DISPLAY_ADDRESS_MISMATCH', 'EMAIL_SENDER_LOOKALIKE', 'EMAIL_PAYMENT_PRESSURE', 'EMAIL_PROCESS_BYPASS',
    'EMAIL_ATTACHMENT_INVITATION', 'URL_ACCOUNT_PATH', 'URL_ACCOUNT_TERMS', 'URL_BRAND_PATTERN']),
});
export function incidentTypeFor(reasonCodes) {
  const codes = new Set(Array.isArray(reasonCodes) ? reasonCodes : []);
  for (const [type, triggers] of Object.entries(INCIDENT_TYPE_RULES)) if (triggers.some((code) => codes.has(code))) return type;
  return 'SUSPICIOUS_ACTIVITY';
}

export function escalationDecision(risk) {
  return {
    eligible: INCIDENT_ESCALATION_POLICY.levels.includes(risk.riskLevel),
    urgent: risk.riskLevel === INCIDENT_ESCALATION_POLICY.urgentLevel,
    humanReviewRequired: true,
    limitedConfidence: risk.confidence === 'LIMITED_CONFIDENCE',
    policyVersion: INCIDENT_ESCALATION_POLICY_VERSION,
  };
}
