export function createTrustedOrigin(trustedOrigins) {
  return function trustedOrigin(req, res, next) {
    const origin = req.get('Origin');
    const fetchSite = req.get('Sec-Fetch-Site');
    // Same-origin browser GET/HEAD requests may omit Origin. Fetch Metadata
    // establishes their origin relationship; same-site alone is insufficient.
    // Writes still require Origin when browser Fetch Metadata is present.
    // Non-browser REST clients may omit both browser-controlled headers.
    const sameOriginRead = ['GET', 'HEAD'].includes(req.method) && fetchSite === 'same-origin';
    if ((origin && !trustedOrigins.includes(origin)) || (!origin && fetchSite && !sameOriginRead) ||
        (fetchSite && !['same-origin', 'same-site'].includes(fetchSite))) {
      return res.status(403).json({ error: { code: 'UNTRUSTED_ORIGIN', message: 'Request origin is not allowed.' } });
    }
    return next();
  };
}
