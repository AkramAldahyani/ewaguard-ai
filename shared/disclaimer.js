export const DISCLAIMER_DEFINITION = Object.freeze({
  version: '1.0',
  title: 'Sensitive Information Notice',
  summary:
    'Before continuing, do not submit confidential, restricted, credential-related, or otherwise sensitive information through EWAGuard AI.',
  restrictedGuidance:
    'If the material contains sensitive or restricted EWA information, use the organization’s approved cybersecurity reporting channel instead.',
  confirmation: 'I understand and confirm that the content I am submitting is appropriate for this channel.',
  prohibitedItems: Object.freeze([
    'Passwords or usernames together with passwords',
    'Authentication codes, API keys, private keys, or other secrets',
    'Confidential or restricted company information',
    'Sensitive customer or personal information',
    'Credential-bearing screenshots or material prohibited by company policy',
  ]),
});

export const DISCLAIMER_CONTEXTS = Object.freeze([
  'EMAIL_ANALYSIS',
  'URL_ANALYSIS',
  'FILE_ANALYSIS',
  'CHAT',
  'COMMUNITY_POST',
  'COMMUNITY_ATTACHMENT',
]);

export function isDisclaimerContext(value) {
  return typeof value === 'string' && DISCLAIMER_CONTEXTS.includes(value);
}
