import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter, Route, Routes } from 'react-router';

const id = '123e4567-e89b-42d3-a456-426614174201';
const number = '123e4567-e89b-42d3-a456-426614174202';
const trainingId = '123e4567-e89b-42d3-a456-426614174203';
const certificate = { id, certificateNumber: number, trainingId, employeeName: 'Test Employee',
  trainingTitle: 'Recognizing phishing', completedAt: '2026-10-01T00:00:00.000Z',
  issuedAt: '2026-10-02T00:00:00.000Z', scorePercent: 90, status: 'ISSUED' };
const page = (items = [certificate], hasMore = false, current = 1) => ({ items, page: current, pageSize: 20, hasMore });
const reply = (body, status = 200) => Response.json(body, { status });

test('Phase 11D2 certificate interfaces use protected mocked API responses', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { EmployeeCertificateListPage, EmployeeCertificateDetailPage } = await vite.ssrLoadModule('/src/features/certificates/EmployeeCertificatePages.jsx');
  const { AdminCertificateListPage, AdminCertificateDetailPage } = await vite.ssrLoadModule('/src/features/certificates/AdminCertificatePages.jsx');
  const { CourseCertificateLink } = await vite.ssrLoadModule('/src/features/certificates/CourseCertificateLink.jsx');
  const route = (path, pattern, Page) => render(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(Routes, null, createElement(Route, { path: pattern, element: createElement(Page) }))));
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(() => cleanup());

  await t.test('employee list loads, explains eligibility, pages, and shows empty/error states', async () => {
    let resolveFirst; const calls = [];
    globalThis.fetch = async (path, options) => { calls.push({ path, options });
      if (calls.length === 1) return new Promise((resolve) => { resolveFirst = resolve; });
      if (calls.length === 2) return reply(page([], false, 2));
      return reply({ error: { code: 'FAIL', message: 'PRIVATE_DETAIL' } }, 500); };
    route('/certificates', '/certificates', EmployeeCertificateListPage);
    assert.match(document.body.textContent, /Loading certificates/);
    await waitFor(() => assert.ok(resolveFirst)); resolveFirst(reply(page([certificate], true)));
    await screen.findByText('Recognizing phishing');
    assert.match(document.body.textContent, /Monthly quizzes do not issue training certificates/);
    assert.match(document.body.textContent, /90%/);
    assert.equal(screen.getByRole('link', { name: 'View certificate details' }).getAttribute('href'), `/certificates/${id}`);
    assert.equal(calls[0].options.credentials, 'include');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('No earned certificates yet');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('Certificates unavailable');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_DETAIL/);
  });

  await t.test('employee details download authenticated PDF Blob and revoke object URL', async () => {
    const calls = [], revoked = []; let clicked = '';
    const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL, oldClick = dom.window.HTMLAnchorElement.prototype.click;
    URL.createObjectURL = () => 'blob:certificate-test'; URL.revokeObjectURL = (value) => revoked.push(value);
    dom.window.HTMLAnchorElement.prototype.click = function click() { clicked = this.download; };
    t.after(() => { URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; dom.window.HTMLAnchorElement.prototype.click = oldClick; });
    globalThis.fetch = async (path, options) => { calls.push({ path, options });
      if (path.endsWith('/pdf')) return new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), { headers: { 'Content-Type': 'application/pdf' } });
      return reply({ certificate }); };
    route(`/certificates/${id}`, '/certificates/:id', EmployeeCertificateDetailPage);
    await screen.findByRole('button', { name: 'Download PDF' });
    assert.match(document.body.textContent, /Test Employee/);
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => assert.ok(clicked.endsWith('.pdf')));
    assert.equal(calls.find((call) => call.path.endsWith('/pdf')).options.credentials, 'include');
    cleanup(); assert.deepEqual(revoked, ['blob:certificate-test']);
  });

  await t.test('download and foreign-detail failures clear private data and report safe errors', async () => {
    let denied = false;
    globalThis.fetch = async (path) => path.endsWith('/pdf') ? reply({ error: { code: 'FORBIDDEN', message: 'PRIVATE_PDF' } }, 403)
      : denied ? reply({ error: { code: 'CERTIFICATE_NOT_FOUND', message: 'PRIVATE_OWNER' } }, 404) : reply({ certificate });
    route(`/certificates/${id}`, '/certificates/:id', EmployeeCertificateDetailPage);
    await screen.findByRole('button', { name: 'Download PDF' });
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await screen.findByRole('alert');
    assert.doesNotMatch(document.body.textContent, /PRIVATE_PDF/);
    cleanup(); denied = true;
    route(`/certificates/${id}`, '/certificates/:id', EmployeeCertificateDetailPage);
    await screen.findByText('Certificates unavailable');
    assert.doesNotMatch(document.body.textContent, /Recognizing phishing|PRIVATE_OWNER/);
  });

  await t.test('administrator filters, paginates and verifies success or not-found', async () => {
    const calls = []; let missing = false, denied = false;
    globalThis.fetch = async (path) => { calls.push(path);
      if (path.includes('/verify/')) return denied ? reply({ error: { code: 'FORBIDDEN', message: 'PRIVATE' } }, 403) : missing ? reply({ error: { code: 'CERTIFICATE_NOT_FOUND' } }, 404) : reply({ certificate, trainingCompletionConfirmed: true });
      const current = Number(new URL(path, 'http://localhost').searchParams.get('page'));
      return reply(page([certificate], current === 1, current)); };
    route('/admin/certificates', '/admin/certificates', AdminCertificateListPage);
    await waitFor(() => assert.equal(screen.getAllByText('Recognizing phishing').length, 2));
    fireEvent.change(screen.getByLabelText('Employee, course, or number'), { target: { value: 'Test Employee' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ISSUED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => assert.ok(calls.some((path) => path.includes('search=Test+Employee') && path.includes('status=ISSUED'))));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => assert.ok(calls.some((path) => path.includes('page=2'))));
    assert.ok(calls.every((path) => !path.includes('sort=')));
    fireEvent.change(screen.getByLabelText('Unique certificate number'), { target: { value: number } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify certificate' }));
    await screen.findByText('Training completion confirmed');
    missing = true; fireEvent.click(screen.getByRole('button', { name: 'Verify certificate' }));
    await screen.findByText('No certificate was found for that number.');
    assert.equal(screen.queryByText('Training completion confirmed'), null);
    denied = true; fireEvent.click(screen.getByRole('button', { name: 'Verify certificate' }));
    await screen.findByText('Certificates unavailable');
    assert.equal(screen.queryByText('Recognizing phishing'), null);
  });

  await t.test('administrator MFA and authorization errors hide protected rows', async () => {
    let status = 401;
    globalThis.fetch = async () => reply({ error: { code: 'PRIVATE', message: 'PRIVATE_MFA' } }, status);
    route('/admin/certificates', '/admin/certificates', AdminCertificateListPage);
    await screen.findByText('Certificates unavailable');
    assert.match(document.body.textContent, /session has expired/);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_MFA|Recognizing phishing/);
    cleanup(); status = 403;
    route(`/admin/certificates/${id}`, '/admin/certificates/:id', AdminCertificateDetailPage);
    await screen.findByText('Certificates unavailable');
    assert.match(document.body.textContent, /permissions do not allow/);
  });

  await t.test('administrator detail confirms course evidence and offers authorized PDF', async () => {
    const calls = [];
    globalThis.fetch = async (path) => { calls.push(path);
      if (path.includes('/verify/')) return reply({ certificate, trainingCompletionConfirmed: true });
      return reply({ certificate }); };
    route(`/admin/certificates/${id}`, '/admin/certificates/:id', AdminCertificateDetailPage);
    await screen.findByRole('button', { name: 'Verify completion' });
    assert.ok(screen.getByRole('button', { name: 'Download PDF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify completion' }));
    await screen.findByText('The stored training completion and qualifying course result are confirmed.');
    assert.ok(calls.some((path) => path === `/api/admin/certificates/verify/${number}`));
  });

  await t.test('completed training links only to a server-confirmed issued certificate', async () => {
    let available = true;
    globalThis.fetch = async () => reply(page(available ? [certificate] : []));
    render(createElement(MemoryRouter, null, createElement(CourseCertificateLink, { trainingId })));
    await screen.findByRole('link', { name: 'View earned certificate' });
    assert.equal(screen.getByRole('link', { name: 'View earned certificate' }).getAttribute('href'), `/certificates/${id}`);
    cleanup(); available = false;
    render(createElement(MemoryRouter, null, createElement(CourseCertificateLink, { trainingId })));
    await screen.findByText(/A certificate is not available/);
    assert.equal(screen.queryByRole('link', { name: 'View earned certificate' }), null);
  });
});
