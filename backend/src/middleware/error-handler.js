export function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } });
}

// Express requires four parameters to identify error middleware.
export function errorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);
  const clientErrors = {
    'entity.parse.failed': [400, 'INVALID_JSON', 'Request body must contain valid JSON.'],
    'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit.'],
    'encoding.unsupported': [415, 'UNSUPPORTED_ENCODING', 'Request encoding is unsupported.'],
    'charset.unsupported': [415, 'UNSUPPORTED_CHARSET', 'Request charset is unsupported.'],
  };
  const [status, code, message] = clientErrors[error.type] ??
    [500, 'INTERNAL_ERROR', 'An unexpected error occurred.'];
  if (status === 500) console.error(JSON.stringify({ level: 'ERROR', event: 'request_failed', code }));
  res.status(status).json({ error: { code, message } });
}
