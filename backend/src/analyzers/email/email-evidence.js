import { Parser } from 'htmlparser2';
import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';
import { EMAIL_LIMITS as LIMITS } from './email-policy.js';
import { displayAddress, redactEmailMetadata as redact } from './email-privacy.js';
import { normalizeDomain, isShortener } from '../domain-indicators.js';

export function senderEvidence(mail, add) {
  const from = mail.from?.value ?? [];
  const reply = mail.replyTo?.value ?? [];
  const sender = from[0] ?? {};
  const replyTo = reply[0] ?? {};
  const address = String(sender.address ?? '');
  const replyAddress = String(replyTo.address ?? '');
  const domain = normalizeDomain(address.split('@')[1]);
  const replyDomain = normalizeDomain(replyAddress.split('@')[1]);
  const returnValue = mail.headers.get('return-path');
  const returnEntries = Array.isArray(returnValue) ? returnValue : [returnValue];
  const returnAddresses = returnEntries.flatMap((entry) => entry?.value ?? []);
  const returnAddress = String(returnAddresses[0]?.address ?? '');
  const returnDomain = normalizeDomain(returnAddress.split('@')[1]);
  if (!domain) add('SENDER_MISSING');
  if (
    from.length > 1 ||
    (mail.headerLines ?? []).filter(({ key }) => key === 'from').length > 1 ||
    ((mail.headers.has('from') || address) &&
      (!domainToASCII(domain) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)))
  )
    add('SENDER_FORMAT');
  if (reply.length > 1 || (replyAddress && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(replyAddress))) add('REPLY_FORMAT');
  if (domain && replyDomain && domainToASCII(domain) !== domainToASCII(replyDomain)) add('REPLY_DOMAIN_MISMATCH');
  else if (address && replyAddress && address.toLowerCase() !== replyAddress.toLowerCase())
    add('REPLY_ADDRESS_MISMATCH');
  if (/[\u0080-\uffff]/.test(domain + replyDomain) || /xn--/i.test(domain + replyDomain)) add('INTERNATIONAL_DOMAIN');
  if ([domain, replyDomain].some((value) => value.split('.').length > 5)) add('SENDER_SUBDOMAINS');
  const name = String(sender.name ?? '');
  if (/\b(?:IT support|help\s?desk|security team|Microsoft|administrator|payroll|CEO)\b/i.test(name))
    add('DISPLAY_NAME_CLAIM');
  const displayEmail = name.match(/[^\s<>]+@[^\s<>]+/);
  if (displayEmail && displayEmail[0].toLowerCase() !== address.toLowerCase()) add('DISPLAY_ADDRESS_MISMATCH');
  return {
    sender: {
      address: displayAddress(address),
      domain: domain ? redact(domain, 253) : null,
      displayName: redact(name),
      count: from.length,
    },
    replyTo: {
      address: replyAddress ? displayAddress(replyAddress) : null,
      domain: replyDomain ? redact(replyDomain, 253) : null,
      count: reply.length,
    },
    // Bounce domains often differ legitimately; a mismatch alone is not scored.
    returnPath: {
      address: returnAddress ? displayAddress(returnAddress) : null,
      domain: returnDomain ? redact(returnDomain, 253) : null,
      count: returnAddresses.length,
    },
  };
}

// Ignore comments and quoted strings before reading method=result clauses.
// Even genuine-looking Authentication-Results can be forged in submitted email.
function withoutComments(value) {
  let depth = 0,
    quoted = false,
    escaped = false,
    output = '';
  for (const char of value) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"' && !depth) {
      quoted = !quoted;
      output += ' ';
      continue;
    }
    if (quoted) continue;
    if (char === '(') {
      depth += 1;
      output += ' ';
      continue;
    }
    if (char === ')' && depth) {
      depth -= 1;
      continue;
    }
    if (!depth) output += char;
  }
  return output;
}

export function authenticationEvidence(mail, add) {
  const lines = mail.headerLines ?? [];
  const auth = lines
    .filter(({ key }) => key === 'authentication-results')
    .map(({ line }) => withoutComments(line.replace(/\r?\n[ \t]+/g, ' ')));
  const allowed = 'pass|fail|softfail|neutral|none|temperror|permerror';
  const evidence = {};
  for (const method of ['spf', 'dkim', 'dmarc']) {
    const claims = [];
    for (const line of auth) {
      for (const part of line.split(';').slice(1)) {
        const match = new RegExp(`^\\s*${method}(?:/\\d+)?\\s*=\\s*(${allowed})(?=\\s|$)`, 'i').exec(part);
        if (match) claims.push(match[1].toUpperCase());
      }
    }
    if (method === 'spf')
      for (const { line } of lines.filter(({ key }) => key === 'received-spf')) {
        const match = new RegExp(`^received-spf:\\s*(${allowed})(?=\\s|$|;)`, 'i').exec(withoutComments(line));
        if (match) claims.push(match[1].toUpperCase());
      }
    const results = [...new Set(claims)].sort();
    evidence[method] = {
      status: results.length > 1 ? 'CONFLICTING_CLAIMS' : results.length ? 'HEADER_CLAIM' : 'UNAVAILABLE',
      claimedResults: results,
      verified: false,
    };
    if (results.some((value) => ['FAIL', 'SOFTFAIL', 'PERMERROR', 'TEMPERROR'].includes(value)))
      add('AUTHENTICATION_CONCERN');
    if (results.length > 1) add('AUTHENTICATION_CONFLICT');
  }
  evidence.signaturePresent = lines.some(({ key }) => key === 'dkim-signature');
  evidence.arcPresent = lines.some(({ key }) => key.startsWith('arc-'));
  return evidence;
}

export function bodyEvidence(text, html, add) {
  const candidates = [];
  let candidateCount = 0,
    htmlText = '',
    ignoreDepth = 0;
  let link = null;
  const addCandidate = (value, label = '') => {
    candidateCount += 1;
    if (candidateCount <= LIMITS.urlCandidates) candidates.push({ value, label });
  };
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (['script', 'style'].includes(name)) ignoreDepth += 1;
        if (name === 'a') link = { value: attrs.href ?? '', label: '' };
        htmlText += ' ';
      },
      ontext(value) {
        if (!ignoreDepth) {
          htmlText += value;
          if (link) link.label += value;
        }
      },
      onclosetag(name) {
        if (['script', 'style'].includes(name) && ignoreDepth) ignoreDepth -= 1;
        if (name === 'a' && link) {
          addCandidate(link.value, link.label);
          link = null;
        }
        htmlText += ' ';
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  if (link) addCandidate(link.value, link.label);
  const combined = `${text}\n${htmlText}`;
  for (const match of combined.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi)) {
    addCandidate(match[0].replace(/[.,;!?)\]]+$/, ''));
    if (candidateCount > LIMITS.urlCandidates) break;
  }
  const urls = [],
    seen = new Set();
  for (const { value, label } of candidates) {
    if (!value || value.startsWith('#') || /^(?:mailto|cid):/i.test(value)) continue;
    if (value.length > LIMITS.urlLength) {
      add('URL_LIMIT');
      continue;
    }
    let url;
    try {
      url = new URL(/^www\./i.test(value) ? `https://${value}` : value);
    } catch {
      add('URL_UNPARSEABLE');
      continue;
    }
    if (!['https:', 'http:'].includes(url.protocol)) {
      add('URL_SCHEME');
      continue;
    }
    if (url.username || url.password) add('URL_CREDENTIALS');
    if (isIP(url.hostname.replace(/^\[|\]$/g, ''))) add('URL_IP');
    if (/xn--/.test(url.hostname)) add('URL_INTERNATIONAL');
    if (url.hostname.split('.').length > 5) add('URL_SUBDOMAINS');
    if (url.protocol === 'http:') add('URL_HTTP');
    if (isShortener(url.hostname)) add('URL_SHORTENER');
    try {
      const displayed = new URL(/^www\./i.test(label.trim()) ? `https://${label.trim()}` : label.trim());
      if (['https:', 'http:'].includes(displayed.protocol) && displayed.hostname !== url.hostname)
        add('URL_LABEL_MISMATCH');
    } catch {
      /* Ordinary link text is not a claimed destination. */
    }
    // Canonical origin only. Never return credentials, paths, queries or fragments.
    const origin = redact(url.origin, 300);
    if (seen.has(origin)) continue;
    seen.add(origin);
    if (urls.length >= LIMITS.urls) {
      add('URL_LIMIT');
      continue;
    }
    urls.push({ origin, detailsOmitted: true, networkStatus: 'NOT_CHECKED' });
  }
  if (candidateCount > LIMITS.urlCandidates) add('URL_LIMIT');
  return { text: combined, urls };
}

export function attachmentEvidence(attachments, add) {
  return attachments.map((attachment, index) => {
    const filename = String(attachment.filename ?? '');
    const extension = filename.split('.').at(-1)?.toLowerCase() ?? '';
    const dangerous = /^(exe|com|scr|msi|dll|bat|cmd|ps1|vbs|vbe|js|jse|wsf|hta|sh|lnk)$/;
    let category = 'OTHER';
    if (dangerous.test(extension)) {
      category = 'EXECUTABLE_OR_SCRIPT';
      add('ATTACHMENT_EXECUTABLE');
    } else if (/^(docm|xlsm|pptm|dotm|xlam|xlsb)$/.test(extension)) {
      category = 'MACRO_CAPABLE';
      add('ATTACHMENT_MACRO');
    } else if (/^(zip|rar|7z|iso|img|gz|tar)$/.test(extension)) {
      category = 'ARCHIVE_OR_DISK_IMAGE';
      add('ATTACHMENT_ARCHIVE');
    }
    if (/\.(?:pdf|docx?|xlsx?|txt|jpe?g|png)\.[^.]+$/i.test(filename)) add('ATTACHMENT_DOUBLE_EXTENSION');
    if (/application\/(?:x-msdownload|x-dosexec|x-executable)|(?:java|ecma)script/i.test(attachment.contentType ?? ''))
      add('ATTACHMENT_EXECUTABLE');
    if (/[\u202a-\u202e\u2066-\u2069]/.test(filename)) add('ATTACHMENT_NAME_DIRECTION');
    return {
      index: index + 1,
      filename: redact(filename) || '(unnamed)',
      contentType: redact(attachment.contentType, 100),
      extension: /^[a-z0-9]{1,10}$/.test(extension) ? extension : null,
      size: attachment.size,
      category,
      scanStatus: 'NOT_SCANNED',
    };
  });
}
