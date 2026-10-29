import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router';

const time = '2026-10-18T10:00:00.000Z';
const comment = (extra = {}) => ({ id: 'comment-id', postId: 'post-id', parentId: null, authorName: 'Synthetic C.', body: 'Verify requests independently.',
  status: 'APPROVED', own: false, createdAt: time, updatedAt: time, ...extra });
const page = (items, extra = {}) => ({ items, page: 1, hasMore: false, commentCount: 1, ...extra });
test('C2 employee discussion and administrator comment review UI', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { CommunityComments } = await vite.ssrLoadModule('/src/features/community/CommunityComments.jsx');
  const { AdminCommentPanel } = await vite.ssrLoadModule('/src/features/community/AdminCommentPanel.jsx');
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(() => cleanup());
  await t.test('compact direct composer publishes immediately and preserves a failed draft', async () => {
    let submitted = false, fail = true; const counts = [];
    globalThis.fetch = async (_path, options) => {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body); assert.deepEqual(body, { body: 'A useful comment.' });
        if (fail) return Response.json({ error: { message: 'PRIVATE_FAILURE' } }, { status: 500 });
        submitted = true; return Response.json({ comment: comment({ status: 'APPROVED', own: true }) });
      }
      return Response.json(page(submitted ? [comment({ status: 'APPROVED', own: true })] : [], { commentCount: submitted ? 1 : 0 }));
    };
    render(createElement(CommunityComments, { postId: 'post-id', onCount: (count) => counts.push(count) }));
    await screen.findByText('No comments yet.');
    const input = screen.getByLabelText('Write a comment');
    assert.equal(screen.queryByRole('checkbox'), null);
    assert.equal(screen.getByRole('button', { name: 'Post' }).disabled, true);
    fireEvent.change(input, { target: { value: 'A useful comment.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await screen.findByText(/request could not complete/); assert.equal(input.value, 'A useful comment.'); assert.doesNotMatch(document.body.textContent, /PRIVATE_FAILURE/);
    assert.equal(submitted, false); fail = false; fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await screen.findByText('Comment published.'); await screen.findByText('Verify requests independently.');
    assert.doesNotMatch(document.body.textContent, /Only you and reviewers/);
    assert.equal(input.value, ''); assert.equal(counts.at(-1), 1);
  });
  await t.test('one-level replies use parent id; owner deletion requires confirmation', async () => {
    let deleted = false; const calls = [];
    globalThis.fetch = async (path, options) => { calls.push({ path, options });
      if (options.method === 'DELETE') { deleted = true; return Response.json({ removed: true }); }
      return Response.json(page(path.includes('parentId=') ? [comment({ id: 'reply-id', parentId: 'comment-id' })] : deleted ? [] : [comment({ own: true })]));
    };
    render(createElement(CommunityComments, { postId: 'post-id' })); await screen.findByText('Verify requests independently.');
    fireEvent.click(screen.getByRole('button', { name: 'Replies / Reply' }));
    await waitFor(() => assert.ok(calls.some(({ path }) => path.includes('parentId=comment-id'))));
    await screen.findByLabelText('Write a reply'); assert.equal(screen.getAllByRole('button', { name: 'Hide replies' }).length, 1);
    assert.equal(screen.queryByRole('button', { name: 'Replies / Reply' }), null);
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' })); assert.equal(deleted, false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' })); await screen.findByText(/Comment deleted/); assert.equal(deleted, true);
  });
  await t.test('unmount cancels pending reads and ignores late content', async () => {
    let signal, resolveRead;
    globalThis.fetch = async (_path, options) => { signal = options.signal; return new Promise((resolve) => { resolveRead = resolve; }); };
    const view = render(createElement(CommunityComments, { postId: 'post-id' }));
    assert.ok(screen.getByText('Loading comments…')); view.unmount(); assert.equal(signal.aborted, true); resolveRead(Response.json(page([])));
  });
  await t.test('admin preview, mandatory reason, confirmation and conflict refresh', async () => {
    let decision, fail = false;
    const item = comment({ status: 'PENDING_REVIEW', post: { title: 'Post context', body: 'Post description', status: 'APPROVED' }, parent: null, history: [] });
    globalThis.fetch = async (path, options) => {
      if (options.method === 'POST') { decision = { path, ...JSON.parse(options.body) }; return Response.json(fail ? { error: { message: 'PRIVATE_CONFLICT' } } : { status: 'APPROVED' }, { status: fail ? 409 : 200 }); }
      return Response.json(page([item]));
    };
    render(createElement(MemoryRouter, null, createElement(AdminCommentPanel))); await screen.findByText('Verify requests independently.');
    assert.equal(screen.getByLabelText('Comment status').value, 'APPROVED');
    fireEvent.click(screen.getByRole('button', { name: 'Approve comment' })); await screen.findByText('Enter a moderation reason.'); assert.equal(decision, undefined);
    fireEvent.change(screen.getByLabelText('Comment moderation reason'), { target: { value: 'Reviewed and appropriate.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve comment' }));
    const dialog = within(screen.getByRole('dialog')); fireEvent.click(dialog.getByRole('button', { name: 'Confirm comment decision' }));
    await screen.findByText('Comment approved.'); assert.equal(decision.expectedUpdatedAt, time); assert.match(decision.path, /comments\/comment-id\/approve/);
    await screen.findByText('Verify requests independently.');
    fireEvent.change(screen.getByLabelText('Comment moderation reason'), { target: { value: 'Reviewed again.' } });
    fail = true; fireEvent.click(screen.getByRole('button', { name: 'Reject comment' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm comment decision' }));
    await screen.findByRole('alert'); assert.equal(screen.queryByText('Verify requests independently.'), null); assert.doesNotMatch(document.body.textContent, /PRIVATE_CONFLICT/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry comment queue' })); await screen.findByText('Verify requests independently.');
  });
});
