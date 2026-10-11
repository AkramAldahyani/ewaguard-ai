import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router';

const id = '123e4567-e89b-42d3-a456-426614174200';
const otherId = '123e4567-e89b-42d3-a456-426614174201';
const ackId = '123e4567-e89b-42d3-a456-426614174202';
const time = '2026-10-11T10:00:00.000Z';
const reply = (body, status = 200) => Response.json(body, { status });
const post = (status = 'APPROVED', extra = {}) => ({ id, title: 'Recognize phishing messages',
  body: 'Verify unusual requests using a trusted channel.', category: 'PHISHING', status,
  submittedAt: time, approvedAt: status === 'APPROVED' ? time : null, createdAt: time,
  authorName: 'Synthetic A.', ...extra });
const page = (items, number = 1, hasMore = false) => ({ items, page: number, pageSize: 20, hasMore });

test('Phase 12A2 employee security community interface', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { EmployeeCommunityPage } = await vite.ssrLoadModule('/src/features/community/EmployeeCommunityPage.jsx');
  const mount = () => render(createElement(MemoryRouter, null, createElement(EmployeeCommunityPage)));
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(() => cleanup());

  await t.test('approved feed, search, category, pagination and full detail use authenticated endpoints', async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => { calls.push({ path, options });
      if (path.startsWith('/api/community?')) { const number = Number(new URL(path, 'http://localhost').searchParams.get('page'));
        return reply(page([post('APPROVED', { id: number === 1 ? id : otherId }), post('PENDING_REVIEW', { id: 'unexpected' })], number, number === 1)); }
      if (path === `/api/community/${id}`) return reply({ post: post('APPROVED', { body: 'Full approved guidance and steps.' }) });
      throw new Error(path); };
    mount(); assert.match(document.body.textContent, /Loading community posts/);
    await screen.findByRole('button', { name: 'View post' });
    assert.equal(screen.getAllByRole('button', { name: 'View post' }).length, 1);
    assert.equal(calls[0].options.credentials, 'include');
    assert.doesNotMatch(document.body.textContent, /Pending review/);
    fireEvent.change(screen.getByLabelText('Search title or description'), { target: { value: 'phishing' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'PHISHING' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => assert.ok(calls.some(({ path }) => path.includes('search=phishing') && path.includes('category=PHISHING'))));
    fireEvent.click(screen.getByRole('button', { name: 'View post' }));
    await screen.findByText('Full approved guidance and steps.');
    assert.ok(calls.some(({ path }) => path === `/api/community/${id}`));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => assert.ok(calls.some(({ path }) => path.includes('page=2'))));
  });

  await t.test('own submissions show private statuses and detail without moderator history', async () => {
    const calls = [];
    const own = [post('PENDING_REVIEW'), post('REJECTED', { id: otherId, title: 'Rejected warning' }),
      post('REMOVED', { id: 'removed-post', title: 'Removed tip' })];
    globalThis.fetch = async (path, options) => { calls.push({ path, options });
      if (path.startsWith('/api/community?')) return reply(page([]));
      if (path.startsWith('/api/community/mine?')) return reply(page(own));
      if (path === `/api/community/mine/${otherId}`) return reply({ post: own[1] });
      throw new Error(path); };
    mount(); await screen.findByText('No approved posts yet');
    fireEvent.click(screen.getByRole('tab', { name: 'My submissions' }));
    await screen.findByText('Rejected warning');
    assert.match(document.body.textContent, /Pending review|Rejected|Removed/);
    fireEvent.change(screen.getByLabelText('Moderation status'), { target: { value: 'REJECTED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => assert.ok(calls.some(({ path }) => path.includes('/mine?') && path.includes('status=REJECTED'))));
    fireEvent.click(screen.getAllByRole('button', { name: 'View post' })[1]);
    await screen.findByText(/This post was not approved and remains private to you/);
    assert.ok(calls.some(({ path }) => path === `/api/community/mine/${otherId}`));
    assert.doesNotMatch(document.body.textContent, /moderator|internal reason/i);
  });

  await t.test('refresh reflects approval and removal without retaining an old shared detail', async () => {
    let status = 'PENDING_REVIEW';
    globalThis.fetch = async (path) => {
      if (path.startsWith('/api/community?')) return reply(page(status === 'APPROVED' ? [post()] : []));
      if (path.startsWith('/api/community/mine?')) return reply(page([post(status)]));
      if (path === `/api/community/${id}`) return status === 'APPROVED'
        ? reply({ post: post('APPROVED', { body: 'Published details.' }) })
        : reply({ error: { code: 'COMMUNITY_NOT_FOUND' } }, 404);
      throw new Error(path);
    };
    mount(); await screen.findByText('No approved posts yet');
    fireEvent.click(screen.getByRole('tab', { name: 'My submissions' }));
    await screen.findByText('Recognize phishing messages');
    assert.match(document.body.textContent, /Pending review/);
    status = 'APPROVED'; fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => assert.match(document.body.textContent, /Approved/));
    fireEvent.click(screen.getByRole('tab', { name: 'Community feed' }));
    await screen.findByRole('button', { name: 'View post' });
    fireEvent.click(screen.getByRole('button', { name: 'View post' }));
    await screen.findByText('Published details.');
    status = 'REMOVED'; fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('No approved posts yet');
    assert.doesNotMatch(document.body.textContent, /Published details/);
    fireEvent.click(screen.getByRole('tab', { name: 'My submissions' }));
    await screen.findByText('Recognize phishing messages');
    assert.match(document.body.textContent, /Removed/);
  });

  await t.test('create validates plain text and active notice before review; acknowledgement precedes pending submission', async () => {
    const calls = []; let submitted;
    globalThis.fetch = async (path, options) => { calls.push({ path, options });
      if (path.startsWith('/api/community?')) return reply(page([]));
      if (path.startsWith('/api/community/mine?')) return reply(page([post('PENDING_REVIEW', { title: 'Safe sharing tip' })]));
      if (path === '/api/disclaimers/acknowledge') return reply({ acknowledgement: { id: ackId, context: 'COMMUNITY_POST' } }, 201);
      if (path === '/api/community' && options.method === 'POST') { submitted = JSON.parse(options.body);
        return reply({ post: post('PENDING_REVIEW', { title: submitted.title }), alreadySubmitted: false }); }
      throw new Error(path); };
    mount(); fireEvent.click(screen.getByRole('tab', { name: 'Create post' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review submission' }));
    assert.match(document.body.textContent, /Enter a plain-text title/);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: '<script>bad</script>' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'SECURITY_TIP' } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Use a trusted reporting channel.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review submission' }));
    assert.match(document.body.textContent, /plain-text title/);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Safe sharing tip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review submission' }));
    assert.match(document.body.textContent, /Read and acknowledge/);
    assert.equal(calls.filter(({ path }) => path === '/api/disclaimers/acknowledge').length, 0);
    const checkbox = screen.getByRole('checkbox'); assert.equal(checkbox.checked, false);
    assert.match(document.body.textContent, /API keys|Confidential|Sensitive customer|Internal documents/);
    assert.match(document.body.textContent, /approved cybersecurity reporting channel/);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Review submission' }));
    assert.equal(submitted, undefined);
    const dialog = screen.getByRole('dialog'); assert.match(dialog.textContent, /Safe sharing tip|Use a trusted reporting channel/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit for review' }));
    await screen.findByText(/Your post was submitted for administrator review/);
    assert.equal(submitted.acknowledgementId, ackId);
    assert.deepEqual(Object.keys(submitted).sort(), ['acknowledgementId', 'body', 'category', 'title']);
    assert.ok(calls.findIndex(({ path }) => path === '/api/disclaimers/acknowledge') < calls.findIndex(({ path, options }) => path === '/api/community' && options.method === 'POST'));
    assert.equal(calls.find(({ path }) => path === '/api/disclaimers/acknowledge').options.credentials, 'include');
    await screen.findByText('Safe sharing tip');
    assert.equal(screen.getByRole('tab', { name: 'My submissions' }).getAttribute('aria-selected'), 'true');
  });

  await t.test('submission acknowledgement failure and denied write keep draft and show safe error', async () => {
    let mode = 'ack';
    globalThis.fetch = async (path) => { if (path.startsWith('/api/community?')) return reply(page([]));
      if (path === '/api/disclaimers/acknowledge') return mode === 'ack' ? reply({ error: { code: 'FAIL', message: 'PRIVATE_ACK' } }, 500)
        : reply({ acknowledgement: { id: ackId } });
      if (path === '/api/community') return reply({ error: { code: 'COMMUNITY_ACKNOWLEDGEMENT_REQUIRED', message: 'PRIVATE_POST' } }, 403);
      throw new Error(path); };
    mount(); fireEvent.click(screen.getByRole('tab', { name: 'Create post' }));
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Safe tip' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'SECURITY_TIP' } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Verify through a trusted channel.' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Review submission' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit for review' }));
    await screen.findByText(/post could not be submitted/i);
    assert.equal(screen.getByLabelText(/Title/).value, 'Safe tip');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_ACK/);
    mode = 'post'; fireEvent.click(screen.getByRole('button', { name: 'Review submission' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit for review' }));
    await screen.findByText(/acknowledgement expired/);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_POST/);
  });

  await t.test('empty, retry, denied feed and cross-user detail errors clear private content', async () => {
    let mode = 'loadingError'; const calls = [];
    globalThis.fetch = async (path, options) => { calls.push({ path, options });
      if (path.startsWith('/api/community?')) {
        if (mode === 'loadingError') return reply({ error: { code: 'FAIL', message: 'PRIVATE_LOAD' } }, 500);
        if (mode === 'empty') return reply(page([]));
        if (mode === 'denied') return reply({ error: { code: 'FORBIDDEN', message: 'PRIVATE_ROLE' } }, 403);
        if (mode === 'expired') return reply({ error: { code: 'UNAUTHORIZED', message: 'PRIVATE_SESSION' } }, 401);
        return reply(page([post()]));
      }
      if (path === `/api/community/${id}`) return reply({ error: { code: 'COMMUNITY_NOT_FOUND', message: 'PRIVATE_DETAIL' } }, 404);
      throw new Error(path); };
    mount(); await screen.findByText('Community posts could not be loaded');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_LOAD/);
    mode = 'empty'; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No approved posts yet');
    mode = 'ok'; fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByRole('button', { name: 'View post' });
    fireEvent.click(screen.getByRole('button', { name: 'View post' }));
    await screen.findByText('Post could not be loaded');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_DETAIL/);
    mode = 'denied'; fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText(/permissions do not allow this community action/);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_ROLE|Verify unusual requests using a trusted channel/);
    mode = 'expired'; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(/session has expired/);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_SESSION/);
  });
});
