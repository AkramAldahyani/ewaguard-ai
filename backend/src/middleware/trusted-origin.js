export function createTrustedOrigin(frontendUrl) {
  return function trustedOrigin(req, res, next) {
    const origin = req.get('Origin');
    const fetchSite = req.get('Sec-Fetch-Site');
    // Browsers send Origin for fetch POSTs. Non-browser REST clients are not
    // vulnerable to browser CSRF and may omit both browser-controlled headers.
    if ((origin && origin !== frontendUrl) || (!origin && fetchSite) ||
        (fetchSite && !['same-origin', 'same-site'].includes(fetchSite))) {
      return res.status(403).json({ error: { code: 'UNTRUSTED_ORIGIN', message: 'Request origin is not allowed.' } });
    }
    return next();
  };
}
