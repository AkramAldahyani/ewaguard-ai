import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import tls from 'node:tls';
import { isPublicAddress, assertPublicHostname, UrlAnalysisError } from './url-normalization.js';

export async function resolvePublicTarget(hostname, resolver = new Resolver({ timeout: 1500, tries: 1 })) {
  assertPublicHostname(hostname);
  if (isIP(hostname)) return { addresses: [hostname], evidence: { status: 'IP_LITERAL', publicAddressesOnly: true, resolvedIpCount: 1 } };
  let timer;
  try {
    const results = await Promise.race([
      Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]),
      new Promise((_, reject) => { timer = setTimeout(() => { resolver.cancel(); reject(new Error('timeout')); }, 2500); }),
    ]);
    const addresses = [...new Set(results.flatMap((r) => r.status === 'fulfilled' ? r.value : []))];
    if (addresses.some((address) => !isPublicAddress(address))) throw new UrlAnalysisError('URL_TARGET_BLOCKED');
    const incomplete = results.some((r) => r.status === 'rejected' && !['ENODATA', 'ENOTFOUND'].includes(r.reason?.code));
    if (incomplete || !addresses.length || addresses.length > 32) return { addresses: [], evidence: { status: 'UNAVAILABLE', publicAddressesOnly: null, resolvedIpCount: 0 } };
    return { addresses, evidence: { status: 'RESOLVED', publicAddressesOnly: true, resolvedIpCount: addresses.length } };
  } catch (error) {
    if (error instanceof UrlAnalysisError) throw error;
    return { addresses: [], evidence: { status: 'UNAVAILABLE', publicAddressesOnly: null, resolvedIpCount: 0 } };
  } finally { clearTimeout(timer); }
}

export function certificateEvidence(cert, hostname, authorized, now = Date.now()) {
  const from = Date.parse(cert.valid_from);
  const to = Date.parse(cert.valid_to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { status: 'UNAVAILABLE', certificatePresent: Boolean(cert.raw) };
  return {
    status: 'AVAILABLE', certificatePresent: true,
    validFrom: new Date(from).toISOString(), validTo: new Date(to).toISOString(),
    expired: to < now, notYetValid: from > now,
    hostnameMatch: !tls.checkServerIdentity(hostname, cert), chainAuthorized: Boolean(authorized),
  };
}

export async function inspectTls(normalized, addresses, connect = tls.connect) {
  if (normalized.protocol !== 'https') return { status: 'NOT_APPLICABLE' };
  if (normalized.port !== '443') return { status: 'SKIPPED_PORT' };
  if (!addresses.length) return { status: 'UNAVAILABLE' };
  if (addresses.some((address) => !isPublicAddress(address))) throw new UrlAnalysisError('URL_TARGET_BLOCKED');
  return new Promise((resolve) => {
    let socket;
    let timer;
    let done = false;
    const finish = (value) => { if (done) return; done = true; clearTimeout(timer); socket?.destroy(); resolve(value); };
    try {
      // Pin the public numeric IP: no second DNS lookup and no redirects. This
      // metadata-only handshake writes no application data. Invalid certificates
      // are observed as evidence, never accepted for HTTP or provider requests.
      socket = connect({ host: addresses[0], port: 443, servername: normalized.isIpHost ? undefined : normalized.hostname,
        rejectUnauthorized: false, minVersion: 'TLSv1.2' });
      timer = setTimeout(() => finish({ status: 'TIMEOUT' }), 3000);
      socket.once('secureConnect', () => {
        try { finish(certificateEvidence(socket.getPeerCertificate(), normalized.hostname, socket.authorized)); }
        catch { finish({ status: 'UNAVAILABLE' }); }
      });
      socket.once('error', () => finish({ status: 'UNAVAILABLE' }));
      socket.once('close', () => finish({ status: 'UNAVAILABLE' }));
    } catch { finish({ status: 'UNAVAILABLE' }); }
  });
}
