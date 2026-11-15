import { createHash } from 'node:crypto';
import { normalizeUrl, assertPublicHostname } from '../analyzers/url/url-normalization.js';
import { isIP } from 'node:net';

export const PROVIDER_CACHE_TTL_MS = 10 * 60_000;
const outcome = (scope, status) => ({ provider: 'VIRUSTOTAL', scope, status });

export function normalizeVirusTotal(payload, scope, now = Date.now()) {
  const a = payload?.data?.attributes;
  const stats = a?.last_analysis_stats;
  const keys = ['malicious', 'suspicious', 'harmless', 'undetected'];
  if (
    !stats ||
    keys.some((key) => !Number.isSafeInteger(stats[key]) || stats[key] < 0 || stats[key] > 10000) ||
    (a.reputation !== undefined && (!Number.isSafeInteger(a.reputation) || Math.abs(a.reputation) > 1e9))
  )
    return outcome(scope, 'MALFORMED_RESPONSE');
  const date =
    Number.isSafeInteger(a.last_analysis_date) &&
    a.last_analysis_date > 0 &&
    a.last_analysis_date * 1000 <= now + 86400_000
      ? new Date(a.last_analysis_date * 1000).toISOString()
      : null;
  // No raw strings, IDs, categories, URLs or engine output cross this boundary.
  return {
    ...outcome(scope, 'AVAILABLE'),
    maliciousCount: stats.malicious,
    suspiciousCount: stats.suspicious,
    harmlessCount: stats.harmless,
    undetectedCount: stats.undetected,
    reputation: a.reputation ?? null,
    lastAnalysisDate: date,
  };
}

async function boundedJson(response) {
  if (Number(response.headers.get('content-length')) > 512 * 1024) {
    await response.body?.cancel().catch(() => {});
    throw new Error('size');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) throw new Error('size');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function createThreatIntelligence({
  apiKey = null,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = 3500,
} = {}) {
  const cache = new Map();
  let active = 0;
  let requestTimes = [];
  let cooldownUntil = 0;
  const lookup = async (scope, identifier) => {
    if (!apiKey) return outcome(scope, 'NOT_CONFIGURED');
    const cacheKey = createHash('sha256').update(`${scope}:${identifier}`).digest('hex');
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return { ...cached.value, cached: true };
    if (cached) cache.delete(cacheKey);
    if (cooldownUntil > now()) return outcome(scope, 'RATE_LIMITED');
    requestTimes = requestTimes.filter((time) => time > now() - 60_000);
    if (requestTimes.length >= 4) return outcome(scope, 'RATE_LIMITED');
    if (active >= 2) return outcome(scope, 'BUSY');
    active += 1;
    requestTimes.push(now());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let value;
    try {
      const resource = { URL: 'urls', DOMAIN: 'domains', FILE_HASH: 'files' }[scope];
      const response = await fetchImpl(
        `https://www.virustotal.com/api/v3/${resource}/${encodeURIComponent(identifier)}`,
        {
          method: 'GET',
          headers: { 'x-apikey': apiKey, Accept: 'application/json' },
          signal: controller.signal,
          redirect: 'error',
        },
      );
      if (response.status === 200) {
        try {
          value = normalizeVirusTotal(await boundedJson(response), scope, now());
        } catch {
          value = outcome(scope, controller.signal.aborted ? 'TIMEOUT' : 'MALFORMED_RESPONSE');
        }
      } else {
        value = outcome(
          scope,
          { 401: 'UNAUTHORIZED', 403: 'UNAUTHORIZED', 404: 'NO_REPORT', 429: 'RATE_LIMITED' }[response.status] ??
            'UNAVAILABLE',
        );
        await response.body?.cancel().catch(() => {});
        if (response.status === 429) cooldownUntil = now() + 60_000;
      }
    } catch {
      value = outcome(scope, controller.signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE');
    } finally {
      clearTimeout(timer);
      active -= 1;
    }
    if (cache.size >= 256) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, {
      value,
      expiresAt: now() + (['AVAILABLE', 'NO_REPORT'].includes(value.status) ? PROVIDER_CACHE_TTL_MS : 30_000),
    });
    return { ...value, cached: false };
  };
  return {
    lookupFileHash: async (sha256) => {
      if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256))
        throw new TypeError('A SHA-256 hash is required.');
      return lookup('FILE_HASH', sha256.toLowerCase());
    },
    lookupUrl: async (input) => {
      const { url, normalized } = normalizeUrl(input);
      if (normalized.isIpHost || url.pathname !== '/' || url.search || url.hash)
        return outcome('URL', 'SKIPPED_PRIVACY');
      return lookup('URL', Buffer.from(url.href).toString('base64url'));
    },
    lookupDomain: async (hostname) => {
      assertPublicHostname(hostname);
      if (isIP(hostname)) return outcome('DOMAIN', 'NOT_APPLICABLE');
      const { normalized } = normalizeUrl(`https://${hostname}/`);
      if (normalized.hostname !== hostname) return outcome('DOMAIN', 'NOT_APPLICABLE');
      return lookup('DOMAIN', hostname);
    },
  };
}
