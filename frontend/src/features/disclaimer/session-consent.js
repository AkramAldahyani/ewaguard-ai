// Presentation preference only. Backend authentication and acknowledgement checks
// remain authoritative. Never store tokens, submitted content, or private inputs.
const KEY = 'ewaguard:session-consent';
let active = null;
let notices = {};
const storage = () => globalThis.sessionStorage;

export function configureConsentSession(userId, session) {
  const next = session?.id && userId ? `${userId}:${session.id}` : null;
  active = next;
  notices = {};
  try {
    const saved = JSON.parse(storage()?.getItem(KEY) ?? 'null');
    if (next && saved?.session === next && saved.notices && typeof saved.notices === 'object') notices = saved.notices;
    else storage()?.removeItem(KEY);
  } catch {
    /* Storage may be disabled; retain consent in memory for navigation. */
  }
}

export function hasSessionConsent(name, version) {
  return Boolean(active && version && notices[name] === version);
}

export function rememberSessionConsent(name, version, accepted = true) {
  if (!active || !version) return;
  if (accepted) notices[name] = version;
  else delete notices[name];
  try {
    storage()?.setItem(KEY, JSON.stringify({ session: active, notices }));
  } catch {
    /* In-memory consent still works until the page reloads. */
  }
}

export function clearConsentSession() {
  active = null;
  notices = {};
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* Storage is optional. */
  }
}
