import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter, Route, Routes } from 'react-router';

const id = '123e4567-e89b-42d3-a456-426614174100', attemptId = '123e4567-e89b-42d3-a456-426614174101';
const q1 = '123e4567-e89b-42d3-a456-426614174102', q2 = '123e4567-e89b-42d3-a456-426614174103';
const o1 = '123e4567-e89b-42d3-a456-426614174104', o2 = '123e4567-e89b-42d3-a456-426614174105';
const time = '2026-10-10T00:00:00.000Z';
const reply = (body, status = 200) => Response.json(body, { status });
const question = (employee = false) => ({ id: q1, text: 'Which action is safer?', type: 'MULTIPLE_CHOICE', points: 1, position: 0,
  ...(!employee ? { topic: 'PHISHING', explanation: 'Report suspicious requests.' } : {}), options: [
    { id: o1, text: 'Report it', position: 0, ...(!employee ? { isCorrect: true } : {}) },
    { id: o2, text: 'Ignore it', position: 1, ...(!employee ? { isCorrect: false } : {}) }] });
const adminRecord = (status = 'DRAFT') => ({ id, period: '2026-10', title: 'October awareness', status, availability: status === 'PUBLISHED' ? 'OPEN' : 'UNPUBLISHED', topics: ['PHISHING'], opensAt: '2026-10-01T00:00:00.000Z', closesAt: '2026-11-01T00:00:00.000Z', updatedAt: time, publishedAt: null,
  quiz: { id: 'quiz-id', title: 'October awareness', status, version: 1, passingPercent: 80, maxAttempts: 2, updatedAt: time, questions: [question()] } });
const summary = (status = 'IN_PROGRESS') => ({ id: attemptId, attemptNumber: 1, status, startedAt: time, submittedAt: status === 'SUBMITTED' ? time : null, scorePercent: status === 'SUBMITTED' ? 100 : null, earnedPoints: status === 'SUBMITTED' ? 1 : null, possiblePoints: status === 'SUBMITTED' ? 1 : null, passed: status === 'SUBMITTED' });
const employeeRecord = (availability = 'OPEN', attempts = []) => ({ id, period: '2026-10', title: 'October awareness', status: 'PUBLISHED', availability, topics: ['PHISHING'], opensAt: time, closesAt: '2026-11-01T00:00:00.000Z', attemptsRemaining: 2 - attempts.length, attempts,
  quiz: availability === 'OPEN' ? { id: 'quiz-id', title: 'October awareness', version: 1, questions: [question(true)] } : null });
const graded = () => ({ attempt: summary('SUBMITTED'), answers: [{ questionId: q1, selectedOptionId: o1, correctOptionId: o1, awardedPoints: 1, explanation: 'Report suspicious requests.' }] });

test('Phase 11C2 monthly quiz React workflows with mocked APIs', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { AdminMonthlyListPage, AdminMonthlyDetailPage } = await vite.ssrLoadModule('/src/features/monthly-quizzes/AdminMonthlyPages.jsx');
  const { EmployeeMonthlyListPage, EmployeeMonthlyDetailPage } = await vite.ssrLoadModule('/src/features/monthly-quizzes/EmployeeMonthlyPages.jsx');
  const route = (path, Page) => render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null,
    createElement(Route, { path: path.replace(id, ':id'), element: createElement(Page) }))));
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(() => cleanup());

  await t.test('administrator list searches, filters, pages and retries failures', async () => {
    let failed = true; const calls = [];
    globalThis.fetch = async (path) => { calls.push(path); if (failed) return reply({ error: { code: 'FAIL', message: 'SECRET' } }, 500);
      const page = Number(new URL(path, 'http://localhost').searchParams.get('page'));
      return reply({ items: [{ ...adminRecord(), id: page === 1 ? id : q2 }], page, pageSize: 20, hasMore: page === 1 }); };
    route('/admin/monthly-quizzes', AdminMonthlyListPage);
    assert.match(document.body.textContent, /Loading monthly quizzes/);
    await screen.findByText('Monthly quizzes could not be loaded');
    failed = false; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('link', { name: 'Manage' });
    fireEvent.change(screen.getByLabelText('Search title'), { target: { value: 'October' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'DRAFT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => assert.ok(calls.some((path) => path.includes('search=October') && path.includes('status=DRAFT'))));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => assert.ok(calls.some((path) => path.includes('page=2'))));
    assert.doesNotMatch(document.body.textContent, /SECRET/);
  });

  await t.test('administrator creates a draft with topics, questions and UTC schedule; duplicate month is explained', async () => {
    let submitted, conflict = true;
    globalThis.fetch = async (path, options) => { if (path === '/api/admin/monthly-quizzes' && options.method === 'POST') { submitted = JSON.parse(options.body); return conflict ? reply({ error: { code: 'MONTHLY_QUIZ_CONFLICT', message: 'A monthly quiz already exists for this month.' } }, 409) : reply({ monthlyQuiz: adminRecord() }); } throw new Error(path); };
    route('/admin/monthly-quizzes/new', AdminMonthlyDetailPage);
    fireEvent.change(screen.getByLabelText('Quiz title'), { target: { value: 'October awareness' } });
    fireEvent.change(screen.getByLabelText('Calendar month (UTC)'), { target: { value: '2026-10' } });
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Which action is safer?' } });
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'Report it' } });
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'Ignore it' } });
    fireEvent.change(screen.getByLabelText('Correct-answer explanation'), { target: { value: 'Report suspicious requests.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await screen.findByText(/This month already has a quiz/);
    assert.equal(submitted.period, '2026-10'); assert.equal(submitted.questions[0].topic, 'PHISHING');
    assert.ok(submitted.opensAt.endsWith('Z')); assert.ok(!('scorePercent' in submitted));
    conflict = false; fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    fireEvent.change(screen.getAllByLabelText('Question type')[1], { target: { value: 'TRUE_FALSE' } });
    fireEvent.change(screen.getAllByLabelText('Question text')[1], { target: { value: 'Is this safe?' } });
    fireEvent.change(screen.getAllByLabelText('Correct-answer explanation')[1], { target: { value: 'No.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move question 2 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview answer key' }));
    assert.match(document.body.textContent, /Correct/);
    fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => assert.equal(submitted.questions[0].type, 'TRUE_FALSE'));
  });

  await t.test('administrator approves, publishes, archives and views paginated participation', async () => {
    let record = adminRecord(), reportPage = 1; const operations = [];
    globalThis.fetch = async (path, options = {}) => { if (path === `/api/admin/monthly-quizzes/${id}` && !options.method) return reply({ monthlyQuiz: record });
      if (/\/(approve|publish|archive)$/.test(path)) { const operation = path.split('/').at(-1); assert.equal(JSON.parse(options.body).expectedUpdatedAt, record.quiz.updatedAt); operations.push(operation); record = { ...record, status: operation === 'approve' ? 'APPROVED' : operation === 'publish' ? 'PUBLISHED' : 'ARCHIVED', quiz: { ...record.quiz, status: operation === 'approve' ? 'APPROVED' : operation === 'publish' ? 'PUBLISHED' : 'ARCHIVED' } }; return reply({ monthlyQuiz: record }); }
      if (path.includes('/report?')) { reportPage = Number(new URL(path, 'http://localhost').searchParams.get('page')); return reply({ items: [{ ...summary('SUBMITTED'), id: `${attemptId}-${reportPage}`, employee: { firstName: 'Test', lastName: 'Employee' } }], page: reportPage, pageSize: 20, hasMore: reportPage === 1, participation: { expectedEmployees: 7, startedEmployees: 2, submittedEmployees: 1, inProgressEmployees: 1, activeEmployeesNow: 7 } }); }
      throw new Error(path); };
    route(`/admin/monthly-quizzes/${id}`, AdminMonthlyDetailPage);
    await screen.findByRole('button', { name: 'Review and approve' });
    fireEvent.click(screen.getByRole('button', { name: 'Review and approve' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve quiz' }));
    await screen.findByRole('button', { name: 'Publish quiz' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish quiz' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish quiz' }));
    await waitFor(() => assert.deepEqual(operations, ['approve', 'publish']));
    fireEvent.click(screen.getByRole('button', { name: 'Participation report' }));
    await screen.findByText('Test Employee');
    // BUG-005: the active-employee count is labelled as expected employees, not "in progress".
    assert.ok(screen.getByText('7 expected employees · 2 started · 1 submitted · 1 in progress'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); await waitFor(() => assert.equal(reportPage, 2));
    fireEvent.click(screen.getByRole('button', { name: 'Archive quiz' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive quiz' }));
    await waitFor(() => assert.deepEqual(operations, ['approve', 'publish', 'archive']));
  });

  await t.test('stale administrator edit preserves local text and authorization clears protected record', async () => {
    let record = adminRecord(), denied = false;
    globalThis.fetch = async (path, options = {}) => { if (denied) return reply({ error: { code: 'UNAUTHORIZED', message: 'PRIVATE_MFA' } }, 401);
      if (path === `/api/admin/monthly-quizzes/${id}` && !options.method) return reply({ monthlyQuiz: record });
      if (path.endsWith('/edit')) { record = { ...record, title: 'Other administrator update', quiz: { ...record.quiz, title: 'Other administrator update', updatedAt: '2026-10-10T00:00:01.000Z' } }; return reply({ error: { code: 'TRAINING_STALE', message: 'PRIVATE' } }, 409); }
      throw new Error(path); };
    route(`/admin/monthly-quizzes/${id}`, AdminMonthlyDetailPage);
    await screen.findByRole('button', { name: 'Save draft' });
    fireEvent.change(screen.getByLabelText('Quiz title'), { target: { value: 'My unsaved title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Your local draft is preserved/);
    assert.equal(screen.getByLabelText('Quiz title').value, 'My unsaved title');
    assert.equal(screen.getByRole('button', { name: 'Save draft' }).disabled, true);
    fireEvent.click(screen.getByRole('button', { name: 'Discard local draft and load latest' }));
    assert.equal(screen.getByLabelText('Quiz title').value, 'Other administrator update');
    cleanup(); denied = true; route(`/admin/monthly-quizzes/${id}`, AdminMonthlyDetailPage);
    await screen.findByText('Monthly quizzes could not be loaded');
    assert.doesNotMatch(document.body.textContent, /My unsaved title|PRIVATE_MFA/);
  });

  await t.test('employee list and month-by-month history show server percentage trend', async () => {
    globalThis.fetch = async (path) => path.startsWith('/api/monthly-quizzes/history') ? reply({ items: [
      { period: '2026-10', title: 'October awareness', attemptCount: 2, bestAttempt: summary('SUBMITTED'), deltaPointsFromPreviousRecordedMonth: 12 },
      { period: '2026-09', title: 'September awareness', attemptCount: 1, bestAttempt: { ...summary('SUBMITTED'), scorePercent: 88, earnedPoints: 7, possiblePoints: 8 }, deltaPointsFromPreviousRecordedMonth: null }], page: 1, pageSize: 20, hasMore: false })
      : reply({ items: [{ ...employeeRecord(), attempts: undefined, attemptCount: 0, bestScorePercent: null }], page: 1, pageSize: 20, hasMore: false });
    route('/monthly-quiz', EmployeeMonthlyListPage);
    await screen.findByRole('link', { name: 'View assessment' });
    await screen.findByText(/\+12 percentage points/);
    assert.match(document.body.textContent, /7\/8/);
  });

  await t.test('employee month picker filters immediately, shows a filtered empty state and clears', async () => {
    const calls = [];
    globalThis.fetch = async (path) => { calls.push(path);
      if (path.startsWith('/api/monthly-quizzes/history')) return reply({ items: [], page: 1, pageSize: 20, hasMore: false });
      return reply({ items: path.includes('period=') ? [] : [{ ...employeeRecord(), attemptCount: 0, bestScorePercent: null }], page: 1, pageSize: 20, hasMore: false }); };
    route('/monthly-quiz', EmployeeMonthlyListPage);
    await screen.findByRole('link', { name: 'View assessment' });
    const trigger = screen.getByRole('button', { name: /Quiz month All months/ });
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Choose quiz month' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next year, 2027' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^March 2027/ }));
    await waitFor(() => assert.ok(calls.some((path) => path.startsWith('/api/monthly-quizzes?') && path.includes('period=2027-03') && path.includes('page=1'))));
    await screen.findByText('No monthly quiz for March 2027');
    assert.equal(screen.queryByRole('dialog'), null);
    fireEvent.click(screen.getByRole('button', { name: 'Clear quiz month filter' }));
    await screen.findByRole('link', { name: 'View assessment' });
    assert.ok(screen.getByRole('button', { name: /Quiz month All months/ }));
  });

  await t.test('employee starts, navigates, reviews and submits without pre-submission answer disclosure', async () => {
    let started = false, submitted, gradedResult = false;
    globalThis.fetch = async (path, options = {}) => { if (path === `/api/monthly-quizzes/${id}` && !options.method) return reply(employeeRecord('OPEN', started ? [summary(gradedResult ? 'SUBMITTED' : 'IN_PROGRESS')] : []));
      if (path === `/api/monthly-quizzes/${id}/attempts` && options.method === 'POST') { started = true; return reply({ attempt: summary(), quiz: employeeRecord().quiz }); }
      if (path.endsWith('/submit')) { submitted = JSON.parse(options.body); gradedResult = true; return reply(graded()); }
      if (path.endsWith(`/attempts/${attemptId}`)) return reply(graded());
      if (path.startsWith('/api/monthly-quizzes/history')) return reply({ items: gradedResult ? [{ period: '2026-10', title: 'October awareness', attemptCount: 1, bestAttempt: summary('SUBMITTED'), deltaPointsFromPreviousRecordedMonth: null }] : [], page: 1, pageSize: 20, hasMore: false });
      throw new Error(path); };
    route(`/monthly-quiz/${id}`, EmployeeMonthlyDetailPage);
    await screen.findByRole('button', { name: 'Start attempt' });
    assert.doesNotMatch(document.body.textContent, /Report suspicious requests|Correct answer:/);
    fireEvent.click(screen.getByRole('button', { name: 'Start attempt' }));
    await screen.findByText('Which action is safer?');
    fireEvent.click(screen.getByLabelText('Report it'));
    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    assert.doesNotMatch(document.body.textContent, /Report suspicious requests|Correct answer:/);
    fireEvent.click(screen.getByRole('button', { name: 'Submit monthly quiz' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit quiz' }));
    await screen.findByText('Monthly quiz passed');
    assert.deepEqual(submitted, { answers: [{ questionId: q1, selectedOptionId: o1 }] });
    await screen.findByText(/First recorded month/);
    assert.match(document.body.textContent, /Report suspicious requests/);
  });

  await t.test('employee resumes a server attempt, keeps selections after navigation, and can retry a failed submission', async () => {
    let submitCalls = 0;
    const second = { ...question(true), id: q2, text: 'Is this safe?', type: 'TRUE_FALSE', options: [{ id: 'true', text: 'True', position: 0 }, { id: 'false', text: 'False', position: 1 }] };
    globalThis.fetch = async (path, options = {}) => {
      if (path === `/api/monthly-quizzes/${id}` && !options.method) return reply({ ...employeeRecord(), attempts: [summary()], quiz: { ...employeeRecord().quiz, questions: [question(true), second] } });
      if (path === `/api/monthly-quizzes/${id}/attempts`) return reply({ attempt: summary(), quiz: { ...employeeRecord().quiz, questions: [question(true), second] } });
      if (path.endsWith('/submit')) { submitCalls++; return reply({ error: { code: 'FAIL', message: 'PRIVATE_SUBMISSION' } }, 500); }
      if (path.startsWith('/api/monthly-quizzes/history')) return reply({ items: [], page: 1, pageSize: 20, hasMore: false });
      throw new Error(path);
    };
    route(`/monthly-quiz/${id}`, EmployeeMonthlyDetailPage);
    await screen.findByRole('button', { name: 'Resume attempt' });
    fireEvent.click(screen.getByRole('button', { name: 'Resume attempt' }));
    await screen.findByText('Which action is safer?');
    fireEvent.click(screen.getByLabelText('Report it'));
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    fireEvent.click(screen.getByLabelText('False'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }));
    assert.equal(screen.getByLabelText('Report it').checked, true);
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit monthly quiz' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit quiz' }));
    await screen.findByText(/could not complete the request/);
    assert.equal(submitCalls, 1);
    assert.match(document.body.textContent, /Report it/);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_SUBMISSION|Correct answer:/);
    fireEvent.click(screen.getByRole('button', { name: 'Submit monthly quiz' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit quiz' }));
    await waitFor(() => assert.equal(submitCalls, 2));
  });

  await t.test('employee closed and exhausted states, API errors and ownership failures remain safe', async () => {
    let state = 'closed';
    globalThis.fetch = async (path) => { if (state === 'denied') return reply({ error: { code: 'FORBIDDEN', message: 'PRIVATE_RECORD' } }, 403);
      if (path.startsWith('/api/monthly-quizzes/history')) return reply({ items: [], page: 1, pageSize: 20, hasMore: false });
      return reply(state === 'closed' ? employeeRecord('CLOSED') : { ...employeeRecord(), attemptsRemaining: 0 }); };
    route(`/monthly-quiz/${id}`, EmployeeMonthlyDetailPage);
    await screen.findByText(/submission window has closed/);
    assert.equal(screen.queryByRole('button', { name: 'Start attempt' }), null);
    cleanup(); state = 'exhausted'; route(`/monthly-quiz/${id}`, EmployeeMonthlyDetailPage);
    await screen.findByText(/No attempts remain/);
    cleanup(); state = 'denied'; route(`/monthly-quiz/${id}`, EmployeeMonthlyDetailPage);
    await screen.findByText('Monthly quizzes could not be loaded');
    assert.doesNotMatch(document.body.textContent, /Which action|PRIVATE_RECORD/);
  });

  await t.test('BUG-018 a passed quiz shows Passed instead of remaining attempts or start instructions', async () => {
    const passedAttempt = { id: attemptId, attemptNumber: 1, status: 'SUBMITTED', startedAt: time, submittedAt: time, scorePercent: 100,
      earnedPoints: 1, possiblePoints: 1, passed: true };
    globalThis.fetch = async (path) => {
      if (path.startsWith('/api/monthly-quizzes/history')) return reply({ items: [], page: 1, pageSize: 20, hasMore: false });
      if (path.startsWith('/api/monthly-quizzes?')) return reply({ items: [{ ...employeeRecord('OPEN', [passedAttempt]), passed: true, attemptsRemaining: 0, bestScorePercent: 100 }], page: 1, pageSize: 20, hasMore: false });
      return reply({ ...employeeRecord('OPEN', [passedAttempt]), passed: true, attemptsRemaining: 0 }); };
    route(`/monthly-quiz/${id}`, EmployeeMonthlyDetailPage);
    await screen.findByText('Quiz passed');
    assert.equal(screen.queryByText('Before you begin'), null);
    assert.equal(screen.queryByRole('button', { name: 'Start attempt' }), null);
    assert.doesNotMatch(document.body.textContent, /attempts? remaining/);
    cleanup(); route('/monthly-quiz', EmployeeMonthlyListPage);
    await screen.findByText('October awareness');
    assert.match(document.body.textContent, /Passed · Best 100%/); assert.doesNotMatch(document.body.textContent, /attempts? remaining/);
  });
});
