import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter, Route, Routes } from 'react-router';

const courseId = '123e4567-e89b-42d3-a456-426614174000';
const assignmentId = '123e4567-e89b-42d3-a456-426614174001';
const employeeId = '123e4567-e89b-42d3-a456-426614174002';
const time = '2026-10-10T00:00:00.000Z';
const sections = [{ key: 'introduction', title: 'Introduction', body: 'Read this introduction.' }, { key: 'key-takeaways', title: 'Key takeaways', body: 'Remember the approved process.' }];
const baseCourse = () => ({ id: courseId, title: 'Recognize suspicious requests', description: 'Practical training overview.', topic: 'PHISHING', estimatedMinutes: 6,
  status: 'DRAFT', version: 1, requiresQuiz: true, learningObjectives: ['Identify warning signs.'], content: { version: 1, sections },
  createdAt: time, updatedAt: time, publishedAt: null, reviewedAt: null, createdBy: { firstName: 'Security', lastName: 'Trainer' }, reviewedBy: null });
const reply = (body, status = 200) => Response.json(body, { status });

test('training React interaction workflows with mocked authenticated APIs', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(async () => { cleanup(); await server.close(); dom.window.close(); delete globalThis.fetch; });
  const { AdminTrainingDetailPage, AdminTrainingListPage } = await server.ssrLoadModule('/src/features/training/AdminTrainingPages.jsx');
  const { EmployeeTrainingDetailPage, EmployeeTrainingListPage } = await server.ssrLoadModule('/src/features/training/EmployeeTrainingPages.jsx');
  const route = (path, node) => render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null,
    createElement(Route, { path: path.replace(courseId, ':id').replace(assignmentId, ':id'), element: createElement(node) }))));
  t.afterEach(() => cleanup());

  await t.test('administrator list loads, searches, filters, pages and retries errors', async () => {
    const calls = []; let failure = true;
    globalThis.fetch = async (path) => { calls.push(path); if (failure) return reply({ error: { code: 'FAIL', message: 'PRIVATE_SERVER_DETAIL' } }, 500);
      const page = Number(new URL(path, 'http://localhost').searchParams.get('page'));
      return reply({ items: [{ ...baseCourse(), id: page === 1 ? courseId : employeeId }], page, pageSize: 20, hasMore: page === 1 }); };
    route('/admin/training', AdminTrainingListPage);
    assert.match(document.body.textContent, /Loading training/);
    await screen.findByText('Training could not be loaded'); assert.doesNotMatch(document.body.textContent, /PRIVATE_SERVER_DETAIL/);
    failure = false; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('link', { name: 'Manage' });
    fireEvent.change(screen.getByLabelText('Search title or description'), { target: { value: 'suspicious' } });
    fireEvent.change(screen.getByLabelText('Publication status'), { target: { value: 'DRAFT' } });
    fireEvent.change(screen.getByLabelText('Sort all results'), { target: { value: 'title_asc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => assert.ok(calls.some((path) => path.includes('search=suspicious') && path.includes('sort=title_asc') && path.includes('status=DRAFT'))));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => assert.ok(calls.some((path) => path.includes('page=2') && path.includes('search=suspicious'))));
  });

  await t.test('administrator creates a structured plain-text draft', async () => {
    let submitted;
    globalThis.fetch = async (path, options) => { if (path === '/api/admin/training' && options.method === 'POST') { submitted = JSON.parse(options.body); return reply({ program: { id: courseId } }); } return reply({ program: baseCourse() }); };
    route('/admin/training/new', AdminTrainingDetailPage);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Recognize suspicious requests' } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Practical training overview.' } });
    fireEvent.change(screen.getByLabelText(/Objective 1/), { target: { value: 'Identify warning signs.' } });
    fireEvent.change(document.getElementById('section-body-0'), { target: { value: 'Read this introduction.' } });
    fireEvent.change(document.getElementById('section-body-1'), { target: { value: 'Remember the approved process.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => assert.equal(submitted?.title, 'Recognize suspicious requests'));
    assert.deepEqual(submitted.content.sections.map((section) => section.key), ['introduction', 'key-takeaways']);
    assert.ok(!('status' in submitted) && !('createdById' in submitted));
  });

  await t.test('section editor adds, reorders, previews and removes sections', async () => {
    globalThis.fetch = async () => reply({ program: baseCourse() });
    route('/admin/training/new', AdminTrainingDetailPage);
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    assert.ok(document.getElementById('section-title-2'));
    fireEvent.change(document.getElementById('section-title-2'), { target: { value: 'Warning signs' } });
    fireEvent.change(document.getElementById('section-body-2'), { target: { value: 'Verify unexpected requests.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move section 3 up' }));
    assert.equal(document.getElementById('section-title-1').value, 'Warning signs');
    fireEvent.click(screen.getByRole('button', { name: 'Preview material' }));
    assert.match(document.body.textContent, /Warning signs/);
    assert.match(document.body.textContent, /Verify unexpected requests/);
    fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove section 2' }));
    assert.equal(document.getElementById('section-title-1').value, 'Key takeaways');
  });

  await t.test('administrator edits, reviews, publishes, assigns and archives a course', async () => {
    let course = baseCourse(); const actions = []; let assigned = false;
    globalThis.fetch = async (path, options = {}) => {
      if (path === `/api/admin/training/${courseId}`) return reply({ program: course });
      if (path.startsWith('/api/admin/training/employees')) return reply({ items: [{ id: employeeId, firstName: 'Assigned', lastName: 'Employee' }], page: 1, pageSize: 20, hasMore: false });
      if (path.startsWith(`/api/admin/training/${courseId}/assignments`)) {
        if (options.method === 'POST') { const duplicate = assigned; assigned = true; actions.push(['assign', JSON.parse(options.body)]); return reply({ assignment: { id: assignmentId }, alreadyAssigned: duplicate }); }
        return reply({ items: assigned ? [{ id: assignmentId, createdAt: time, employee: { id: employeeId, firstName: 'Assigned', lastName: 'Employee' }, progress: { status: 'NOT_STARTED', progressPercent: 0 } }] : [], page: 1, pageSize: 20, hasMore: false });
      }
      if (options.method === 'POST') {
        const operation = path.split('/').at(-1); const body = JSON.parse(options.body); actions.push([operation, body]);
        assert.equal(body.expectedUpdatedAt, course.updatedAt);
        course = { ...course, updatedAt: new Date(new Date(course.updatedAt).getTime() + 1000).toISOString(),
          ...(operation === 'edit' ? { ...body, version: course.version + 1, reviewedAt: null } : {}),
          ...(operation === 'review' ? { reviewedAt: time, reviewedBy: { firstName: 'Security', lastName: 'Reviewer' } } : {}),
          ...(operation === 'publish' ? { status: 'PUBLISHED', publishedAt: time } : {}),
          ...(operation === 'archive' ? { status: 'ARCHIVED' } : {}) };
        return reply({ program: course });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    route(`/admin/training/${courseId}`, AdminTrainingDetailPage);
    await screen.findByRole('button', { name: 'Save draft' });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Edited approved description.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => assert.equal(actions[0]?.[0], 'edit'));
    await waitFor(() => assert.equal(screen.getByLabelText(/Description/).value, 'Edited approved description.'));
    fireEvent.click(screen.getByRole('button', { name: 'Review current draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record review' }));
    await waitFor(() => assert.ok(actions.some(([operation]) => operation === 'review')));
    const publish = screen.getByRole('button', { name: 'Publish program' });
    await waitFor(() => assert.equal(publish.disabled, false));
    fireEvent.click(publish); fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish program' }));
    await waitFor(() => assert.ok(actions.some(([operation]) => operation === 'publish')));
    await screen.findByRole('button', { name: 'Assign course' });
    fireEvent.click(screen.getByRole('button', { name: 'Assign course' }));
    await waitFor(() => assert.equal(assigned, true));
    assert.deepEqual(actions.find(([operation]) => operation === 'assign')[1], { employeeId });
    await waitFor(() => assert.ok(screen.getAllByText('Assigned Employee').length >= 1));
    fireEvent.click(screen.getByRole('button', { name: 'Assign course' }));
    await screen.findByText('This employee already has an active assignment.');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive program' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive program' }));
    await waitFor(() => assert.equal(course.status, 'ARCHIVED'));
    assert.ok(actions.some(([operation]) => operation === 'archive'));
  });

  await t.test('stale edit retains unsaved text until explicit reload', async () => {
    let course = baseCourse(); let rejected = false;
    globalThis.fetch = async (path, options = {}) => {
      if (path === `/api/admin/training/${courseId}`) return reply({ program: course });
      if (path.endsWith('/edit') && options.method === 'POST') { rejected = true; course = { ...course, description: 'Another administrator saved this.', updatedAt: '2026-10-10T00:00:01.000Z' }; return reply({ error: { code: 'TRAINING_STALE', message: 'PRIVATE_CHANGE' } }, 409); }
      throw new Error(`Unexpected request: ${path}`);
    };
    route(`/admin/training/${courseId}`, AdminTrainingDetailPage); await screen.findByRole('button', { name: 'Save draft' });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'My unsaved local text.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => assert.equal(rejected, true));
    await screen.findByText(/Your unsaved draft remains on this page/);
    assert.equal(screen.getByLabelText(/Description/).value, 'My unsaved local text.');
    assert.equal(screen.getByRole('button', { name: 'Save draft' }).disabled, true);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_CHANGE/);
    fireEvent.click(screen.getByRole('button', { name: 'Discard local draft and load latest' }));
    assert.equal(screen.getByLabelText(/Description/).value, 'Another administrator saved this.');
  });

  await t.test('employee starts, resumes, acknowledges sections and sees quiz gate', async () => {
    let keys = []; let started = false; const calls = [];
    globalThis.fetch = async (path, options = {}) => { calls.push(path);
      if (path === `/api/training/${assignmentId}`) return reply({ contentAvailable: true, completionRequirement: 'MATERIAL_AND_QUIZ', assignment: {
        id: assignmentId, createdAt: time, training: { ...baseCourse(), status: 'PUBLISHED' }, progress: { status: started ? 'IN_PROGRESS' : 'NOT_STARTED', progressPercent: keys.length * 50,
          completedSectionKeys: keys, startedAt: started ? time : null, materialCompletedAt: keys.length === 2 ? time : null, completedAt: null } } });
      if (path === `/api/training/${assignmentId}/start` && options.method === 'POST') { started = true; return reply({ progress: { status: 'IN_PROGRESS' } }); }
      if (path === `/api/training/${assignmentId}/sections` && options.method === 'POST') { const body = JSON.parse(options.body); assert.equal(body.sectionKey, sections[keys.length].key); keys = [...keys, body.sectionKey]; return reply({ progress: { status: 'IN_PROGRESS', progressPercent: keys.length * 50 } }); }
      throw new Error(`Unexpected request: ${path}`);
    };
    route(`/training/${assignmentId}`, EmployeeTrainingDetailPage);
    await screen.findByRole('button', { name: 'Start this course' });
    assert.match(document.body.textContent, /0%/);
    fireEvent.click(screen.getByRole('button', { name: 'Start this course' }));
    await screen.findByRole('button', { name: 'I have read this section' });
    fireEvent.click(screen.getByRole('button', { name: 'I have read this section' }));
    await waitFor(() => assert.match(document.body.textContent, /50%/));
    fireEvent.click(screen.getByRole('button', { name: 'I have read this section' }));
    await screen.findByText('Material completed; training still in progress');
    assert.match(document.body.textContent, /100%/); assert.match(document.body.textContent, /no final completion or certificate has been awarded/i);
    assert.equal(calls.filter((path) => path === `/api/training/${assignmentId}/sections`).length, 2);
    fireEvent.click(screen.getByRole('button', { name: /Refresh progress/ }));
    await waitFor(() => assert.match(document.body.textContent, /100%/));
  });

  await t.test('employee list shows empty, errors, retry, filters and saved progress', async () => {
    let mode = 'empty'; const calls = [];
    globalThis.fetch = async (path) => { calls.push(path);
      if (mode === 'error') return reply({ error: { code: 'FAIL', message: 'INTERNAL_SECRET' } }, 500);
      const page = Number(new URL(path, 'http://localhost').searchParams.get('page'));
      return reply({ items: mode === 'empty' ? [] : [{ id: assignmentId, createdAt: time, training: { ...baseCourse(), status: 'PUBLISHED' }, progress: { status: 'IN_PROGRESS', progressPercent: 50, completedSectionKeys: ['introduction'] } }], page, pageSize: 20, hasMore: page === 1 && mode !== 'empty' });
    };
    route('/training', EmployeeTrainingListPage);
    assert.match(document.body.textContent, /Loading training/);
    await screen.findByText('No assigned courses');
    mode = 'error'; fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('Training could not be loaded'); assert.doesNotMatch(document.body.textContent, /INTERNAL_SECRET/);
    mode = 'records'; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('link', { name: 'Resume course' });
    assert.match(document.body.textContent, /50%/);
    fireEvent.change(screen.getByLabelText('Progress status'), { target: { value: 'IN_PROGRESS' } });
    await waitFor(() => assert.ok(calls.some((path) => path.includes('status=IN_PROGRESS'))));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => assert.ok(calls.some((path) => path.includes('page=2') && path.includes('status=IN_PROGRESS'))));
  });

  await t.test('archived and unauthorized employee courses do not expose material', async () => {
    let forbidden = false;
    globalThis.fetch = async () => forbidden ? reply({ error: { code: 'FORBIDDEN', message: 'SECRET' } }, 403) : reply({ contentAvailable: false, completionRequirement: 'MATERIAL_AND_QUIZ', assignment: {
      id: assignmentId, createdAt: time, training: { ...baseCourse(), status: 'ARCHIVED', content: undefined, learningObjectives: undefined },
      progress: { status: 'IN_PROGRESS', progressPercent: 50, completedSectionKeys: ['introduction'] } } });
    route(`/training/${assignmentId}`, EmployeeTrainingDetailPage);
    await screen.findByText('Archived course');
    assert.doesNotMatch(document.body.textContent, /Read this introduction|Remember the approved process/);
    assert.equal(screen.queryByRole('button', { name: 'Start this course' }), null);
    forbidden = true; fireEvent.click(screen.getByRole('button', { name: /Refresh progress/ }));
    await screen.findByText('Training could not be loaded');
    assert.doesNotMatch(document.body.textContent, /Archived course|SECRET/);
  });

  await t.test('administrator MFA failure clears protected course details', async () => {
    let denied = false;
    globalThis.fetch = async () => denied ? reply({ error: { code: 'UNAUTHORIZED', message: 'SECRET_MFA_DETAIL' } }, 401) : reply({ program: baseCourse() });
    route(`/admin/training/${courseId}`, AdminTrainingDetailPage);
    await screen.findByRole('button', { name: 'Save draft' });
    denied = true; fireEvent.click(screen.getByRole('button', { name: 'Review current draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record review' }));
    await screen.findByText('Training could not be loaded');
    assert.doesNotMatch(document.body.textContent, /Course essentials|SECRET_MFA_DETAIL/);
  });

  await t.test('failed progress write hides stale material until an explicit refresh', async () => {
    let fail = true;
    globalThis.fetch = async (path, options = {}) => {
      if (path === `/api/training/${assignmentId}`) return reply({ contentAvailable: true, completionRequirement: 'MATERIAL_AND_QUIZ', assignment: { id: assignmentId, createdAt: time,
        training: { ...baseCourse(), status: 'PUBLISHED' }, progress: { status: 'NOT_STARTED', progressPercent: 0, completedSectionKeys: [] } } });
      if (path.endsWith('/start') && options.method === 'POST') return fail ? reply({ error: { code: 'FAIL', message: 'PRIVATE_PROGRESS' } }, 500) : reply({ progress: { status: 'IN_PROGRESS' } });
      throw new Error(`Unexpected request: ${path}`);
    };
    route(`/training/${assignmentId}`, EmployeeTrainingDetailPage);
    await screen.findByRole('button', { name: 'Start this course' });
    fireEvent.click(screen.getByRole('button', { name: 'Start this course' }));
    await screen.findByText('Training could not be loaded');
    assert.doesNotMatch(document.body.textContent, /Read this introduction|PRIVATE_PROGRESS/);
    fail = false; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Start this course' });
  });
});
