import { riskSnapshot } from '../../risk/risk-persistence.js';

// Best-effort display redaction, not a DLP guarantee. Persistent evidence uses
// a stricter allow-list and excludes ALL sender names, subject and URL strings.
export function redactEmailMetadata(value, maximum = 180) {
  return (
    String(value ?? '')
      .replace(
        /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/gi,
        '[REDACTED PRIVATE KEY]',
      )
      .replace(
        /\b(?:password|passwd|pwd|api[_ -]?key|access[_ -]?token|secret|authorization|otp|verification code)\s*[:=]\s*[^\r\n]+/gi,
        '[REDACTED CREDENTIAL]',
      )
      .replace(/\bBearer\s+\S+/gi, '[REDACTED TOKEN]')
      .replace(/\b(?:sk-[A-Za-z0-9_-]+|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9_]+)\b/g, '[REDACTED KEY]')
      .replace(/[A-Za-z0-9_+/=-]{32,}/g, '[REDACTED LONG VALUE]')
      // Intentionally remove control bytes and bidirectional formatting from display text.
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ')
      .slice(0, maximum)
  );
}

export function displayAddress(address) {
  const domain = String(address ?? '')
    .split('@')
    .at(-1);
  return domain && address.includes('@')
    ? `[local part omitted]@${redactEmailMetadata(domain.toLowerCase(), 253)}`
    : 'Unavailable or malformed';
}

// Only fixed states, rules and numeric counts may cross the persistence boundary.
// Use the analyzer-produced result; no submitted free text is serialized here.
export function minimizeEmailEvidence(result) {
  return {
    analyzer: 'EMAIL',
    analyzerVersion: result.analyzerVersion,
    inputType: result.inputType,
    provisionalClassification: result.provisionalClassification,
    indicatorIds: result.indicators.map(({ id }) => id),
    authentication: Object.fromEntries(
      ['spf', 'dkim', 'dmarc'].map((method) => [
        method,
        {
          status: result.authentication[method].status,
          claimedResults: result.authentication[method].claimedResults,
          verified: false,
        },
      ]),
    ),
    signaturePresent: result.authentication.signaturePresent,
    arcPresent: result.authentication.arcPresent,
    counts: result.evidenceSummary,
    attachmentTypes: result.attachments.map(({ category, size }) => ({ category, size, scanStatus: 'NOT_SCANNED' })),
    ...(result.risk ? { risk: riskSnapshot(result.risk) } : {}),
  };
}
