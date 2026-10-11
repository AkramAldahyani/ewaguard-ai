import { io } from 'socket.io-client';
import { notificationApi } from './notification-api.js';

export const socketOptions = Object.freeze({ path: '/api/realtime', withCredentials: true,
  autoConnect: false, reconnection: false, forceNew: true, timeout: 8000, transports: ['websocket', 'polling'], tryAllTransports: true });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = ['INCIDENT_CREATED', 'INCIDENT_ASSIGNED', 'STATUS_CHANGED', 'EMPLOYEE_UPDATE', 'INVESTIGATION_UPDATED'];
export function notificationItems(items, role) {
  const allowed = role === 'EMPLOYEE' ? ['STATUS_CHANGED', 'EMPLOYEE_UPDATE'] : role === 'IT_SECURITY_ADMIN' ? kinds : [];
  return (Array.isArray(items) ? items : []).filter((item) => uuid.test(item.id) && uuid.test(item.incidentId) && allowed.includes(item.kind))
    .map((item) => ({ id: item.id, incidentId: item.incidentId, kind: item.kind,
      title: typeof item.title === 'string' ? item.title.slice(0, 160) : 'Incident update',
      message: typeof item.message === 'string' ? item.message.slice(0, 500) : '',
      reference: /^INC-\d{4}-\d{6,10}$/.test(item.reference) ? item.reference : null,
      severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(item.severity) ? item.severity : null,
      readAt: item.readAt ?? null, createdAt: item.createdAt }));
}
const unique = (items) => [...new Map(items.map((item) => [item.id, item])).values()];
const errorText = (error) => error?.status === 429 ? 'Too many requests. Wait a minute and retry.' : 'Notifications could not be retrieved. Please retry.';

// One memory-only store and socket per mounted authenticated session.
export function createNotificationFlow({ userId, role, sessionId, api = notificationApi,
  socketFactory = () => io({ ...socketOptions }), onUnauthorized = () => {}, schedule = setTimeout, cancel = clearTimeout } = {}) {
  const initial = () => ({ items: [], unreadCount: null, nextCursor: null, loading: true, refreshing: false,
    moreLoading: false, marking: [], error: '', connection: 'connecting' });
  let state = initial(); let active = false; let generation = 0; let socket; let attempt = 0;
  let refreshTimer; let reconnectTimer; let incidentTimer; let pending = false; let again = false; let pageVersion = 0;
  let checking = false;
  const controllers = new Set(); const listeners = new Set(); const incidentListeners = new Set();
  const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()); };
  const job = () => { const controller = new AbortController(); controllers.add(controller); const gen = generation;
    return { signal: controller.signal, valid: () => active && gen === generation, done: () => controllers.delete(controller) }; };
  function unauthorized(error) {
    if (![401, 403].includes(error?.status)) return false;
    flow.stop(); set({ ...initial(), loading: false, connection: 'unavailable', error: 'Your session or access has changed. Sign in again.' });
    onUnauthorized(); return true;
  }
  function incidentsChanged() {
    if (!active || incidentTimer) return;
    incidentTimer = schedule(() => { incidentTimer = null; if (active) incidentListeners.forEach((fn) => fn()); }, 150);
  }
  function requestRefresh() {
    if (!active) return;
    if (pending) { again = true; return; }
    if (!refreshTimer) refreshTimer = schedule(() => { refreshTimer = null; void flow.refresh(); }, 150);
  }
  function retryConnection() {
    if (!active || reconnectTimer) return;
    if (attempt >= 5) { set({ connection: 'offline' }); return; }
    set({ connection: 'reconnecting' });
    reconnectTimer = schedule(() => { reconnectTimer = null; if (active) socket.connect(); }, Math.min(1000 * 2 ** attempt++, 16000));
  }
  async function connectionLost(reason) {
    if (!active || checking) return;
    set({ connection: 'reconnecting' });
    // Explicit server disconnects can mean revocation/role change. Hide cached content until verified.
    if (reason === 'io server disconnect') set({ items: [], unreadCount: null, nextCursor: null });
    checking = true; const task = job();
    try {
      const current = await api.session(task.signal);
      if (!task.valid()) return;
      if (current.user?.id !== userId || current.user?.role !== role || (sessionId && current.session?.id !== sessionId)) {
        unauthorized({ status: 401 }); return;
      }
    } catch (error) { if (!task.valid() || unauthorized(error)) return; }
    finally { task.done(); checking = false; }
    if (task.valid()) retryConnection();
  }
  const handlers = {
    'notifications:ready': () => { if (!active) return; attempt = 0; cancel(reconnectTimer); reconnectTimer = null; set({ connection: 'live' }); requestRefresh(); incidentsChanged(); },
    'notifications:changed': requestRefresh,
    'incidents:changed': incidentsChanged,
    disconnect: connectionLost,
    connect_error: () => { void connectionLost('error'); },
  };
  const flow = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    subscribeIncidents(fn) { incidentListeners.add(fn); return () => incidentListeners.delete(fn); },
    getSnapshot: () => state,
    start() {
      if (active || !userId || !['EMPLOYEE', 'IT_SECURITY_ADMIN'].includes(role)) return;
      active = true; attempt = 0; checking = false; set(initial()); socket = socketFactory();
      for (const [name, fn] of Object.entries(handlers)) socket.on(name, fn);
      socket.connect(); requestRefresh();
    },
    stop() {
      active = false; generation++; pageVersion++; pending = false; again = false;
      for (const timer of [refreshTimer, reconnectTimer, incidentTimer]) cancel(timer);
      refreshTimer = reconnectTimer = incidentTimer = null;
      controllers.forEach((controller) => controller.abort()); controllers.clear();
      if (socket) { for (const [name, fn] of Object.entries(handlers)) socket.off(name, fn); socket.disconnect(); socket = null; }
      set({ ...initial(), loading: false, connection: 'offline' });
    },
    resume() { if (active) { requestRefresh(); incidentsChanged(); } },
    reconnect() { if (!active || state.connection === 'live') return; attempt = 0; cancel(reconnectTimer); reconnectTimer = null; void connectionLost('manual'); },
    async refresh() {
      if (!active) return;
      if (pending) { again = true; return; }
      cancel(refreshTimer); refreshTimer = null; pending = true; pageVersion++;
      const task = job(); set({ refreshing: true, error: '', moreLoading: false });
      try {
        const [page, count] = await Promise.all([api.list(null, task.signal), api.unread(task.signal)]);
        if (!task.valid()) return;
        if (!Number.isSafeInteger(count.unreadCount) || count.unreadCount < 0) throw new Error();
        set({ items: unique(notificationItems(page.items, role)), nextCursor: page.nextCursor, unreadCount: count.unreadCount, loading: false, refreshing: false });
      } catch (error) {
        if (task.valid() && error.name !== 'AbortError' && !unauthorized(error)) set({ loading: false, refreshing: false, error: errorText(error) });
      } finally {
        task.done(); if (task.valid()) { pending = false; if (again) { again = false; requestRefresh(); } }
      }
    },
    async more() {
      if (!active || pending || state.moreLoading || !state.nextCursor) return;
      const version = pageVersion; const task = job(); set({ moreLoading: true, error: '' });
      try {
        const page = await api.list(state.nextCursor, task.signal);
        if (task.valid() && version === pageVersion) set({ items: unique([...state.items, ...notificationItems(page.items, role)]), nextCursor: page.nextCursor, moreLoading: false });
      } catch (error) { if (task.valid() && version === pageVersion && !unauthorized(error)) set({ moreLoading: false, error: errorText(error) }); }
      finally { task.done(); }
    },
    async read(id) {
      if (!active || state.marking.includes(id) || !state.items.some((item) => item.id === id && !item.readAt)) return;
      const task = job(); set({ marking: [...state.marking, id], error: '' });
      try {
        const result = await api.read(id, task.signal);
        if (!task.valid()) return;
        const item = notificationItems([result.notification], role)[0];
        if (item?.id !== id || !item.readAt) throw new Error();
        set({ items: state.items.map((old) => old.id === id ? item : old) });
        requestRefresh();
      } catch (error) { if (task.valid() && !unauthorized(error)) set({ error: 'Could not confirm the read state. Refresh notifications and retry.' }); }
      finally { task.done(); if (task.valid()) set({ marking: state.marking.filter((value) => value !== id) }); }
    },
  };
  return flow;
}
