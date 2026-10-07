import { isIP } from 'node:net';
import { domainToUnicode } from 'node:url';
import ipaddr from 'ipaddr.js';

export class UrlAnalysisError extends Error {
  constructor(code = 'INVALID_URL') {
    const messages = {
      INVALID_URL: 'Enter one valid HTTP or HTTPS URL without credentials (maximum 4096 characters).',
      URL_TARGET_BLOCKED: 'Private, internal, local, and reserved targets cannot be analyzed.',
    };
    super(messages[code]);
    this.code = code;
  }
}

const ipv4Denied = ['192.0.0.0/24', '192.88.99.0/24'].map(ipaddr.parseCIDR);
const ipv6Denied = ['2001::/23', '2002::/16', '3fff::/20'].map(ipaddr.parseCIDR);
export function isPublicAddress(value) {
  if (!isIP(value)) return false;
  const address = ipaddr.parse(value);
  // Fail closed for mapped, transition, documentation and special-use ranges.
  if (address.range() !== 'unicast') return false;
  if (address.kind() === 'ipv4') return !ipv4Denied.some((range) => address.match(range));
  return address.match(ipaddr.parseCIDR('2000::/3')) && !ipv6Denied.some((range) => address.match(range));
}

export function assertPublicHostname(hostname) {
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new UrlAnalysisError('URL_TARGET_BLOCKED');
    return;
  }
  if (!hostname.includes('.') || /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|example|onion|alt|arpa)$/.test(hostname) ||
      /(?:^|\.)(?:localhost|metadata|metadata\.google\.internal)(?:\.|$)/.test(hostname)) {
    throw new UrlAnalysisError('URL_TARGET_BLOCKED');
  }
}

const sensitiveName = /^(?:token|access_token|auth|apikey|api_key|key|session|code|password|secret|sig|signature)$/i;
const commonSuffixes = new Set(['co.uk', 'org.uk', 'com.au', 'co.jp', 'com.bh', 'gov.bh', 'org.bh', 'com.sa']);
export function normalizeUrl(input) {
  if (typeof input !== 'string' || input.length > 4096) throw new UrlAnalysisError();
  const raw = input.trim();
  // WHATWG repairs backslashes, missing slashes and embedded whitespace. Reject
  // those spellings before parsing instead of silently accepting the repaired URL.
  if (!raw || !/^https?:\/\/[^/?#]+(?:[/?#]|$)/i.test(raw) || /[\s\\\p{Cc}\p{Cf}]/u.test(raw) || /%(?![a-f\d]{2})/i.test(raw)) throw new UrlAnalysisError();
  const authority = raw.match(/^https?:\/\/([^/?#]+)/i)[1];
  if (authority.includes('@') || authority.includes('%')) throw new UrlAnalysisError();
  let url;
  try { url = new URL(raw); } catch { throw new UrlAnalysisError(); }
  if (url.username || url.password || !url.hostname) throw new UrlAnalysisError();
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  const isIpHost = Boolean(isIP(hostname));
  if (!isIpHost && (hostname.length > 253 || hostname.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) throw new UrlAnalysisError();
  assertPublicHostname(hostname);
  url.hostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
  const labels = hostname.split('.');
  const suffixLength = commonSuffixes.has(labels.slice(-2).join('.')) ? 2 : 1;
  const domainApproximation = isIpHost ? null : labels.slice(-(suffixLength + 1)).join('.');
  const unicode = domainToUnicode(hostname);
  // Evaluate each label independently: a Greek label with an ASCII TLD is not
  // itself a mixed-script label.
  const mixedScript = unicode.split('.').some((label) =>
    [/\p{Script=Latin}/u, /\p{Script=Cyrillic}/u, /\p{Script=Greek}/u].filter((pattern) => pattern.test(label)).length > 1);
  const keys = [...url.searchParams.keys()];
  // Keep only known parameter names: arbitrary names can themselves carry secrets.
  const queryParameterNames = [...new Set(keys.filter((key) => /^(?:token|access_token|auth|apikey|api_key|key|session|code|password|secret|sig|signature|q|page|id|redirect|url|next|utm_source|utm_campaign)$/i.test(key)).map((key) => key.toLowerCase()))];
  const normalized = {
    protocol: url.protocol.slice(0, -1), hostname, normalizedHostname: hostname, port: url.port || (url.protocol === 'https:' ? '443' : '80'),
    domainApproximation, domainIsApproximate: true, isIpHost, punycode: hostname.includes('xn--'), mixedScript,
    pathname: url.pathname === '/' ? '/' : '[path omitted]', pathLength: url.pathname.length,
    pathSegments: url.pathname.split('/').filter(Boolean).length, queryCount: keys.length, queryParameterNames,
    sensitiveQueryNamesPresent: keys.some((key) => sensitiveName.test(key)), fragmentPresent: Boolean(url.hash),
    redactedUrl: `${url.origin}${url.pathname === '/' ? '/' : '/[path omitted]'}${url.search ? '?[query values omitted]' : ''}${url.hash ? '#[fragment omitted]' : ''}`,
  };
  return { url, raw, normalized };
}
