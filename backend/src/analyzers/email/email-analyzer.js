import { parseEmailInput } from './email-parser.js';
import { senderEvidence, authenticationEvidence, bodyEvidence, attachmentEvidence } from './email-evidence.js';
import { redactEmailMetadata } from './email-privacy.js';
import { EMAIL_LIMITATIONS } from './email-policy.js';
import { brandDomainEvidence } from '../domain-indicators.js';

// Weights are analyzer-local evidence strength, never final risk scores.
const RULES = {
  SENDER_MISSING: ['sender', 0, 'Sender domain unavailable'],
  SENDER_FORMAT: ['sender', 1, 'Unusual or malformed From formatting'],
  REPLY_FORMAT: ['sender', 1, 'Unusual or malformed Reply-To formatting'],
  REPLY_DOMAIN_MISMATCH: ['sender', 2, 'Sender and Reply-To domains differ'],
  REPLY_ADDRESS_MISMATCH: ['sender', 1, 'Sender and Reply-To addresses differ'],
  INTERNATIONAL_DOMAIN: ['sender', 1, 'Internationalized sender or Reply-To domain'],
  SENDER_SUBDOMAINS: ['sender', 1, 'Many sender-domain labels'],
  DISPLAY_NAME_CLAIM: ['sender', 1, 'Display name claims a familiar brand or authority; identity is unverified'],
  DISPLAY_ADDRESS_MISMATCH: ['sender', 2, 'Display-name address differs from actual sender'],
  BRAND_IMPERSONATION: ['sender', 1, 'A familiar brand is claimed outside its common sender domains; identity is unverified'],
  SENDER_LOOKALIKE: ['sender', 3, 'Sender domain resembles the claimed brand outside its common domains'],
  AUTHENTICATION_CONCERN: ['authentication', 2, 'Supplied authentication headers claim failure or an error'],
  AUTHENTICATION_CONFLICT: ['authentication', 1, 'Supplied authentication claims conflict'],
  URL_LIMIT: ['coverage', 0, 'URL extraction was limited; some destinations were not assessed'],
  URL_UNPARSEABLE: ['url', 0, 'A link could not be parsed as an absolute URL'],
  URL_SCHEME: ['url', 2, 'A link uses an unsupported scheme'],
  URL_CREDENTIALS: ['url', 2, 'A link contains embedded credentials'],
  URL_IP: ['url', 1, 'A link uses an IP address instead of a domain'],
  URL_INTERNATIONAL: ['url', 1, 'A link uses an internationalized domain'],
  URL_SUBDOMAINS: ['url', 1, 'A link has many hostname labels'],
  URL_HTTP: ['url', 1, 'A link uses unencrypted HTTP'],
  URL_SHORTENER: ['url', 1, 'A shortened URL hides its eventual destination'],
  URL_LABEL_MISMATCH: ['url', 3, 'Displayed URL hostname differs from the link destination'],
  ATTACHMENT_EXECUTABLE: ['attachment', 3, 'Attachment metadata suggests executable or script content'],
  ATTACHMENT_MACRO: ['attachment', 2, 'Attachment extension supports macros'],
  ATTACHMENT_ARCHIVE: ['attachment', 1, 'Archive or disk-image contents are not inspected'],
  ATTACHMENT_DOUBLE_EXTENSION: ['attachment', 2, 'Attachment has a potentially misleading double extension'],
  ATTACHMENT_NAME_DIRECTION: ['attachment', 2, 'Attachment name contains text-direction controls'],
  URGENCY: ['content', 1, 'Urgent action or account-threat language'],
  PASSWORD_RESET: ['content', 1, 'Password reset request'],
  CREDENTIAL_REQUEST: ['content', 3, 'Request to provide credentials'],
  LOGIN_REQUEST: ['content', 1, 'Request to sign in or log in'],
  PAYMENT_REQUEST: ['financial', 2, 'Payment, invoice pressure or wire-transfer request'],
  GIFT_CARD: ['financial', 2, 'Gift-card request'],
  MFA_REQUEST: ['content', 3, 'Request to share an authentication code'],
  BYPASS_PROCESS: ['process', 2, 'Request to bypass approval or verification'],
  ATTACHMENT_INVITATION: ['content', 1, 'Invitation to open an attachment or enable macros'],
};

const PATTERNS = [
  ['URGENCY', /\b(?:urgent|immediately|act now|as soon as possible|within \d+ hours?|account (?:will be |is )?(?:suspended|closed|locked))\b/i],
  ['PASSWORD_RESET', /\b(?:reset (?:your |the )?password|password reset|password expir(?:es|ed|ing))\b/i],
  ['CREDENTIAL_REQUEST', /\b(?:send|share|enter|provide|confirm|verify)\b[^.!?\n]{0,65}\b(?:password|credentials)\b/i],
  ['LOGIN_REQUEST', /\b(?:log ?in|sign ?in)\b/i],
  ['PAYMENT_REQUEST', /\b(?:wire transfer|transfer (?:the )?(?:funds|money)|pay (?:this |the |your )?invoice|payment (?:due|overdue|required)|send (?:payment|money))\b/i],
  ['PAYMENT_REQUEST', /\b(?:dispute|cancel|reverse|refund)\b[^.!?\n]{0,80}\b(?:payment|transaction|charge|purchase)\b|\b(?:payment|transaction|charge|purchase)\b[^.!?\n]{0,80}\b(?:dispute|cancel|reverse|refund)\b/i],
  ['GIFT_CARD', /\b(?:buy|purchase|send)\b[^.!?\n]{0,60}\bgift[ -]?cards?\b/i],
  ['MFA_REQUEST', /\b(?:send|share|provide|enter)\b[^.!?\n]{0,65}\b(?:MFA|OTP|verification code|authentication code|one.time (?:code|password))\b/i],
  ['BYPASS_PROCESS', /\b(?:bypass|skip|ignore)\b[^.!?\n]{0,60}\b(?:approval|verification|procedure|security|process)\b/i],
  ['ATTACHMENT_INVITATION', /\b(?:open (?:the |this )?attachment|enable (?:macros|content))\b/i],
];

export function classifyEmailIndicators(indicators) {
  const meaningful = indicators.filter(({ severityWeight }) => severityWeight > 0);
  const total = meaningful.reduce((sum, { severityWeight }) => sum + severityWeight, 0);
  const categories = new Set(meaningful.map(({ category }) => category));
  if (total >= 7 && categories.size >= 2) return 'HIGHLY_SUSPICIOUS';
  if (meaningful.some(({ severityWeight }) => severityWeight >= 2) || total >= 3) return 'SUSPICIOUS';
  return 'NO_STRONG_INDICATORS';
}

export async function analyzeEmail(input) {
  const { mail, text, html, inputType } = await parseEmailInput(input);
  const found = new Map();
  const add = (id) => {
    const [category, severityWeight, title] = RULES[id];
    found.set(id, { id, category, severityWeight, title, evidence: 'Observed by a local heuristic; not independently verified.' });
  };
  const sender = senderEvidence(mail, add);
  const authentication = authenticationEvidence(mail, add);
  const body = bodyEvidence(text, html, add);
  const attachments = attachmentEvidence(mail.attachments, add);
  const content = `${mail.subject ?? ''}\n${body.text}`;
  const brand = brandDomainEvidence(sender.sender.domain, `${mail.from?.value?.[0]?.name ?? ''}\n${content}`);
  if (brand.brandClaim) add('BRAND_IMPERSONATION');
  if (brand.lookalike) add('SENDER_LOOKALIKE');
  for (const [id, pattern] of PATTERNS) if (pattern.test(content)) add(id);
  const indicators = [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    analyzer: 'EMAIL', analyzerVersion: '6A1.2', inputType,
    ...sender, subject: redactEmailMetadata(mail.subject),
    // Recipient addresses and Message-ID are unnecessary for threat evidence.
    recipientCounts: { to: mail.to?.value?.length ?? 0, cc: mail.cc?.value?.length ?? 0 },
    messageIdPresent: Boolean(mail.messageId),
    authentication, urls: body.urls, attachments, indicators,
    evidenceSummary: { indicatorCount: indicators.length, urlOriginCount: body.urls.length, attachmentCount: attachments.length },
    provisionalClassification: classifyEmailIndicators(indicators),
    recommendedActions: [
      'Verify unexpected requests with the sender through a trusted channel.',
      'Do not provide passwords or authentication codes in response to an email.',
      ...(body.urls.length ? ['Avoid opening unexpected links until the destination is verified.'] : []),
      ...(attachments.length ? ['Do not open unexpected attachments; use the approved security reporting process.'] : []),
      'Report suspected phishing through your organization’s approved security process.',
    ],
    limitations: [...EMAIL_LIMITATIONS],
  };
}
