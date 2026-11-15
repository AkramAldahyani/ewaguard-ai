import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer as httpServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { createServer as viteServer } from 'vite';
import viteConfig from '../vite.config.js';
import { createNotificationFlow, socketOptions } from '../src/features/notifications/notification-flow.js';

test('frontend flow receives real Socket.IO signals through the configured Vite WebSocket proxy', async () => {
  const userId = '10000000-0000-4000-8000-000000000010';
  const incidentId = '10000000-0000-4000-8000-000000000090';
  let items = [];
  let unreadCount = 0;
  let peer;
  const server = httpServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/notifications/unread-count')) res.end(JSON.stringify({ unreadCount }));
    else if (req.url.startsWith('/api/notifications')) res.end(JSON.stringify({ items, nextCursor: null }));
    else res.end(JSON.stringify({ user: { id: userId, role: 'EMPLOYEE' } }));
  });
  const sockets = new Server(server, { path: '/api/realtime' });
  sockets.on('connection', (socket) => {
    peer = socket;
    socket.emit('notifications:ready', { recovery: 'FETCH_AUTHORIZED_LIST' });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const config = viteConfig({ mode: 'test' });
  const target = `http://127.0.0.1:${server.address().port}`;
  const vite = await viteServer({
    ...config,
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {
      ...config.server,
      port: 0,
      strictPort: false,
      hmr: false,
      proxy: Object.fromEntries(
        Object.entries(config.server.proxy).map(([path, settings]) => [path, { ...settings, target }]),
      ),
    },
  });
  let flow;
  try {
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const read = (path, signal) => fetch(`${origin}${path}`, { signal }).then((response) => response.json());
    let incidentRefreshes = 0;
    flow = createNotificationFlow({
      userId,
      role: 'EMPLOYEE',
      // Node's empty cookie jar overrides injected Cookie with withCredentials=true.
      // Browser credentials remain enabled in socketOptions; this synthetic Node fixture supplies its own header.
      socketFactory: () =>
        io(origin, {
          ...socketOptions,
          withCredentials: false,
          transports: ['websocket'],
          extraHeaders: { Origin: origin, Cookie: 'synthetic_cookie=test-only' },
        }),
      api: {
        list: (_cursor, signal) => read('/api/notifications?limit=20', signal),
        unread: (signal) => read('/api/notifications/unread-count', signal),
        session: (signal) => read('/api/auth/me', signal),
      },
    });
    flow.subscribeIncidents(() => incidentRefreshes++);
    flow.start();
    const until = async (predicate) => {
      for (let n = 0; n < 150; n++) {
        if (predicate()) return;
        await delay(20);
      }
      assert.fail('Timed out waiting for loopback notification integration');
    };
    await until(() => flow.getSnapshot().connection === 'live' && !flow.getSnapshot().loading);
    assert.equal(peer.handshake.headers.origin, origin);
    assert.equal(peer.handshake.headers.cookie, 'synthetic_cookie=test-only');
    assert.deepEqual(Object.keys(peer.handshake.auth), []);
    assert.equal(peer.handshake.query.token, undefined);
    items = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        incidentId,
        kind: 'EMPLOYEE_UPDATE',
        title: 'Security team update',
        message: 'An update is available.',
        severity: 'CRITICAL',
        readAt: null,
        createdAt: new Date().toISOString(),
      },
    ];
    unreadCount = 1;
    peer.emit('notifications:changed');
    peer.emit('incidents:changed');
    await until(() => flow.getSnapshot().unreadCount === 1 && incidentRefreshes >= 2);
    assert.equal(flow.getSnapshot().items[0].severity, 'CRITICAL');
  } finally {
    flow?.stop();
    await vite.close();
    await new Promise((resolve) => sockets.close(resolve));
  }
});
