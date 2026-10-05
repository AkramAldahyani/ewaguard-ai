import { simpleParser } from 'mailparser';
import { EMAIL_LIMITS as LIMITS, EmailAnalysisError } from './email-policy.js';

const options = Object.freeze({
  skipHtmlToText: true, skipTextToHtml: true, skipTextLinks: true,
  skipImageLinks: true, keepCidLinks: true, keepDeliveryStatus: true,
});

function assertHeaders(headers) {
  if (Buffer.byteLength(headers) > LIMITS.headerBytes) throw new EmailAnalysisError('EMAIL_INPUT_TOO_LARGE');
  if (!headers) return;
  const lines = headers.split(/\r?\n/);
  if (lines.length > LIMITS.headerCount) throw new EmailAnalysisError('EMAIL_INPUT_TOO_LARGE');
  // Reject protocol control bytes while allowing tab and CRLF folding.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(headers) || /\r(?!\n)/.test(headers)) throw new EmailAnalysisError('MALFORMED_EMAIL');
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^[!-9;-~]+:/.test(lines[index]) && !(index > 0 && /^[ \t]+\S/.test(lines[index]))) {
      throw new EmailAnalysisError('MALFORMED_EMAIL');
    }
  }
}

// No raw input or MailParser object escapes this internal parser into storage.
// Pasted body is deliberately separate from headers: supplied MIME headers must
// never cause ordinary pasted text to be decoded as base64 or as a MIME message.
export async function parseEmailInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EmailAnalysisError('INVALID_EMAIL_INPUT');
  const pasted = input.inputType === 'PASTED';
  if (!pasted && input.inputType !== 'EML') throw new EmailAnalysisError('INVALID_EMAIL_INPUT');
  const allowed = pasted ? ['inputType', 'body', 'headers'] : ['inputType', 'eml'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new EmailAnalysisError('INVALID_EMAIL_INPUT');
  let source;
  if (pasted) {
    if (typeof input.body !== 'string' || (input.headers !== undefined && typeof input.headers !== 'string')) throw new EmailAnalysisError('INVALID_EMAIL_INPUT');
    if (Buffer.byteLength(input.body) > LIMITS.bodyBytes) throw new EmailAnalysisError('EMAIL_INPUT_TOO_LARGE');
    if (!input.body.trim()) throw new EmailAnalysisError('EMPTY_EMAIL');
    const headers = (input.headers ?? '').replace(/(?:\r?\n)+$/, '');
    assertHeaders(headers);
    source = Buffer.from(`${headers}\r\n\r\n`);
  } else {
    if (!Buffer.isBuffer(input.eml)) throw new EmailAnalysisError('INVALID_EMAIL_INPUT');
    if (input.eml.length > LIMITS.emlBytes) throw new EmailAnalysisError('EMAIL_INPUT_TOO_LARGE');
    if (!input.eml.length) throw new EmailAnalysisError('EMPTY_EMAIL');
    // Only bounded RFC822-shaped input reaches the MIME parser. These checks
    // intentionally reject a subset of damaged messages MailParser tolerates.
    const raw = input.eml.toString('latin1');
    const separator = /\r?\n\r?\n/.exec(raw);
    if (!separator) throw new EmailAnalysisError('MALFORMED_EMAIL');
    const headers = raw.slice(0, separator.index);
    assertHeaders(headers);
    if (!/^(?:from|subject|date|message-id):/im.test(headers)) throw new EmailAnalysisError('MALFORMED_EMAIL');
    if ((raw.match(/^content-type:/gim) ?? []).length > LIMITS.mimeParts || (raw.match(/^--[^\r\n]+/gm) ?? []).length > LIMITS.mimeParts * 2) {
      throw new EmailAnalysisError('EMAIL_INPUT_TOO_LARGE');
    }
    // Detect truncated multipart envelopes before a lenient parse can hide it.
    const boundaryHeaders = raw.match(/^content-type:[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/gim) ?? [];
    for (const header of boundaryHeaders) {
      if (!/content-type:\s*multipart\//i.test(header)) continue;
      const boundary = /\bboundary\s*=\s*(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(header.replace(/\r?\n[ \t]+/g, ' '));
      const value = boundary?.[1] ?? boundary?.[2];
      if (!value || value.length > 70 || !raw.split(/\r?\n/).some((line) => line.trimEnd() === `--${value}--`)) throw new EmailAnalysisError('MALFORMED_EMAIL');
    }
    source = input.eml;
  }
  let mail;
  try { mail = await simpleParser(source, options); }
  catch { throw new EmailAnalysisError('EMAIL_PARSE_FAILED'); }
  const text = pasted ? input.body : (mail.text ?? '');
  const html = pasted ? input.body : (typeof mail.html === 'string' ? mail.html : '');
  if (Buffer.byteLength(text) + Buffer.byteLength(html) > LIMITS.decodedBodyBytes || mail.attachments.length > LIMITS.attachments) {
    throw new EmailAnalysisError('EMAIL_INPUT_TOO_LARGE');
  }
  if (!text.trim() && !html.trim() && !mail.attachments.length) throw new EmailAnalysisError('EMPTY_EMAIL');
  return { mail, text, html, inputType: input.inputType };
}
