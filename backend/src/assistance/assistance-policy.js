export const INCIDENT_ASSISTANCE_VERSION = '1.1';
// Saved guidance from earlier versions remains readable; see legacyTexts below.
export const SUPPORTED_ASSISTANCE_VERSIONS = Object.freeze(['1.0', INCIDENT_ASSISTANCE_VERSION]);

function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

// Employee guidance only: no weights, detection rules, reporting destinations,
// executable commands or automated responses belong in this policy.
export const ASSISTANCE_POLICY = freeze({
  supportedRiskVersions: ['1.0', '1.1'],
  maximumReasons: 128,
  levels: {
    LOW: {
      urgency: 'ROUTINE',
      escalation: 'NONE',
      headline: 'Continue with normal caution',
      summary:
        'No strong malicious evidence was identified by the available checks. Verify unexpected requests independently.',
      immediate: ['NORMAL_CAUTION', 'VERIFY_SOURCE'],
      avoid: ['NO_UNNECESSARY_CREDENTIALS'],
      followUp: [],
    },
    MEDIUM: {
      urgency: 'CAUTION',
      escalation: 'OPTIONAL',
      headline: 'Verify before interacting',
      summary:
        'The available evidence warrants caution. Avoid interaction until you have independently verified the source.',
      immediate: ['PAUSE_INTERACTION', 'VERIFY_SOURCE'],
      avoid: ['NO_CREDENTIALS', 'NO_UNEXPECTED_ATTACHMENTS'],
      followUp: ['CONTACT_IF_UNCERTAIN'],
    },
    HIGH: {
      urgency: 'URGENT',
      escalation: 'RECOMMENDED',
      headline: 'Contact IT/security',
      summary:
        'The risk result calls for urgent caution. Stop interacting and contact IT/security through the approved reporting channel.',
      immediate: ['STOP_INTERACTION', 'CONTACT_SECURITY'],
      avoid: ['NO_CLICK_OPEN_REPLY', 'NO_CREDENTIALS', 'NO_EVIDENCE_DELETION'],
      followUp: ['FOLLOW_PROCEDURE'],
    },
    CRITICAL: {
      urgency: 'IMMEDIATE',
      escalation: 'URGENT',
      headline: 'Stop interaction and contact IT/security urgently',
      summary:
        'The risk result calls for immediate attention. Stop interacting and follow company escalation procedures without opening or executing anything further.',
      immediate: ['STOP_IMMEDIATELY', 'CONTACT_URGENTLY'],
      avoid: ['NO_CLICK_OPEN_REPLY', 'NO_CREDENTIALS', 'NO_EVIDENCE_DELETION'],
      followUp: ['FOLLOW_PROCEDURE'],
    },
  },
  confidence: {
    HIGH_CONFIDENCE:
      'Available evidence provides strong support for this risk evaluation. Follow the recommended precautions.',
    MODERATE_CONFIDENCE:
      'Available evidence provides partial support for this evaluation. Review its limitations and verify unexpected requests.',
    LIMITED_CONFIDENCE:
      'Available evidence is incomplete. Limited confidence does not reduce the need to follow the recommended precautions.',
  },
  escalation: {
    NONE: 'Independent verification is the next step. Use the approved IT/security channel if new concerns arise.',
    OPTIONAL: 'Contact IT/security if the source cannot be verified or uncertainty remains.',
    RECOMMENDED:
      'Contact IT/security through the approved reporting channel. When an incident is recorded, the security team is alerted automatically; the incident receipt shows its reference.',
    URGENT:
      'Contact IT/security urgently through the approved reporting channel. When an incident is recorded, the security team is alerted automatically; the incident receipt shows its reference.',
  },
  actions: {
    NORMAL_CAUTION: 'Continue with normal caution.',
    VERIFY_SOURCE: 'Verify the sender, domain, or file source independently using a known communication channel.',
    NO_UNNECESSARY_CREDENTIALS:
      'Do not provide passwords or other credentials unnecessarily in response to an unexpected request.',
    PAUSE_INTERACTION: 'Pause interaction with this item until its source and purpose are verified.',
    STOP_INTERACTION: 'Stop interacting with the suspicious item.',
    STOP_IMMEDIATELY: 'Stop interacting immediately; do not open, execute, or click anything further.',
    NO_CREDENTIALS: 'Do not provide credentials or enter passwords through the suspicious message, website, or file.',
    NO_OTP: 'Never share OTP/MFA codes or approve unexpected MFA prompts. Do not submit codes to EWAGuard.',
    NO_UNEXPECTED_ATTACHMENTS: 'Do not open unexpected attachments.',
    NO_CLICK_OPEN_REPLY: 'Do not click links, open attachments, execute files, or reply with sensitive information.',
    CONTACT_IF_UNCERTAIN: 'Contact IT/security if uncertainty remains after independent verification.',
    CONTACT_SECURITY: 'Contact IT/security through the approved company reporting channel.',
    CONTACT_URGENTLY: 'Contact IT/security immediately through the approved company reporting channel.',
    NO_EVIDENCE_DELETION: 'Do not delete information that the security team may need.',
    FOLLOW_PROCEDURE:
      "Follow company escalation and evidence-handling procedures and the security team's instructions.",
    EMAIL_VERIFY:
      "Verify the sender using a known phone number or separate trusted channel, not the message's Reply-To address.",
    EMAIL_NO_ATTACHMENT: 'Do not open the suspicious attachment or enable its active content.',
    EMAIL_PRESERVE: 'Keep the original email for IT/security; do not forward it broadly.',
    URL_OFFICIAL: 'Use an official bookmark or manually type the known domain to reach the intended service.',
    URL_NO_REVISIT: 'Do not revisit the suspicious URL.',
    FILE_VERIFY: 'Verify the file source independently before opening an unexpected file.',
    FILE_NO_EXECUTE: 'Do not open or execute the suspicious file.',
    FILE_NO_FORWARD: 'Do not forward the suspicious file to colleagues.',
    VERIFY_COVERAGE: 'Use independent verification or contact IT/security rather than relying on incomplete checks.',
    PASSWORD_CHANGE:
      'If an account password may have been exposed, change that affected password through the official service using a trusted device; do not reuse the old password.',
    MFA_REVIEW:
      'Verify MFA remains enabled, review account activity where organizational procedure permits, and report unauthorized prompts or approvals to IT/security.',
    NO_SECRET_SUBMISSION: 'Do not submit any password or OTP/MFA code to EWAGuard or include it in a report.',
    DEVICE_STOP: 'Stop interacting with the suspected file or affected device.',
    DEVICE_DISCONNECT:
      'If malicious execution or device compromise is suspected, disconnect the affected device from the network where company procedure permits and contact IT/security immediately.',
    DEVICE_NO_POWEROFF:
      'Do not power off the device, attempt cleanup, or alter system files; follow authorized IT/security instructions.',
    RECORD_EVENTS:
      'Preserve information about what happened and when, without reopening the item or reproducing the suspicious activity.',
  },
  analyzers: {
    EMAIL: {
      immediate: ['EMAIL_VERIFY'],
      avoid: [],
      suspiciousAvoid: [],
      preservation: [
        'Keep the original message, including available headers, for authorized IT/security review.',
        'Do not forward it broadly or delete evidence the security team may need. Use the approved reporting process.',
      ],
    },
    URL: {
      immediate: ['URL_OFFICIAL'],
      avoid: [],
      suspiciousAvoid: ['URL_NO_REVISIT'],
      preservation: [
        'Preserve the URL as text using the approved internal reporting procedure; do not revisit it to collect evidence.',
        'Note when and how you received it. Do not post token-bearing URLs or sensitive details to public services.',
      ],
    },
    FILE: {
      immediate: ['FILE_VERIFY'],
      avoid: [],
      suspiciousAvoid: ['FILE_NO_EXECUTE', 'FILE_NO_FORWARD'],
      preservation: [
        'Do not execute the file. Keep it isolated for authorized security handling if company procedure permits.',
        'Preserve its source and the time of the event. Do not forward it to colleagues or upload it to unapproved services.',
      ],
    },
  },
  reasonActions: {
    EMAIL_CREDENTIAL_REQUEST: { avoid: ['NO_CREDENTIALS', 'NO_OTP'], immediate: ['EMAIL_VERIFY'], credential: true },
    EMAIL_MFA_REQUEST: { avoid: ['NO_OTP', 'NO_CREDENTIALS'], immediate: ['EMAIL_VERIFY'], credential: true },
    EMAIL_REPLY_TO_MISMATCH: { immediate: ['EMAIL_VERIFY'] },
    EMAIL_SUSPICIOUS_ATTACHMENT: { avoid: ['EMAIL_NO_ATTACHMENT'], followUp: ['EMAIL_PRESERVE'] },
    EMAIL_ATTACHMENT_DISGUISE: { avoid: ['EMAIL_NO_ATTACHMENT'], followUp: ['EMAIL_PRESERVE'] },
    EMAIL_LOGIN_REQUEST: { avoid: ['NO_CREDENTIALS'], credential: true },
    EMAIL_LINK_CREDENTIALS: { avoid: ['NO_CREDENTIALS'], credential: true },
    URL_REPUTATION_MALICIOUS: { avoid: ['URL_NO_REVISIT', 'NO_CREDENTIALS'], credential: true },
    URL_REPUTATION_SUSPICIOUS: { avoid: ['URL_NO_REVISIT', 'NO_CREDENTIALS'], credential: true },
    URL_ACCOUNT_PATH: { avoid: ['NO_CREDENTIALS'], immediate: ['URL_OFFICIAL'], credential: true },
    URL_ACCOUNT_TERMS: { avoid: ['NO_CREDENTIALS'], immediate: ['URL_OFFICIAL'], credential: true },
    FILE_CLAMAV_DETECTION: { avoid: ['FILE_NO_EXECUTE', 'FILE_NO_FORWARD'], followUp: ['CONTACT_SECURITY'] },
    FILE_YARA_MATCH: { avoid: ['FILE_NO_EXECUTE', 'FILE_NO_FORWARD'], followUp: ['CONTACT_IF_UNCERTAIN'] },
    FILE_VT_MALICIOUS: { avoid: ['FILE_NO_EXECUTE', 'FILE_NO_FORWARD'], followUp: ['CONTACT_SECURITY'] },
    PROVIDER_UNAVAILABLE: {
      followUp: ['VERIFY_COVERAGE'],
      note: 'Some scanner or reputation checks were unavailable or provided no usable report.',
    },
    INSUFFICIENT_EVIDENCE: {
      followUp: ['VERIFY_COVERAGE'],
      note: 'There is insufficient evidence for a complete assessment. Independent verification is important.',
    },
    COVERAGE_LIMITED: { followUp: ['VERIFY_COVERAGE'], note: 'Some content or security-check coverage was limited.' },
    REPUTATION_STALE: {
      followUp: ['VERIFY_COVERAGE'],
      note: 'Some reputation reports are old and may not reflect the current item.',
    },
    REPUTATION_FRESHNESS_UNKNOWN: {
      followUp: ['VERIFY_COVERAGE'],
      note: 'The freshness of some reputation evidence could not be established.',
    },
    CONFLICTING_SECURITY_EVIDENCE: {
      followUp: ['VERIFY_COVERAGE'],
      note: 'Security evidence conflicts. Retain the recommended precautions and ask IT/security for help if uncertain.',
    },
  },
  suspiciousLevels: ['MEDIUM', 'HIGH', 'CRITICAL'],
  preservationLevels: ['HIGH', 'CRITICAL'],
  // Require both a high final risk and relevant detection evidence for conditional
  // device advice. No scanner result is proof that the file was executed.
  containment: {
    levels: ['HIGH', 'CRITICAL'],
    reasons: ['FILE_CLAMAV_DETECTION', 'FILE_YARA_MATCH', 'FILE_VT_MALICIOUS'],
    conditionalSummary:
      'This analysis does not establish that the file ran or that the device is compromised. The following applies only if malicious execution or compromise is suspected.',
    reportedSummary:
      'The supplied context indicates suspected execution or compromise. Follow company containment procedures and contact IT/security immediately.',
    actions: ['DEVICE_STOP', 'DEVICE_DISCONNECT', 'DEVICE_NO_POWEROFF', 'RECORD_EVENTS'],
  },
  credentials: {
    conditionalSummary:
      'If you already entered credentials, shared an OTP/MFA code, or approved an unexpected MFA prompt, contact IT/security immediately and follow these steps.',
    reportedSummary:
      'The supplied context indicates possible credential or MFA exposure. Contact IT/security immediately; do not submit the password or code.',
    actions: ['CONTACT_URGENTLY', 'PASSWORD_CHANGE', 'MFA_REVIEW', 'NO_OTP', 'NO_SECRET_SUBMISSION'],
  },
  contextFields: ['credentialsExposed', 'mfaCodeShared', 'unexpectedMfaApproved', 'suspectedExecution'],
  reportedExposure: {
    urgency: 'URGENT',
    escalation: 'URGENT',
    summary:
      'Reported credential or MFA exposure requires urgent attention even when the analyzer risk is lower. Stop interaction and contact IT/security immediately.',
  },
  reportedExecution: {
    urgency: 'IMMEDIATE',
    escalation: 'URGENT',
    summary:
      'Reported suspected execution or compromise requires immediate attention even when the analyzer risk is lower. Stop interaction and follow company containment procedures.',
  },
  urgencyOrder: ['ROUTINE', 'CAUTION', 'URGENT', 'IMMEDIATE'],
  unknownReasonText:
    'Some risk reasons are not covered by this guidance policy. Verify independently or contact IT/security.',
  disclaimer:
    "Guidance only. Check the separate incident receipt for recording status; the security team is alerted automatically when an incident is recorded. No automated remediation is performed. Use your organization's approved reporting channel and follow its procedures. Never submit passwords, MFA codes, or restricted evidence.",
  // Version 1.0 wording said administrator notifications were not enabled, which became false once incident
  // alerts shipped. Saved 1.0 guidance is shown with the corrected text for the same key instead.
  legacyTexts: {
    escalation: {
      RECOMMENDED:
        'Contact IT/security through the approved reporting channel. Administrator notifications are not enabled.',
      URGENT:
        'Contact IT/security urgently through the approved reporting channel. Administrator notifications are not enabled.',
    },
    disclaimer:
      "Guidance only. Check the separate incident receipt for recording status. Administrator notifications and automated remediation are not enabled. Use your organization's approved reporting channel and follow its procedures. Never submit passwords, MFA codes, or restricted evidence.",
  },
});
