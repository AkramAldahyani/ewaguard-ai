export const EMAIL_LIMITS = Object.freeze({
  bodyBytes: 24 * 1024,
  headerBytes: 8 * 1024,
  emlBytes: 1024 * 1024,
  decodedBodyBytes: 2 * 1024 * 1024,
  headerCount: 100,
  // Exported messages carry relay, ARC and provider headers that routinely exceed what people paste by hand.
  emlHeaderBytes: 64 * 1024,
  emlHeaderCount: 1000,
  mimeParts: 100,
  attachments: 20,
  urls: 50,
  urlCandidates: 200,
  urlLength: 2048,
});

const ERRORS = Object.freeze({
  INVALID_EMAIL_INPUT: 'Provide one supported email input mode with the required fields.',
  EMAIL_INPUT_TOO_LARGE: 'The email exceeds the supported size or complexity limit.',
  MALFORMED_EMAIL: 'The message is not a supported email. Check its headers and message structure.',
  EMPTY_EMAIL: 'The email must contain message text or an attachment.',
  EMAIL_PARSE_FAILED: 'The email could not be parsed. Try a plain-text copy of the message.',
});

export class EmailAnalysisError extends Error {
  constructor(code) {
    super(ERRORS[code]);
    this.name = 'EmailAnalysisError';
    this.code = code;
  }
}

export const EMAIL_LIMITATIONS = Object.freeze([
  'This is analyzer evidence and a provisional finding, not final risk-engine severity or proof of phishing.',
  'Supplied headers are untrusted claims. SPF, DKIM, DMARC and ARC are not independently verified.',
  'No URLs are visited; no DNS, reputation, threat-intelligence or AI service is contacted.',
  'Attachments are identified but not malware-scanned by the email analyzer. Archives and embedded messages are not opened.',
  'Pattern checks can miss attacks or flag legitimate messages. No strong indicators does not mean safe.',
  'Display metadata is minimized and obvious secrets are redacted. Pattern redaction cannot detect every secret.',
]);
