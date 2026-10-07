const shorteners = new Set(['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly']);

export function localUrlIndicators({ url, raw, normalized: n }) {
  let decodedPath = url.pathname;
  try { decodedPath = decodeURI(url.pathname); } catch { /* Malformed UTF-8 remains encoded evidence. */ }
  const indicators = [];
  const add = (condition, id, title, weight = 1) => { if (condition) indicators.push({ id, title, weight, source: 'LOCAL_HEURISTIC' }); };
  add(n.isIpHost, 'IP_HOST', 'An IP address is used instead of a domain name.', 2);
  add(n.hostname.length > 100, 'LONG_HOSTNAME', 'The hostname is unusually long.');
  add(raw.length > 1800, 'LONG_URL', 'The URL is unusually long.');
  add(!n.isIpHost && n.hostname.split('.').length > 5, 'MANY_SUBDOMAINS', 'Many subdomains can obscure the actual destination.');
  add((n.hostname.match(/-/g) ?? []).length > 4, 'MANY_HYPHENS', 'The hostname contains many hyphens.');
  add(/@|%40/i.test(url.pathname + url.search), 'AT_CHARACTER', 'The path or query contains an at sign.');
  add((raw.match(/%[a-f\d]{2}/gi) ?? []).length > 12 || /%25[a-f\d]{2}/i.test(raw), 'ENCODING', 'Heavy or nested percent encoding can obscure a destination.');
  add(n.punycode, 'IDN', 'The hostname uses internationalized domain encoding.');
  add(n.mixedScript, 'MIXED_SCRIPT', 'The hostname mixes Latin, Greek, or Cyrillic scripts.', 2);
  add(/\.(?:zip|mov|click|top|work)$/.test(n.hostname), 'TLD_PATTERN', 'The top-level domain warrants extra review; this alone is not evidence of abuse.');
  add(/(?:login|secure|security|verify|account|update)/i.test(n.hostname), 'HOST_TERMS', 'The hostname contains account or security-related terms.');
  add(/(?:login|signin|account|update|verify|reset|password|credential)/i.test(decodedPath), 'ACCOUNT_PATH', 'The path contains login, account, or credential-related terms.');
  add(n.sensitiveQueryNamesPresent, 'SENSITIVE_QUERY', 'The URL has parameter names commonly used for secrets. Values are omitted.');
  add(n.queryCount > 12, 'MANY_PARAMETERS', 'The URL has an unusually large number of query parameters.');
  add(shorteners.has(n.hostname), 'SHORTENER', 'A URL shortener hides the eventual destination.', 2);
  add(/(?:paypal|microsoft|google|apple|amazon)[.-]/i.test(n.hostname) && !['paypal.com', 'microsoft.com', 'google.com', 'apple.com', 'amazon.com'].includes(n.domainApproximation), 'BRAND_PATTERN', 'A familiar brand appears outside its common domain; ownership is not verified.', 2);
  add(!['80', '443'].includes(n.port), 'UNUSUAL_PORT', 'An unusual network port is specified.');
  add(n.protocol === 'http', 'HTTP', 'HTTP does not provide transport encryption.');
  return indicators;
}

export function classifyUrl(indicators, tls, providers) {
  // Analyzer-local rubric, not the central risk engine. Correlated URL/domain
  // provider reports are never added together as independent detections.
  const structural = indicators.filter(({ id }) => id !== 'SENSITIVE_QUERY');
  const weight = structural.reduce((total, item) => total + item.weight, 0);
  const detections = Math.max(0, ...providers.filter((p) => p.status === 'AVAILABLE').map((p) => p.maliciousCount + p.suspiciousCount));
  const certificateWarning = tls.expired === true || tls.hostnameMatch === false ? 1 : 0;
  if (structural.length >= 3 && weight >= 6 && detections >= 3) return 'HIGHLY_SUSPICIOUS';
  if ((structural.length >= 2 && weight + certificateWarning >= 3) || detections >= 3 || (detections > 0 && weight >= 2)) return 'SUSPICIOUS';
  return 'NO_STRONG_INDICATORS';
}
