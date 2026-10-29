import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('Phase D employee reports and administrator resolution UI', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { render, screen, fireEvent, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { CommunityReport } = await vite.ssrLoadModule('/src/features/community/CommunityReport.jsx');
  const { AdminReportsPanel } = await vite.ssrLoadModule('/src/features/community/AdminReportsPanel.jsx');
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(cleanup);
  await t.test('employee retries preserve details, submit the selected target and prevent repeat clicks', async () => {
    let failed = true, submitted;
    globalThis.fetch = async (_path, options) => { submitted = JSON.parse(options.body); return Response.json(failed ? { error: { message: 'PRIVATE_FAILURE' } } : { submitted: true }, { status: failed ? 500 : 200 }); };
    render(createElement(CommunityReport, { targetId: 'post-id', targetType: 'POST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report post' }));
    fireEvent.change(screen.getByLabelText('Report category'), { target: { value: 'MISLEADING' } });
    fireEvent.change(screen.getByLabelText('Details (optional)'), { target: { value: 'This guidance needs review.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByRole('alert'); assert.equal(screen.getByLabelText('Details (optional)').value, 'This guidance needs review.');
    assert.doesNotMatch(dom.window.document.body.textContent, /PRIVATE_FAILURE/);
    failed = false; fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByText('Report sent to the security team.');
    assert.deepEqual(submitted, { targetId: 'post-id', targetType: 'POST', category: 'MISLEADING', details: 'This guidance needs review.' });
    assert.equal(screen.getByRole('button', { name: 'Report post' }).disabled, true);
  });
  const time = '2026-10-19T10:00:00.000Z';
  const item = { id: 'report-id', targetType: 'COMMENT', category: 'SPAM', status: 'PENDING', details: 'Please review.', updatedAt: time, createdAt: time,
    reporter: { firstName: 'Synthetic', lastName: 'Reporter' }, post: { id: 'post-id', title: 'Post context', body: 'Community guidance.', status: 'APPROVED', images: [], author: { name: 'Synthetic Author' }, updatedAt: time },
    comment: { id: 'comment-id', body: 'Reported contribution.', status: 'APPROVED', author: { firstName: 'Comment', lastName: 'Author' }, updatedAt: time } };
  await t.test('admin sees context, confirms a reason and submits reviewed versions', async () => {
    let resolution, done = false;
    globalThis.fetch = async (_path, options) => { if (options.method === 'POST') { resolution = JSON.parse(options.body); done = true; return Response.json({ status: 'ACTIONED' }); }
      return Response.json({ items: done ? [] : [item], hasMore: false, page: 1 }); };
    render(createElement(AdminReportsPanel)); await screen.findByText('Reported contribution.');
    fireEvent.click(screen.getByRole('button', { name: 'Remove comment' }));
    const dialog = within(screen.getByRole('dialog'));
    assert.equal(dialog.getByRole('button', { name: 'Confirm decision' }).disabled, true);
    fireEvent.change(dialog.getByLabelText('Resolution reason'), { target: { value: 'Spam confirmed.' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm decision' }));
    await screen.findByText('Report resolved.'); await screen.findByText('No reports in this queue.');
    assert.deepEqual(resolution, { action: 'remove', reason: 'Spam confirmed.', expectedUpdatedAt: time, expectedContentUpdatedAt: time });
  });
  await t.test('conflict and session expiry clear stale/private content; refresh recovers', async () => {
    let failure = false;
    globalThis.fetch = async (_path, options) => options.method === 'POST' ? Response.json({ error: {} }, { status: 409 })
      : failure ? Response.json({ error: {} }, { status: 401 }) : Response.json({ items: [item], hasMore: false, page: 1 });
    render(createElement(AdminReportsPanel)); await screen.findByText('Reported contribution.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss report' }));
    fireEvent.change(screen.getByLabelText('Resolution reason'), { target: { value: 'Reviewed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decision' }));
    await screen.findByText(/report or content changed/); assert.equal(screen.queryByText('Reported contribution.'), null);
    failure = true; fireEvent.click(screen.getByRole('button', { name: 'Refresh reports' })); await screen.findByText(/session expired/);
    failure = false; fireEvent.click(screen.getByRole('button', { name: 'Refresh reports' })); await screen.findByText('Reported contribution.');
  });
});
