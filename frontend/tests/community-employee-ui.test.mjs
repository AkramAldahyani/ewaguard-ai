import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router';

const id = '123e4567-e89b-42d3-a456-426614174200';
const ackId = '123e4567-e89b-42d3-a456-426614174202';
const time = '2026-10-11T10:00:00.000Z';
const reply = (body, status = 200) => Response.json(body, { status });
const post = (status = 'APPROVED', extra = {}) => ({ id, title: 'Recognize phishing messages',
  body: 'Verify unusual requests using a trusted channel.', category: 'PHISHING', status,
  submittedAt: time, approvedAt: status === 'APPROVED' ? time : null, createdAt: time,
  authorName: 'Synthetic A.', ...extra });
const page = (items, number = 1, hasMore = false) => ({ items, page: number, pageSize: 20, hasMore });

test('Phase A employee community social feed', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { EmployeeCommunityPage } = await vite.ssrLoadModule('/src/features/community/EmployeeCommunityPage.jsx');
  const { AuthContext } = await vite.ssrLoadModule('/src/context/auth-context.js');
  const mount = () => render(createElement(MemoryRouter, null, createElement(AuthContext.Provider,
    { value: { user: { firstName: 'Synthetic', lastName: 'Employee', role: 'EMPLOYEE' } } }, createElement(EmployeeCommunityPage))));
  const openComposer = () => { fireEvent.click(screen.getByRole('button', { name: 'Create Post' })); return within(screen.getByRole('dialog')); };
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(() => cleanup());

  await t.test('inline expansion, authenticated search, category and appended deduplicated pagination', async () => {
    const calls = [], full = 'Check requests carefully. '.repeat(35) + 'Final guidance.';
    globalThis.fetch = async (path, options) => {
      calls.push({ path, options });
      const number = Number(new URL(path, 'http://localhost').searchParams.get('page'));
      return reply(page(number === 1 ? [post('APPROVED', { body: full }), post('PENDING_REVIEW', { id: 'hidden', title: 'Private pending' })]
        : [post('APPROVED', { body: full }), post('APPROVED', { id: 'second', title: 'Second post' })], number, number === 1));
    };
    mount(); assert.match(document.body.textContent, /Loading community posts/);
    assert.equal(screen.queryByRole('region', { name: 'Share with your community' }), null);
    assert.doesNotMatch(document.body.textContent, /Every post is reviewed before publication/);
    assert.ok(screen.getByRole('button', { name: 'Create Post' }));
    await screen.findByText('Recognize phishing messages');
    assert.doesNotMatch(document.body.textContent, /Private pending|Post details|Select a post|View post|Text posts only/);
    assert.equal(calls[0].options.credentials, 'include');
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    assert.ok(document.body.textContent.includes(full)); assert.equal(calls.length, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Second post'); assert.equal(screen.getAllByRole('article').length, 2);
    fireEvent.change(screen.getByLabelText('Search title or description'), { target: { value: 'phishing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search posts' }));
    await waitFor(() => assert.ok(calls.some(({ path }) => path.includes('search=phishing') && path.includes('page=1'))));
    await screen.findByText('Recognize phishing messages');
    fireEvent.change(screen.getByLabelText('Filter by category'), { target: { value: 'PHISHING' } });
    await waitFor(() => assert.ok(calls.some(({ path }) => path.includes('category=PHISHING') && path.includes('search=phishing'))));
    await waitFor(() => assert.equal(screen.getAllByRole('article').length, 1));
  });

  await t.test('My Posts shows statuses and rejection guidance without internal notes', async () => {
    const calls = [];
    globalThis.fetch = async (path) => { calls.push(path); return reply(page(path.includes('/mine?') ? [post('PENDING_REVIEW'),
      post('REJECTED', { id: 'rejected', title: 'Rejected warning', moderationActions: [{ reason: 'PRIVATE_REASON' }] }),
      post('REMOVED', { id: 'removed', title: 'Removed tip' })] : [])); };
    mount(); await screen.findByText('Start a stronger security conversation');
    fireEvent.click(screen.getByRole('tab', { name: 'My Posts' }));
    await screen.findByText('Rejected warning');
    assert.match(document.body.textContent, /Pending review/);
    assert.match(document.body.textContent, /A reason has not been shared with you/);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_REASON/);
    fireEvent.change(screen.getByLabelText('Moderation status'), { target: { value: 'REJECTED' } });
    await waitFor(() => assert.ok(calls.some((path) => path.includes('/mine?') && path.includes('status=REJECTED'))));
  });

  await t.test('refresh reflects publication and removal', async () => {
    let status = 'PENDING_REVIEW';
    globalThis.fetch = async (path) => reply(page(path.includes('/mine?') || status === 'APPROVED' ? [post(status)] : []));
    mount(); await screen.findByText('Start a stronger security conversation');
    fireEvent.click(screen.getByRole('tab', { name: 'My Posts' })); await screen.findByText('Pending review');
    status = 'APPROVED'; fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); await screen.findByText('Published');
    fireEvent.click(screen.getByRole('tab', { name: 'Latest' })); await screen.findByText('Recognize phishing messages');
    status = 'REMOVED'; fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('Start a stronger security conversation'); assert.equal(screen.queryByRole('article'), null);
  });

  await t.test('modal validates content and unchecked acknowledgement; optional title submits pending', async () => {
    const calls = []; let submitted;
    globalThis.fetch = async (path, options) => { calls.push({ path, options });
      if (path.includes('/mine?')) return reply(page([post('PENDING_REVIEW', { title: '' })]));
      if (path.startsWith('/api/community?')) return reply(page([]));
      if (path.includes('acknowledge')) return reply({ acknowledgement: { id: ackId } });
      submitted = JSON.parse(options.body); return reply({ post: post('PENDING_REVIEW'), alreadySubmitted: false });
    };
    mount(); const dialog = openComposer();
    assert.equal(dialog.getByRole('checkbox').checked, false);
    fireEvent.change(dialog.getByLabelText(/Post title/), { target: { value: '<script>bad</script>' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Submit Post' }));
    assert.match(dialog.getByRole('alert').textContent, /plain-text title/);
    fireEvent.change(dialog.getByLabelText(/Post title/), { target: { value: '' } });
    fireEvent.change(dialog.getByLabelText('Category'), { target: { value: 'SECURITY_TIP' } });
    fireEvent.change(dialog.getByLabelText('Description'), { target: { value: 'Use a trusted reporting channel.' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Submit Post' }));
    assert.match(dialog.getByRole('alert').textContent, /Read and acknowledge/);
    assert.equal(calls.some(({ path }) => path.includes('acknowledge')), false);
    fireEvent.click(dialog.getByRole('checkbox')); fireEvent.click(dialog.getByRole('button', { name: 'Submit Post' }));
    await screen.findByText('Post submitted for review. It will appear in the community once approved.');
    assert.equal(submitted.title, ''); assert.equal(submitted.acknowledgementId, ackId);
    assert.deepEqual(Object.keys(submitted).sort(), ['acknowledgementId', 'body', 'category', 'title']);
    assert.ok(calls.findIndex(({ path }) => path.includes('acknowledge')) < calls.findIndex(({ path }) => path === '/api/community'));
    assert.equal(screen.getByRole('tab', { name: 'My Posts' }).getAttribute('aria-selected'), 'true');
    assert.equal(screen.queryByRole('dialog'), null);
  });

  await t.test('submission failures preserve drafts and expired acknowledgement requires a fresh check', async () => {
    let mode = 'ack';
    globalThis.fetch = async (path) => {
      if (path.startsWith('/api/community?')) return reply(page([]));
      if (path.includes('acknowledge')) return mode === 'ack' ? reply({ error: { message: 'PRIVATE_ACK' } }, 500) : reply({ acknowledgement: { id: ackId } });
      return reply({ error: { code: 'COMMUNITY_ACKNOWLEDGEMENT_REQUIRED', message: 'PRIVATE_POST' } }, 403);
    };
    mount(); const dialog = openComposer();
    fireEvent.change(dialog.getByLabelText(/Post title/), { target: { value: 'Safe tip' } });
    fireEvent.change(dialog.getByLabelText('Category'), { target: { value: 'SECURITY_TIP' } });
    fireEvent.change(dialog.getByLabelText('Description'), { target: { value: 'Verify through a trusted channel.' } });
    fireEvent.click(dialog.getByRole('checkbox')); fireEvent.click(dialog.getByRole('button', { name: 'Submit Post' }));
    await dialog.findByText(/post could not be submitted/i);
    assert.equal(dialog.getByLabelText(/Post title/).value, 'Safe tip');
    mode = 'post'; fireEvent.click(dialog.getByRole('button', { name: 'Submit Post' }));
    await dialog.findByText(/acknowledgement expired/); assert.equal(dialog.getByRole('checkbox').checked, false);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_ACK|PRIVATE_POST/);
  });

  await t.test('load-more errors preserve cards, retry same page, and authorization errors clear them', async () => {
    let mode = 'ok'; const calls = [];
    globalThis.fetch = async (path) => { calls.push(path);
      if (mode === 'expired') return reply({ error: { message: 'PRIVATE_SESSION' } }, 401);
      if (path.includes('page=2') && mode === 'fail') return reply({ error: { message: 'PRIVATE_LOAD' } }, 500);
      return reply(page([post()], path.includes('page=2') ? 2 : 1, !path.includes('page=2')));
    };
    mount(); await screen.findByText('Recognize phishing messages');
    mode = 'fail'; fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('alert'); assert.equal(screen.getAllByRole('article').length, 1);
    mode = 'ok'; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('You’re all caught up.');
    assert.equal(calls.filter((path) => path.includes('page=2')).length, 2);
    mode = 'expired'; fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText(/session has expired/); assert.equal(screen.queryByRole('article'), null);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_SESSION|PRIVATE_LOAD/);
  });

  await t.test('C1 likes update optimistically, serialize clicks, persist and roll back failures', async () => {
    let resolveWrite, fail = false, writes = 0;
    globalThis.fetch = async (_path, options) => {
      if (options.method === 'PUT') {
        writes++; assert.equal(options.credentials, 'include');
        assert.deepEqual(JSON.parse(options.body), { active: writes === 1 });
        if (fail) return reply({ error: { message: 'PRIVATE_FAILURE' } }, 500);
        return new Promise((resolve) => { resolveWrite = resolve; });
      }
      return reply(page([post('APPROVED', { liked: false, saved: false, likeCount: 3 })]));
    };
    mount(); await screen.findByText('Recognize phishing messages');
    fireEvent.click(screen.getByRole('button', { name: 'Like post' }));
    assert.equal(screen.getByRole('button', { name: 'Unlike post' }).disabled, true);
    assert.ok(screen.getByLabelText('4 likes'));
    fireEvent.click(screen.getByRole('button', { name: 'Unlike post' })); assert.equal(writes, 1);
    resolveWrite(reply({ engagement: { liked: true, saved: false, likeCount: 4 } }));
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Unlike post' }).disabled, false));
    fail = true; fireEvent.click(screen.getByRole('button', { name: 'Unlike post' }));
    await screen.findByRole('alert'); assert.ok(screen.getByLabelText('4 likes'));
    assert.equal(screen.getByRole('button', { name: 'Unlike post' }).getAttribute('aria-pressed'), 'true');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_FAILURE/);
  });

  await t.test('C1 Saved navigation persists state, filters, and removes unsaved cards', async () => {
    let saved = false; const calls = [];
    globalThis.fetch = async (path, options) => {
      calls.push(path);
      if (options.method === 'PUT') { saved = JSON.parse(options.body).active; return reply({ engagement: { liked: false, saved, likeCount: 0 } }); }
      return reply(page(path.includes('/saved?') && !saved ? [] : [post('APPROVED', { saved })]));
    };
    mount(); await screen.findByText('Recognize phishing messages');
    fireEvent.click(screen.getByRole('button', { name: 'Save post' }));
    await screen.findByRole('button', { name: 'Unsave post' });
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Unsave post' }).disabled, false));
    fireEvent.click(screen.getByRole('tab', { name: 'Saved' })); await screen.findByText('Recognize phishing messages');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); await screen.findByText('Recognize phishing messages');
    assert.equal(screen.getByRole('button', { name: 'Unsave post' }).getAttribute('aria-pressed'), 'true');
    fireEvent.change(screen.getByLabelText('Filter by category'), { target: { value: 'PHISHING' } });
    await screen.findByText('Recognize phishing messages'); assert.ok(calls.some((path) => path.includes('/saved?') && path.includes('category=PHISHING')));
    fireEvent.click(screen.getByRole('button', { name: 'Unsave post' })); await screen.findByText('No matching posts');
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]); await screen.findByText('No saved posts yet');
    fireEvent.click(screen.getByRole('button', { name: 'Browse latest posts' })); await screen.findByText('Recognize phishing messages');
    assert.ok(screen.getByRole('button', { name: 'Save post' }));
  });

  await t.test('C1 pending posts have no engagement buttons and unmount aborts writes', async () => {
    let writeSignal, resolveWrite;
    globalThis.fetch = async (path, options) => {
      if (options.method === 'PUT') { writeSignal = options.signal; return new Promise((resolve) => { resolveWrite = resolve; }); }
      return reply(page([post(path.includes('/mine?') ? 'PENDING_REVIEW' : 'APPROVED')]));
    };
    const view = mount(); await screen.findByText('Recognize phishing messages');
    fireEvent.click(screen.getByRole('tab', { name: 'My Posts' })); await screen.findByText('Recognize phishing messages');
    assert.equal(screen.queryByRole('button', { name: 'Like post' }), null);
    assert.equal(screen.queryByRole('button', { name: 'Save post' }), null);
    fireEvent.click(screen.getByRole('tab', { name: 'Latest' })); await screen.findByText('Recognize phishing messages');
    fireEvent.click(screen.getByRole('button', { name: 'Like post' })); view.unmount(); assert.equal(writeSignal.aborted, true);
    resolveWrite(reply({ engagement: { liked: true, saved: false, likeCount: 1 } }));
  });

  await t.test('late response cannot overwrite a newer tab; unmount cancels reads', async () => {
    let resolveFeed, signal;
    globalThis.fetch = async (path, options) => {
      if (path.includes('/mine?')) return reply(page([post('PENDING_REVIEW', { title: 'Own submission' })]));
      signal = options.signal; return new Promise((resolve) => { resolveFeed = resolve; });
    };
    const view = mount(); fireEvent.click(screen.getByRole('tab', { name: 'My Posts' }));
    await screen.findByText('Own submission'); assert.equal(signal.aborted, true);
    resolveFeed(reply(page([post()])));
    await waitFor(() => assert.equal(screen.queryByText('Recognize phishing messages'), null));
    fireEvent.click(screen.getByRole('tab', { name: 'Latest' }));
    view.unmount(); assert.equal(signal.aborted, true); resolveFeed(reply(page([])));
  });
});
