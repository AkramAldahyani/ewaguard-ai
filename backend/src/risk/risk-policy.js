// Version every scoring/coverage change. Weights express policy, not probabilities.
export const RISK_ENGINE_VERSION = '1.0';

function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

export const RISK_POLICY = freeze({
  thresholds: { MEDIUM: 25, HIGH: 50, CRITICAL: 75 },
  maximum: 100,
  limits: { indicators: 128, reports: 4, matches: 64, providerCount: 10000 },
  caps: { identity: 25, content: 35, authentication: 15, attachment: 25, emailUrl: 25, financial: 20, process: 15, structure: 40, tls: 8 },
  emailCombination: { contribution: 8, minimumGroups: 2 },
  critical: { strongSources: 2, structuralContribution: 25, structuralGroups: 2 },
  confidence: { highSources: 3, moderateSources: 1 },
  reputation: { consensusCount: 5, consensusRatio: 0.1, minimumTotal: 10, moderateCount: 2,
    strongWeight: 60, moderateWeight: 30, weakWeight: 12, suspiciousWeight: 8, staleDays: 30 },
  weights: { clamav: 60, yaraStrong: 50, yaraWarning: 25, tls: 8 },
  // [reason code, group, weight]. Multiple IDs mapped to one reason count once.
  email: {
    SENDER_FORMAT: ['EMAIL_SENDER_FORMAT', 'identity', 4], REPLY_FORMAT: ['EMAIL_SENDER_FORMAT', 'identity', 4],
    REPLY_DOMAIN_MISMATCH: ['EMAIL_REPLY_TO_MISMATCH', 'identity', 18], REPLY_ADDRESS_MISMATCH: ['EMAIL_REPLY_TO_MISMATCH', 'identity', 10],
    INTERNATIONAL_DOMAIN: ['EMAIL_INTERNATIONAL_DOMAIN', 'identity', 4], SENDER_SUBDOMAINS: ['EMAIL_SENDER_STRUCTURE', 'identity', 4],
    DISPLAY_NAME_CLAIM: ['EMAIL_DISPLAY_NAME_CLAIM', 'identity', 4], DISPLAY_ADDRESS_MISMATCH: ['EMAIL_DISPLAY_ADDRESS_MISMATCH', 'identity', 18],
    AUTHENTICATION_CONCERN: ['EMAIL_AUTH_FAILURE', 'authentication', 15],
    URL_SCHEME: ['EMAIL_SUSPICIOUS_LINK', 'emailUrl', 12], URL_CREDENTIALS: ['EMAIL_LINK_CREDENTIALS', 'emailUrl', 12],
    URL_IP: ['EMAIL_LINK_STRUCTURE', 'emailUrl', 5], URL_INTERNATIONAL: ['EMAIL_LINK_STRUCTURE', 'emailUrl', 5],
    URL_SUBDOMAINS: ['EMAIL_LINK_STRUCTURE', 'emailUrl', 5], URL_HTTP: ['EMAIL_HTTP_LINK', 'emailUrl', 3],
    URL_LABEL_MISMATCH: ['EMAIL_LINK_DESTINATION_MISMATCH', 'emailUrl', 20],
    ATTACHMENT_EXECUTABLE: ['EMAIL_SUSPICIOUS_ATTACHMENT', 'attachment', 25], ATTACHMENT_MACRO: ['EMAIL_SUSPICIOUS_ATTACHMENT', 'attachment', 18],
    ATTACHMENT_ARCHIVE: ['EMAIL_ARCHIVE_ATTACHMENT', 'attachment', 5], ATTACHMENT_DOUBLE_EXTENSION: ['EMAIL_ATTACHMENT_DISGUISE', 'attachment', 15],
    ATTACHMENT_NAME_DIRECTION: ['EMAIL_ATTACHMENT_DISGUISE', 'attachment', 15],
    URGENCY: ['EMAIL_URGENCY', 'content', 4], PASSWORD_RESET: ['EMAIL_LOGIN_REQUEST', 'content', 4],
    CREDENTIAL_REQUEST: ['EMAIL_CREDENTIAL_REQUEST', 'content', 25], LOGIN_REQUEST: ['EMAIL_LOGIN_REQUEST', 'content', 4],
    MFA_REQUEST: ['EMAIL_MFA_REQUEST', 'content', 30], ATTACHMENT_INVITATION: ['EMAIL_ATTACHMENT_INVITATION', 'content', 4],
    PAYMENT_REQUEST: ['EMAIL_PAYMENT_PRESSURE', 'financial', 15], GIFT_CARD: ['EMAIL_PAYMENT_PRESSURE', 'financial', 15],
    BYPASS_PROCESS: ['EMAIL_PROCESS_BYPASS', 'process', 15],
  },
  url: {
    IP_HOST: ['URL_IP_HOST', 'structure', 10], LONG_HOSTNAME: ['URL_OBSCURED_STRUCTURE', 'structure', 3],
    LONG_URL: ['URL_OBSCURED_STRUCTURE', 'structure', 3], MANY_SUBDOMAINS: ['URL_OBSCURED_STRUCTURE', 'structure', 5],
    MANY_HYPHENS: ['URL_OBSCURED_STRUCTURE', 'structure', 3], AT_CHARACTER: ['URL_OBSCURED_STRUCTURE', 'structure', 5],
    ENCODING: ['URL_OBSCURED_STRUCTURE', 'structure', 8], IDN: ['URL_INTERNATIONAL_DOMAIN', 'structure', 10],
    MIXED_SCRIPT: ['URL_INTERNATIONAL_DOMAIN', 'structure', 18], TLD_PATTERN: ['URL_TLD_PATTERN', 'structure', 3],
    HOST_TERMS: ['URL_ACCOUNT_TERMS', 'structure', 5], ACCOUNT_PATH: ['URL_ACCOUNT_PATH', 'structure', 15],
    MANY_PARAMETERS: ['URL_OBSCURED_STRUCTURE', 'structure', 3], SHORTENER: ['URL_SHORTENER', 'structure', 8],
    BRAND_PATTERN: ['URL_BRAND_PATTERN', 'structure', 18], UNUSUAL_PORT: ['URL_UNUSUAL_PORT', 'structure', 5],
    HTTP: ['URL_HTTP', 'structure', 4],
  },
  file: {
    TYPE_MISMATCH: ['FILE_TYPE_MISMATCH', 'structure', 18], MIME_MISMATCH: ['FILE_MIME_MISMATCH', 'structure', 4],
    DOUBLE_EXTENSION: ['FILE_DOUBLE_EXTENSION', 'structure', 12], FILENAME_PATTERN: ['FILE_FILENAME_PATTERN', 'structure', 4],
    ACTIVE_CONTENT: ['FILE_ACTIVE_CONTENT', 'structure', 10], ARCHIVE_PATH: ['FILE_ARCHIVE_PATH', 'structure', 12],
    ARCHIVE_EXECUTABLE: ['FILE_ACTIVE_CONTENT', 'structure', 10], MACRO_ENTRY: ['FILE_MACRO_CONTENT', 'structure', 18],
  },
  recommendations: {
    LOW: ['Continue with normal caution; low risk does not guarantee safety.', 'Verify unexpected requests independently through a trusted channel.'],
    MEDIUM: ['Avoid interacting until the item has been verified.', 'Confirm the sender, website, or file source through a trusted channel.'],
    HIGH: ['Do not click, open, execute, or respond to the suspicious item.', 'Do not enter credentials or share authentication codes.', 'Contact IT/security through the approved reporting channel.'],
    CRITICAL: ['Stop interaction immediately. Do not open or execute the item further.', 'Contact IT/security urgently through the approved reporting channel.', 'If malicious execution is suspected, disconnect the affected device where company procedure permits and contact IT/security immediately.'],
  },
});

export function riskLevelForScore(score) {
  if (!Number.isInteger(score) || score < 0 || score > RISK_POLICY.maximum) throw new TypeError('Invalid risk score.');
  for (const level of ['CRITICAL', 'HIGH', 'MEDIUM']) if (score >= RISK_POLICY.thresholds[level]) return level;
  return 'LOW';
}
