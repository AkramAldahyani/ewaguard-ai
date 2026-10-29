// Capture before React/router initialization. The fragment is never sent to HTTP
// servers; replaceState also removes it from the current browser history entry.
export function captureSetupToken(location, history) {
  const params = new URLSearchParams(location.hash.slice(1));
  const values = params.getAll('token');
  const token = values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]) ? values[0] : '';
  history.replaceState(null, '', location.pathname);
  return token;
}

export function passwordIssue(password, confirmation) {
  if (password.length < 12 || new TextEncoder().encode(password).length > 72 || !password.trim()) {
    return 'Use at least 12 characters and no more than 72 UTF-8 bytes.';
  }
  if (password !== confirmation) return 'The passwords do not match.';
  return '';
}
