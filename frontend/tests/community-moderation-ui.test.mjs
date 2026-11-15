import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router';

const id = '123e4567-e89b-42d3-a456-426614174100';
const secondId = '123e4567-e89b-42d3-a456-426614174101';
const time = '2026-10-11T10:00:00.000Z';
const later = '2026-10-11T10:01:00.000Z';
const reply = (body, status = 200) => Response.json(body, { status });
const post = (status = 'PENDING_REVIEW', extra = {}) => ({
  id,
  title: 'Recognize suspicious messages',
  body: 'Verify requests through a trusted channel.',
  category: 'PHISHING',
  status,
  submittedAt: time,
  approvedAt: status === 'APPROVED' ? later : null,
  removedAt: null,
  createdAt: time,
  updatedAt: time,
  author: { id: secondId, name: 'Synthetic Author' },
  history: [],
  ...extra,
});
const list = (items, page = 1, hasMore = false) => ({
  items: items.map((item) => {
    const summary = { ...item };
    delete summary.history;
    return summary;
  }),
  page,
  pageSize: 20,
  hasMore,
});

test('Phase 12B2 administrator community moderation interface', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Node',
    'Event',
    'MutationObserver',
    'CustomEvent',
  ])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new dom.window.Event('close'));
  };
  const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  const { AdminCommunityPage } = await vite.ssrLoadModule('/src/features/community/AdminCommunityPage.jsx');
  const mount = () => render(createElement(MemoryRouter, null, createElement(AdminCommunityPage)));
  t.after(async () => {
    cleanup();
    await vite.close();
    dom.window.close();
    delete globalThis.fetch;
  });
  t.afterEach(() => cleanup());

  await t.test('loading, queue filters, sorting, dates and pagination use the protected API', async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => {
      calls.push({ path, options });
      const page = Number(new URL(path, 'http://localhost').searchParams.get('page'));
      return reply(list([{ ...post(), id: page === 1 ? id : secondId }], page, page === 1));
    };
    mount();
    assert.match(document.body.textContent, /Loading community submissions/);
    await screen.findByRole('button', { name: 'Review post' });
    assert.ok(calls[0].path.includes('status=PENDING_REVIEW'));
    assert.equal(calls[0].options.credentials, 'include');
    fireEvent.change(screen.getByLabelText('Search posts or author'), { target: { value: 'trusted' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'APPROVED' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'PHISHING' } });
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'submitted_asc' } });
    fireEvent.change(screen.getByLabelText('Submitted from (UTC)'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Submitted to (UTC)'), { target: { value: '2026-10-11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      assert.ok(
        calls.some(
          ({ path }) =>
            path.includes('search=trusted') &&
            path.includes('status=APPROVED') &&
            path.includes('category=PHISHING') &&
            path.includes('sort=submitted_asc') &&
            path.includes('submittedFrom=2026-10-01') &&
            path.includes('submittedTo=2026-10-11'),
        ),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => assert.ok(calls.some(({ path }) => path.includes('page=2'))));
  });

  await t.test('detail renders authorized history; reason and confirmation gate decisions', async () => {
    let record = post();
    const writes = [];
    globalThis.fetch = async (path, options = {}) => {
      if (path.startsWith('/api/admin/community?')) return reply(list([record]));
      if (path === `/api/admin/community/${id}`) return reply({ post: record });
      if (path.endsWith('/approve') || path.endsWith('/remove')) {
        writes.push({ path, options, body: JSON.parse(options.body) });
        const action = path.endsWith('/approve') ? 'APPROVED' : 'REMOVED';
        record = {
          ...record,
          status: action,
          updatedAt: later,
          history: [
            ...record.history,
            {
              id: `decision-${writes.length}`,
              previousStatus: action === 'APPROVED' ? 'PENDING_REVIEW' : 'APPROVED',
              decision: action,
              reason: writes.at(-1).body.reason,
              createdAt: later,
              moderator: { id: secondId, name: 'Security Admin' },
            },
          ],
        };
        return reply({ post: record });
      }
      throw new Error(path);
    };
    mount();
    await screen.findByRole('button', { name: 'Review post' });
    fireEvent.click(screen.getByRole('button', { name: 'Review post' }));
    await screen.findByText('Submitted content');
    assert.match(document.body.textContent, /Verify requests through a trusted channel/);
    assert.match(document.body.textContent, /No moderation decisions yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Approve post' }));
    assert.equal(writes.length, 0);
    assert.match(document.body.textContent, /Enter a plain-text reason/);
    fireEvent.change(screen.getByLabelText(/Moderation reason/), { target: { value: 'Useful awareness guidance.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve post' }));
    assert.equal(writes.length, 0);
    const dialog = screen.getByRole('dialog');
    assert.match(dialog.textContent, /Useful awareness guidance/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm approve' }));
    await screen.findByText(/Post approved successfully/);
    assert.equal(writes[0].body.expectedUpdatedAt, time);
    assert.equal(writes[0].options.credentials, 'include');
    assert.match(document.body.textContent, /Security Admin/);
    assert.match(document.body.textContent, /Pending review → Approved/);
    assert.equal(screen.queryByRole('button', { name: 'Reject post' }), null);
    fireEvent.change(screen.getByLabelText(/Moderation reason/), { target: { value: 'No longer suitable.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove post' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm remove' }));
    await screen.findByText(/Post removed successfully/);
    assert.equal(writes[1].body.expectedUpdatedAt, later);
    assert.equal(screen.queryByRole('button', { name: 'Remove post' }), null);
  });

  await t.test('rejection and stale conflict preserve reason, reload latest, and require review', async () => {
    let record = post(),
      writes = 0,
      detailReads = 0;
    globalThis.fetch = async (path, options = {}) => {
      if (path.startsWith('/api/admin/community?')) return reply(list([record]));
      if (path === `/api/admin/community/${id}`) {
        detailReads++;
        return reply({ post: record });
      }
      if (path.endsWith('/reject')) {
        writes++;
        const body = JSON.parse(options.body);
        if (writes === 1) {
          record = post('PENDING_REVIEW', { updatedAt: later, body: 'Updated by another administrator.' });
          return reply({ error: { code: 'COMMUNITY_STALE', message: 'PRIVATE_DETAIL' } }, 409);
        }
        assert.equal(body.expectedUpdatedAt, later);
        record = {
          ...record,
          status: 'REJECTED',
          history: [
            {
              id: 'decision',
              previousStatus: 'PENDING_REVIEW',
              decision: 'REJECTED',
              reason: body.reason,
              createdAt: later,
              moderator: { id: secondId, name: 'Security Admin' },
            },
          ],
        };
        return reply({ post: record });
      }
      throw new Error(path);
    };
    mount();
    await screen.findByRole('button', { name: 'Review post' });
    fireEvent.click(screen.getByRole('button', { name: 'Review post' }));
    await screen.findByRole('button', { name: 'Reject post' });
    fireEvent.change(screen.getByLabelText(/Moderation reason/), { target: { value: 'Needs a source.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject post' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm reject' }));
    await screen.findByRole('button', { name: 'I have reviewed the latest post' });
    assert.ok(detailReads >= 2);
    assert.match(document.body.textContent, /Updated by another administrator/);
    assert.equal(screen.getByLabelText(/Moderation reason/).value, 'Needs a source.');
    assert.equal(screen.getByRole('button', { name: 'Reject post' }).disabled, true);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_DETAIL/);
    fireEvent.click(screen.getByRole('button', { name: 'I have reviewed the latest post' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject post' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm reject' }));
    await screen.findByText(/Post rejected successfully/);
    assert.equal(writes, 2);
  });

  await t.test('unreviewable attachment blocks approval without changing the post', async () => {
    const record = post();
    let writes = 0;
    globalThis.fetch = async (path) => {
      if (path.startsWith('/api/admin/community?')) return reply(list([record]));
      if (path === `/api/admin/community/${id}`) return reply({ post: record });
      if (path.endsWith('/approve')) {
        writes++;
        return reply({ error: { code: 'COMMUNITY_ATTACHMENTS_UNREVIEWED', message: 'PRIVATE_PATH' } }, 409);
      }
      throw new Error(path);
    };
    mount();
    await screen.findByRole('button', { name: 'Review post' });
    fireEvent.click(screen.getByRole('button', { name: 'Review post' }));
    await screen.findByRole('button', { name: 'Approve post' });
    fireEvent.change(screen.getByLabelText(/Moderation reason/), { target: { value: 'Reviewed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve post' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm approve' }));
    await screen.findByText(/attachments cannot be securely reviewed/);
    assert.equal(writes, 1);
    assert.equal(screen.getByLabelText(/Moderation reason/).value, 'Reviewed.');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_PATH|Post approved successfully/);
  });

  await t.test('decision-time MFA loss clears protected content and explains access', async () => {
    const record = post();
    globalThis.fetch = async (path) => {
      if (path.startsWith('/api/admin/community?')) return reply(list([record]));
      if (path === `/api/admin/community/${id}`) return reply({ post: record });
      if (path.endsWith('/approve')) return reply({ error: { code: 'MFA', message: 'PRIVATE_MFA' } }, 401);
      throw new Error(path);
    };
    mount();
    await screen.findByRole('button', { name: 'Review post' });
    fireEvent.click(screen.getByRole('button', { name: 'Review post' }));
    await screen.findByRole('button', { name: 'Approve post' });
    fireEvent.change(screen.getByLabelText(/Moderation reason/), { target: { value: 'Reviewed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve post' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm approve' }));
    await screen.findByText(/administrator session has expired/);
    assert.doesNotMatch(document.body.textContent, /Verify requests through a trusted channel|PRIVATE_MFA/);
  });

  await t.test('loading errors, retry, empty result, MFA and authorization failures stay private', async () => {
    let mode = 'failure';
    globalThis.fetch = async (path) => {
      if (path.startsWith('/api/admin/community?')) {
        if (mode === 'failure') return reply({ error: { code: 'FAIL', message: 'PRIVATE_ERROR' } }, 500);
        if (mode === 'empty') return reply(list([]));
        if (mode === 'mfa') return reply({ error: { code: 'MFA', message: 'PRIVATE_MFA' } }, 401);
        return reply({ error: { code: 'FORBIDDEN', message: 'PRIVATE_ROLE' } }, 403);
      }
      throw new Error(path);
    };
    mount();
    await screen.findByText('Community submissions could not be loaded');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_ERROR/);
    mode = 'empty';
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No matching submissions');
    mode = 'mfa';
    fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
    await screen.findByText(/administrator session has expired/);
    mode = 'forbidden';
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(/permissions do not allow community moderation/);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_MFA|PRIVATE_ROLE|Recognize suspicious messages/);
  });
});
