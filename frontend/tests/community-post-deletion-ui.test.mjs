import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('own-post deletion requires confirmation and keeps failed requests retryable', async (t) => {
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  const { CommunityPostCard } = await vite.ssrLoadModule('/src/features/community/CommunityPostCard.jsx');
  const post = { id: 'post-id', title: 'My post', body: 'A tip.', authorName: 'Employee', status: 'PENDING_REVIEW', category: 'SECURITY_TIP', images: [] };
  let calls = 0, deleted = false, fail = true;
  globalThis.fetch = async (path, options) => { calls++; assert.equal(path, '/api/community/post-id'); assert.equal(options.method, 'DELETE'); return Response.json(fail ? { error: {} } : { deleted: true }, { status: fail ? 500 : 200 }); };
  const view = render(createElement(CommunityPostCard, { post, own: false }));
  assert.equal(screen.queryByRole('button', { name: 'Delete post' }), null);
  view.rerender(createElement(CommunityPostCard, { post, own: true, onDeleted: () => { deleted = true; } }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete post' })); assert.equal(calls, 0);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); assert.equal(calls, 0);
  fireEvent.click(screen.getByRole('button', { name: 'Delete post' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm delete post' }));
  await screen.findByRole('alert'); assert.equal(deleted, false);
  fail = false; fireEvent.click(screen.getByRole('button', { name: 'Confirm delete post' }));
  const { waitFor } = await import('@testing-library/react'); await waitFor(() => assert.equal(deleted, true)); assert.equal(calls, 2);
});
