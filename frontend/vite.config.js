import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  // Read only the development proxy setting; backend secrets are never injected.
  const env = loadEnv(mode, root, 'DEV_API_TARGET');
  const target = process.env.DEV_API_TARGET ?? env.DEV_API_TARGET ?? 'http://127.0.0.1:5000';
  let url;
  try { url = new URL(target); } catch { throw new Error('DEV_API_TARGET must be an HTTP(S) origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('DEV_API_TARGET must be an HTTP(S) origin without credentials or a path.');
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
      host: '127.0.0.1', port: 5173, strictPort: true,
      proxy: { '/api/realtime': { target: url.origin, ws: true }, '/api': { target: url.origin } },
    },
    preview: { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  };
});
