export const certificateDate = (value) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(value),
      )
    : 'Unavailable';
export function certificateError(error, context = 'load') {
  if (error?.status === 401) return 'Your session has expired. Sign in again to access certificates.';
  if (error?.status === 403) return 'Your current permissions do not allow access to certificates.';
  if (error?.status === 404)
    return context === 'verify'
      ? 'No certificate was found for that number.'
      : 'This certificate is unavailable or you do not have access to it.';
  if (error?.code === 'CERTIFICATE_REVOKED') return 'This certificate has been revoked and its PDF is unavailable.';
  return context === 'download'
    ? 'The PDF could not be downloaded. Please try again.'
    : 'Certificates could not be loaded. Please try again.';
}
