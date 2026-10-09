import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../services/api.js';
import { AuthContext } from './auth-context.js';
import { clearConsentSession, configureConsentSession } from '../features/disclaimer/session-consent.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearSession = useCallback((expired = false) => {
    clearConsentSession();
    setUser(null);
    setExpiresAt(null);
    setSessionExpired(expired);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    apiRequest('/api/auth/me', { signal: controller.signal })
      .then((payload) => { if (active) { configureConsentSession(payload.user.id, payload.session); setUser(payload.user); setExpiresAt(payload.session.expiresAt); } })
      .catch((error) => { if (active && error.name !== 'AbortError') clearSession(false); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [clearSession]);

  useEffect(() => {
    const expire = () => clearSession(true);
    window.addEventListener('ewaguard:session-expired', expire);
    return () => window.removeEventListener('ewaguard:session-expired', expire);
  }, [clearSession]);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => clearSession(true), Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [expiresAt, clearSession]);

  const login = useCallback(async (email, password) => {
    const payload = await apiRequest('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    if (payload.mfaRequired) { clearSession(false); return payload; }
    configureConsentSession(payload.user.id, payload.session);
    setUser(payload.user);
    setExpiresAt(payload.session.expiresAt);
    setSessionExpired(false);
    return payload.user;
  }, [clearSession]);

  const verifyMfa = useCallback(async (code) => {
    const payload = await apiRequest('/api/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) });
    configureConsentSession(payload.user.id, payload.session);
    setUser(payload.user);
    setExpiresAt(payload.session.expiresAt);
    setSessionExpired(false);
    return payload.user;
  }, []);

  const logout = useCallback(async () => {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); }
    finally { clearSession(false); }
  }, [clearSession]);

  const value = useMemo(() => ({ user, loading, sessionExpired, login, logout, verifyMfa }),
    [user, loading, sessionExpired, login, logout, verifyMfa]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
