import { domainToASCII, domainToUnicode } from 'node:url';

const shorteners = new Set(['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly']);
// Common domains are heuristic reference data, not verified sender allowlists.
const brands = [
  ['paypal', ['paypal.com']],
  ['microsoft', ['microsoft.com', 'microsoftonline.com']],
  ['google', ['google.com']],
  ['apple', ['apple.com']],
  ['amazon', ['amazon.com']],
];
export const normalizeDomain = (value) => domainToASCII(String(value ?? '').trim().replace(/\.$/, '').toLowerCase());
export const isShortener = (hostname) => shorteners.has(normalizeDomain(hostname));

// Case folding must precede comparison: DNS does not distinguish I from i.
// A bounded confusable skeleton catches i/l/1 and common Unicode substitutions.
const skeleton = (value) => domainToUnicode(value).normalize('NFKC').toLowerCase()
  .replace(/[i1l\u0131\u0456]/g, 'l').replace(/[0\u043e\u03bf]/g, 'o')
  .replace(/[\u0430\u03b1]/g, 'a').replace(/[\u0435\u03b5]/g, 'e')
  .replace(/[\u0440\u03c1]/g, 'p').replace(/[\u0441]/g, 'c').replace(/[\u0443]/g, 'y');

export function brandDomainEvidence(domain, claimedIdentity) {
  const hostname = normalizeDomain(domain);
  if (!hostname) return { brandClaim: false, lookalike: false };
  let brandClaim = false, lookalike = false;
  for (const [brand, commonDomains] of brands) {
    if (!new RegExp(`\\b${brand}\\b`, 'i').test(claimedIdentity)) continue;
    if (commonDomains.some((known) => hostname === known || hostname.endsWith(`.${known}`))) continue;
    brandClaim = true;
    // Require a matching brand claim and a whole hostname/hyphen token, avoiding
    // substring matches such as "pineapple". A known domain in a subdomain is
    // still suspicious when the full hostname is outside that domain.
    lookalike ||= domainToUnicode(hostname).split(/[.-]/).some((token) => skeleton(token) === skeleton(brand));
  }
  return { brandClaim, lookalike };
}
