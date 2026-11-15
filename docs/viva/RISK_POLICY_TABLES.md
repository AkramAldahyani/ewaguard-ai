# Exact risk policy mapping tables

Extracted from `backend/src/risk/risk-policy.js` on 14 November 2026. Policy version 1.1. These are source-derived configuration facts, not empirical detection probabilities. The full algorithm, deduplication, category caps and critical gate are explained in [the technical report](EWAGUARD_FULL_TECHNICAL_REPORT.md).

## EMAIL

| Analyzer indicator ID | Risk reason code | Category | Weight |
|---|---|---|---:|
| SENDER_FORMAT | EMAIL_SENDER_FORMAT | identity | 4 |
| REPLY_FORMAT | EMAIL_SENDER_FORMAT | identity | 4 |
| REPLY_DOMAIN_MISMATCH | EMAIL_REPLY_TO_MISMATCH | identity | 18 |
| REPLY_ADDRESS_MISMATCH | EMAIL_REPLY_TO_MISMATCH | identity | 10 |
| INTERNATIONAL_DOMAIN | EMAIL_INTERNATIONAL_DOMAIN | identity | 4 |
| SENDER_SUBDOMAINS | EMAIL_SENDER_STRUCTURE | identity | 4 |
| DISPLAY_NAME_CLAIM | EMAIL_DISPLAY_NAME_CLAIM | identity | 4 |
| DISPLAY_ADDRESS_MISMATCH | EMAIL_DISPLAY_ADDRESS_MISMATCH | identity | 18 |
| BRAND_IMPERSONATION | EMAIL_DISPLAY_NAME_CLAIM | identity | 4 |
| SENDER_LOOKALIKE | EMAIL_SENDER_LOOKALIKE | identity | 25 |
| AUTHENTICATION_CONCERN | EMAIL_AUTH_FAILURE | authentication | 15 |
| URL_SCHEME | EMAIL_SUSPICIOUS_LINK | emailUrl | 12 |
| URL_CREDENTIALS | EMAIL_LINK_CREDENTIALS | emailUrl | 12 |
| URL_IP | EMAIL_LINK_STRUCTURE | emailUrl | 5 |
| URL_INTERNATIONAL | EMAIL_LINK_STRUCTURE | emailUrl | 5 |
| URL_SUBDOMAINS | EMAIL_LINK_STRUCTURE | emailUrl | 5 |
| URL_HTTP | EMAIL_HTTP_LINK | emailUrl | 3 |
| URL_LABEL_MISMATCH | EMAIL_LINK_DESTINATION_MISMATCH | emailUrl | 20 |
| URL_SHORTENER | EMAIL_URL_SHORTENER | emailUrl | 8 |
| ATTACHMENT_EXECUTABLE | EMAIL_SUSPICIOUS_ATTACHMENT | attachment | 25 |
| ATTACHMENT_MACRO | EMAIL_SUSPICIOUS_ATTACHMENT | attachment | 18 |
| ATTACHMENT_ARCHIVE | EMAIL_ARCHIVE_ATTACHMENT | attachment | 5 |
| ATTACHMENT_DOUBLE_EXTENSION | EMAIL_ATTACHMENT_DISGUISE | attachment | 15 |
| ATTACHMENT_NAME_DIRECTION | EMAIL_ATTACHMENT_DISGUISE | attachment | 15 |
| URGENCY | EMAIL_URGENCY | content | 4 |
| PASSWORD_RESET | EMAIL_LOGIN_REQUEST | content | 4 |
| CREDENTIAL_REQUEST | EMAIL_CREDENTIAL_REQUEST | content | 25 |
| LOGIN_REQUEST | EMAIL_LOGIN_REQUEST | content | 4 |
| MFA_REQUEST | EMAIL_MFA_REQUEST | content | 30 |
| ATTACHMENT_INVITATION | EMAIL_ATTACHMENT_INVITATION | content | 4 |
| PAYMENT_REQUEST | EMAIL_PAYMENT_PRESSURE | financial | 15 |
| GIFT_CARD | EMAIL_PAYMENT_PRESSURE | financial | 15 |
| BYPASS_PROCESS | EMAIL_PROCESS_BYPASS | process | 15 |

## URL

| Analyzer indicator ID | Risk reason code | Category | Weight |
|---|---|---|---:|
| IP_HOST | URL_IP_HOST | structure | 10 |
| LONG_HOSTNAME | URL_OBSCURED_STRUCTURE | structure | 3 |
| LONG_URL | URL_OBSCURED_STRUCTURE | structure | 3 |
| MANY_SUBDOMAINS | URL_OBSCURED_STRUCTURE | structure | 5 |
| MANY_HYPHENS | URL_OBSCURED_STRUCTURE | structure | 3 |
| AT_CHARACTER | URL_OBSCURED_STRUCTURE | structure | 5 |
| ENCODING | URL_OBSCURED_STRUCTURE | structure | 8 |
| IDN | URL_INTERNATIONAL_DOMAIN | structure | 10 |
| MIXED_SCRIPT | URL_INTERNATIONAL_DOMAIN | structure | 18 |
| TLD_PATTERN | URL_TLD_PATTERN | structure | 3 |
| HOST_TERMS | URL_ACCOUNT_TERMS | structure | 5 |
| ACCOUNT_PATH | URL_ACCOUNT_PATH | structure | 15 |
| MANY_PARAMETERS | URL_OBSCURED_STRUCTURE | structure | 3 |
| SHORTENER | URL_SHORTENER | structure | 8 |
| BRAND_PATTERN | URL_BRAND_PATTERN | structure | 18 |
| UNUSUAL_PORT | URL_UNUSUAL_PORT | structure | 5 |
| HTTP | URL_HTTP | structure | 4 |

## FILE

| Analyzer indicator ID | Risk reason code | Category | Weight |
|---|---|---|---:|
| TYPE_MISMATCH | FILE_TYPE_MISMATCH | structure | 18 |
| MIME_MISMATCH | FILE_MIME_MISMATCH | structure | 4 |
| DOUBLE_EXTENSION | FILE_DOUBLE_EXTENSION | structure | 12 |
| FILENAME_PATTERN | FILE_FILENAME_PATTERN | structure | 4 |
| ACTIVE_CONTENT | FILE_ACTIVE_CONTENT | structure | 10 |
| ARCHIVE_PATH | FILE_ARCHIVE_PATH | structure | 12 |
| ARCHIVE_EXECUTABLE | FILE_ACTIVE_CONTENT | structure | 10 |
| MACRO_ENTRY | FILE_MACRO_CONTENT | structure | 18 |

## Non-indicator weights and gates

| Policy | Value |
|---|---|
| thresholds.MEDIUM | 25 |
| thresholds.HIGH | 50 |
| thresholds.CRITICAL | 75 |
| caps.identity | 25 |
| caps.content | 35 |
| caps.authentication | 15 |
| caps.attachment | 25 |
| caps.emailUrl | 25 |
| caps.financial | 20 |
| caps.process | 15 |
| caps.structure | 40 |
| caps.tls | 8 |
| emailCombination.contribution | 8 |
| emailCombination.minimumGroups | 2 |
| critical.strongSources | 2 |
| critical.structuralContribution | 25 |
| critical.structuralGroups | 2 |
| confidence.highSources | 3 |
| confidence.moderateSources | 1 |
| reputation.consensusCount | 5 |
| reputation.consensusRatio | 0.1 |
| reputation.minimumTotal | 10 |
| reputation.moderateCount | 2 |
| reputation.strongWeight | 60 |
| reputation.moderateWeight | 30 |
| reputation.weakWeight | 12 |
| reputation.suspiciousWeight | 8 |
| reputation.staleDays | 30 |
| weights.clamav | 60 |
| weights.yaraStrong | 50 |
| weights.yaraWarning | 25 |
| weights.tls | 8 |
| limits.indicators | 128 |
| limits.reports | 4 |
| limits.matches | 64 |
| limits.providerCount | 10000 |

Maximum final score: 100. Missing explicit category caps default to that maximum. Multiple indicator IDs sharing a reason code retain only the largest weight. Reported contributions can exceed the final score because a final critical-eligibility cap is applied after summing.
