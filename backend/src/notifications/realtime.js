import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import { authCookie } from '../auth/auth-token.js';
import { authenticateSession } from '../auth/session.js';
import { notificationScope } from './notification-service.js';

// Signals invalidate authorized REST views; no evidence, note text, or token is emitted.
export function attachRealtime(server, { database, config, pollIntervalMs = 5000 }) {
  const attempts = new Map();
  const sessions = new Map();
  const io = new Server(server, {
    path: '/api/realtime',
    serveClient: false,
    cors: { origin: config.trustedOrigins, credentials: true, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 4096,
    connectTimeout: 5000,
    pingInterval: 25000,
    pingTimeout: 10000,
    perMessageDeflate: false,
    httpCompression: false,
    allowRequest(req, done) {
      const now = Date.now();
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      const address = req.socket.remoteAddress;
      const attempt = attempts.get(address) ?? { count: 0, until: now + 60000 };
      const allowed =
        config.trustedOrigins.includes(req.headers.origin) &&
        attempts.size < 10000 &&
        ++attempt.count <= 30 &&
        io.engine.clientsCount < 1000;
      if (attempts.size < 10000) attempts.set(address, attempt);
      done(null, allowed);
    },
  });
  io.use(async (socket, next) => {
    try {
      // Only the HttpOnly session cookie is accepted, never handshake.auth or query credentials.
      if (
        Object.keys(socket.handshake.auth ?? {}).length ||
        Object.keys(socket.handshake.query).some((k) => !['EIO', 'transport', 't', 'sid'].includes(k))
      )
        throw new Error();
      cookieParser()(socket.request, {}, () => {});
      const token = socket.request.cookies?.[authCookie(config).name];
      const session = await authenticateSession(database, config, token);
      if (!session || !['EMPLOYEE', 'IT_SECURITY_ADMIN'].includes(session.user.role)) throw new Error();
      if ([...sessions.values()].filter((item) => item.user.id === session.user.id).length >= 5) throw new Error();
      sessions.set(socket.id, { token, ...session });
      socket.conn.once('close', () => sessions.delete(socket.id));
      next();
    } catch {
      next(new Error('Authentication required or connection unavailable.'));
    }
  });
  io.on('connection', (socket) => {
    const initial = sessions.get(socket.id);
    socket.join(`user:${initial.user.id}`);
    if (initial.user.role === 'IT_SECURITY_ADMIN') socket.join('verified-administrators');
    // No client event handlers or arbitrary room-join capability.
    socket.onAny(() => socket.disconnect(true));
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, initial.claims.exp * 1000 - Date.now()));
    expiry.unref();
    let busy = false;
    let previous;
    async function refresh() {
      if (busy || !socket.connected) return;
      busy = true;
      try {
        const current = await authenticateSession(database, config, initial.token);
        if (!current || current.user.role !== initial.user.role) {
          socket.disconnect(true);
          return;
        }
        const scope = notificationScope(current.user);
        const [latest, count, total] = await Promise.all([
          database.notification.findFirst({
            where: scope,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true },
          }),
          database.notification.count({ where: { ...scope, readAt: null } }),
          database.notification.count({ where: scope }),
        ]);
        // Recheck after database reads: expiry/logout must not race a pending dispatch.
        const valid = await authenticateSession(database, config, initial.token);
        if (!valid || valid.user.role !== initial.user.role || !socket.connected) {
          socket.disconnect(true);
          return;
        }
        const state = {
          notification: `${latest?.id ?? ''}:${count}:${total}`,
          incident: `${latest?.id ?? ''}:${total}`,
        };
        if (!previous) socket.emit('notifications:ready', { recovery: 'FETCH_AUTHORIZED_LIST' });
        else {
          if (previous.notification !== state.notification) socket.emit('notifications:changed');
          // Read receipts do not refresh incidents. Private events have no employee row.
          if (previous.incident !== state.incident) socket.emit('incidents:changed');
        }
        previous = state;
      } catch {
        // Fail closed, without touching already committed incident transactions.
        socket.disconnect(true);
      } finally {
        busy = false;
      }
    }
    const timer = setInterval(() => {
      void refresh();
    }, pollIntervalMs);
    timer.unref();
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      clearInterval(timer);
      sessions.delete(socket.id);
    });
    void refresh();
  });
  return {
    io,
    disconnectSession(id) {
      for (const [socketId, session] of sessions)
        if (session.claims.jti === id) io.sockets.sockets.get(socketId)?.disconnect(true);
    },
    disconnectUser(id) {
      for (const [socketId, session] of sessions)
        if (session.user.id === id) io.sockets.sockets.get(socketId)?.disconnect(true);
    },
    close() {
      return new Promise((resolve) => io.close(resolve));
    },
  };
}
