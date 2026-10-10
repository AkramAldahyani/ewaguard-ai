import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

const courseId = '2ca40ea1-b748-46ec-bc49-279da3f10dc5';
const assignmentId = 'be845426-952d-4ec7-b457-f033eb391071';
const attemptId = '61ce1eb8-97c6-420d-b5d9-30ceff5af33b';
const q1 = 'cd34203a-62fc-4aac-8513-eed316390d25', q2 = 'f38162a1-e757-4164-84b4-57946054c46c';
const options = ['cc392036-124f-4577-bd92-a13cde605c5d', 'f4a3fa38-c3ec-4a5e-bc32-9343d550304a', '705c85e1-cf26-4890-b2db-2d5851c2627b', '154b3b1d-a3d2-4352-9b7d-2074d513d762'];
const time = '2026-10-10T00:00:00.000Z';
const reply = (body, status = 200) => Response.json(body, { status });
const program = { id: courseId, title: 'Test course', status: 'PUBLISHED', requiresQuiz: true };
const adminQuiz = () => ({ id: 'quiz-1', title: 'Security check', version: 1, status: 'DRAFT', passingPercent: 75, maxAttempts: 2,
  updatedAt: time, questions: [{ id: q1, text: 'Which action?', type: 'MULTIPLE_CHOICE', explanation: 'Report the suspicious request.', points: 2, position: 0,
    options: [{ id: options[0], text: 'Report it', position: 0, isCorrect: true }, { id: options[1], text: 'Ignore it', position: 1, isCorrect: false }] }] });
const employeeQuiz = () => ({ id: 'quiz-1', title: 'Security check', version: 1, questions: [
  { id: q1, text: 'Which action?', type: 'MULTIPLE_CHOICE', points: 2, position: 0, options: [{ id: options[0], text: 'Report it', position: 0 }, { id: options[1], text: 'Ignore it', position: 1 }] },
  { id: q2, text: 'Is this safe?', type: 'TRUE_FALSE', points: 1, position: 1, options: [{ id: options[2], text: 'True', position: 0 }, { id: options[3], text: 'False', position: 1 }] } ] });
const summary = (status = 'IN_PROGRESS') => ({ id: attemptId, attemptNumber: 1, status, startedAt: time, submittedAt: status === 'SUBMITTED' ? time : null,
  scorePercent: status === 'SUBMITTED' ? '100' : null, earnedPoints: status === 'SUBMITTED' ? 3 : null, possiblePoints: status === 'SUBMITTED' ? 3 : null, passed: status === 'SUBMITTED' ? true : null });
const result = () => ({ attempt: summary('SUBMITTED'), answers: [
  { questionId: q1, selectedOptionId: options[0], correctOptionId: options[0], awardedPoints: 2, explanation: 'Report the suspicious request.' },
  { questionId: q2, selectedOptionId: options[3], correctOptionId: options[3], awardedPoints: 1, explanation: 'It is not safe.' } ] });

test('Phase 11B2 quiz React workflows with mocked authenticated APIs', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { document } = dom.window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { AdminQuizPanel } = await vite.ssrLoadModule('/src/features/training/AdminQuizPanel.jsx');
  const { EmployeeQuizPanel } = await vite.ssrLoadModule('/src/features/training/EmployeeQuizPanel.jsx');
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(() => cleanup());

  await t.test('administrator creates, edits, reorders and previews question drafts', async () => {
    let saved; let quiz = null;
    globalThis.fetch = async (path, request = {}) => {
      if (path === `/api/admin/training/${courseId}/quiz` && !request.method) return reply({ quiz, requiresQuiz: true });
      if (path === `/api/admin/training/${courseId}/quiz` || path.endsWith('/quiz/edit')) {
        saved = JSON.parse(request.body); quiz = { ...adminQuiz(), title: saved.title, passingPercent: saved.passingPercent, maxAttempts: saved.maxAttempts,
          updatedAt: time, questions: saved.questions.map((q, i) => ({ ...q, id: i ? q2 : q1, position: i,
            options: q.options.map((o, j) => ({ ...o, id: options[j + i * 2], position: j })) })) }; return reply({ quiz });
      }
      throw new Error(`Unexpected ${path}`);
    };
    render(createElement(AdminQuizPanel, { program }));
    await screen.findByRole('button', { name: 'Create quiz draft' });
    fireEvent.change(screen.getByLabelText('Quiz title'), { target: { value: 'Security check' } });
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Which action?' } });
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'Report it' } });
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'Ignore it' } });
    fireEvent.change(screen.getByLabelText('Correct-answer explanation'), { target: { value: 'Report the suspicious request.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    fireEvent.change(screen.getAllByLabelText('Question type')[1], { target: { value: 'TRUE_FALSE' } });
    fireEvent.change(screen.getAllByLabelText('Question text')[1], { target: { value: 'Is this safe?' } });
    fireEvent.change(screen.getAllByLabelText('Correct-answer explanation')[1], { target: { value: 'It is not safe.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move question 2 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview quiz' }));
    assert.match(document.body.textContent, /Is this safe\?/);
    fireEvent.click(screen.getByRole('button', { name: 'Edit questions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create quiz draft' }));
    await waitFor(() => assert.equal(saved?.questions[0].type, 'TRUE_FALSE'));
    assert.equal(saved.questions[1].type, 'MULTIPLE_CHOICE'); assert.equal(saved.questions[0].options[0].text, 'True');
    assert.ok(!('status' in saved) && !('scorePercent' in saved));
    fireEvent.click(screen.getByRole('button', { name: 'Remove question 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save quiz draft' }));
    await waitFor(() => assert.equal(saved.questions.length, 1));
  });

  await t.test('administrator approval, publication and paginated attempt reports', async () => {
    let quiz = adminQuiz(); let page = 1; const actions = [];
    globalThis.fetch = async (path, request = {}) => {
      if (path === `/api/admin/training/${courseId}/quiz` && !request.method) return reply({ quiz, requiresQuiz: true });
      if (path.endsWith('/quiz/approve') || path.endsWith('/quiz/publish')) {
        const action = path.split('/').at(-1); const body = JSON.parse(request.body); assert.equal(body.expectedUpdatedAt, quiz.updatedAt);
        actions.push(action); quiz = { ...quiz, status: action === 'approve' ? 'APPROVED' : 'PUBLISHED', updatedAt: new Date(Date.parse(quiz.updatedAt) + 1000).toISOString() }; return reply({ quiz });
      }
      if (path.includes('/quiz/attempts?')) { page = Number(new URL(path, 'http://localhost').searchParams.get('page')); return reply({ items: [{ ...summary('SUBMITTED'), id: `attempt-${page}`, employee: { firstName: 'Assigned', lastName: 'Employee' } }], page, pageSize: 20, hasMore: page === 1 }); }
      throw new Error(`Unexpected ${path}`);
    };
    render(createElement(AdminQuizPanel, { program }));
    await screen.findByRole('button', { name: 'Review and approve quiz' });
    fireEvent.click(screen.getByRole('button', { name: 'Review and approve quiz' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve quiz' }));
    await screen.findByRole('button', { name: 'Publish quiz' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish quiz' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish quiz' }));
    await waitFor(() => assert.deepEqual(actions, ['approve', 'publish']));
    fireEvent.click(screen.getByRole('button', { name: 'Employee attempts' }));
    await screen.findByText('Assigned Employee');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => assert.equal(page, 2));
    assert.doesNotMatch(document.body.textContent, /employee@example|password/i);
  });

  await t.test('stale quiz edit keeps unsaved questions until explicit discard', async () => {
    let quiz = adminQuiz();
    globalThis.fetch = async (path, request = {}) => {
      if (path === `/api/admin/training/${courseId}/quiz` && !request.method) return reply({ quiz, requiresQuiz: true });
      if (path.endsWith('/quiz/edit')) { quiz = { ...quiz, title: 'Other administrator update', updatedAt: '2026-10-10T00:00:01.000Z' };
        return reply({ error: { code: 'TRAINING_STALE', message: 'PRIVATE_SERVER_DETAIL' } }, 409); }
      throw new Error(`Unexpected ${path}`);
    };
    render(createElement(AdminQuizPanel, { program }));
    await screen.findByRole('button', { name: 'Save quiz draft' });
    fireEvent.change(screen.getByLabelText('Quiz title'), { target: { value: 'My unsaved title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save quiz draft' }));
    await screen.findByText(/Your local quiz draft is preserved/);
    assert.equal(screen.getByLabelText('Quiz title').value, 'My unsaved title');
    assert.equal(screen.getByRole('button', { name: 'Save quiz draft' }).disabled, true);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_SERVER_DETAIL/);
    fireEvent.click(screen.getByRole('button', { name: 'Discard local quiz draft and load latest' }));
    assert.equal(screen.getByLabelText('Quiz title').value, 'Other administrator update');
  });

  await t.test('administrator MFA failure does not retain protected quiz content', async () => {
    globalThis.fetch = async () => reply({ error: { code: 'UNAUTHORIZED', message: 'PRIVATE_MFA_DETAIL' } }, 401);
    render(createElement(AdminQuizPanel, { program }));
    await screen.findByText('Training could not be loaded');
    assert.doesNotMatch(document.body.textContent, /Which action\?|PRIVATE_MFA_DETAIL/);
  });

  await t.test('employee prerequisites, empty loading, and unavailable quiz messaging', async () => {
    let fail = true;
    globalThis.fetch = async () => fail ? reply({ error: { code: 'FAIL', message: 'PRIVATE_ERROR' } }, 500)
      : reply({ available: true, reason: 'READING_INCOMPLETE', quiz: null, attempts: [], attemptsRemaining: 2 });
    render(createElement(EmployeeQuizPanel, { assignmentId }));
    assert.match(document.body.textContent, /Loading training/);
    await screen.findByText('Training could not be loaded');
    fail = false; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(/Finish and acknowledge every reading section/);
    assert.equal(screen.queryByRole('button', { name: 'Start assessment' }), null);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_ERROR|correct answer/i);
  });

  await t.test('employee navigates, reviews, submits, sees server result and history', async () => {
    let submitted, started = false, passed = false; let completionRefreshes = 0;
    globalThis.fetch = async (path, request = {}) => {
      if (path === `/api/training/${assignmentId}/quiz` && !request.method) return reply({ available: true, reason: null, quiz: employeeQuiz(),
        attempts: started ? [summary(passed ? 'SUBMITTED' : 'IN_PROGRESS')] : [], attemptsRemaining: passed ? 0 : 2 });
      if (path.endsWith('/quiz/attempts') && request.method === 'POST') { started = true; return reply({ attempt: summary(), quiz: employeeQuiz() }); }
      if (path.endsWith('/submit')) { submitted = JSON.parse(request.body); passed = true; return reply(result()); }
      if (path.endsWith(`quiz/attempts/${attemptId}`)) return reply(result());
      throw new Error(`Unexpected ${path}`);
    };
    render(createElement(EmployeeQuizPanel, { assignmentId, onCompleted: () => completionRefreshes++ }));
    await screen.findByRole('button', { name: 'Start assessment' });
    assert.doesNotMatch(document.body.textContent, /Report the suspicious request|Correct answer:/);
    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }));
    await screen.findByText('Which action?');
    fireEvent.click(screen.getByLabelText('Report it'));
    fireEvent.click(screen.getByRole('button', { name: /Next question/ }));
    fireEvent.click(screen.getByLabelText('False'));
    fireEvent.click(screen.getByRole('button', { name: /Previous question/ }));
    assert.equal(screen.getByLabelText('Report it').checked, true);
    fireEvent.click(screen.getByRole('button', { name: /Next question/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    assert.match(document.body.textContent, /Report it/); assert.match(document.body.textContent, /False/);
    assert.doesNotMatch(document.body.textContent, /Report the suspicious request|Correct answer:/);
    fireEvent.click(screen.getByRole('button', { name: 'Submit assessment' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit assessment' }));
    await screen.findByText('Assessment passed');
    assert.deepEqual(submitted, { answers: [{ questionId: q1, selectedOptionId: options[0] }, { questionId: q2, selectedOptionId: options[3] }] });
    assert.equal(completionRefreshes, 1);
    assert.match(document.body.textContent, /Report the suspicious request/);
    fireEvent.click(screen.getByRole('button', { name: 'Back to assessment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review result' }));
    await screen.findByText('Assessment passed');
  });

  await t.test('submission failure preserves selected answers for retry', async () => {
    globalThis.fetch = async (path, request = {}) => {
      if (path === `/api/training/${assignmentId}/quiz` && !request.method) return reply({ available: true, reason: null, quiz: employeeQuiz(), attempts: [], attemptsRemaining: 2 });
      if (path.endsWith('/quiz/attempts')) return reply({ attempt: summary(), quiz: employeeQuiz() });
      if (path.endsWith('/submit')) return reply({ error: { code: 'FAIL', message: 'PRIVATE_SUBMISSION' } }, 500);
      throw new Error(`Unexpected ${path}`);
    };
    render(createElement(EmployeeQuizPanel, { assignmentId }));
    await screen.findByRole('button', { name: 'Start assessment' });
    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }));
    await screen.findByText('Which action?');
    fireEvent.click(screen.getByLabelText('Report it'));
    fireEvent.click(screen.getByRole('button', { name: /Next question/ }));
    fireEvent.click(screen.getByLabelText('False'));
    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit assessment' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit assessment' }));
    await screen.findByText(/The training service could not complete the request/);
    assert.match(document.body.textContent, /Report it/);
    assert.doesNotMatch(document.body.textContent, /PRIVATE_SUBMISSION|Correct answer:/);
    assert.equal(screen.getByRole('button', { name: 'Submit assessment' }).disabled, false);
  });

  await t.test('failed attempt offers retry; exhausted attempts and authorization errors remain safe', async () => {
    let mode = 'failed';
    globalThis.fetch = async (path) => {
      if (mode === 'denied') return reply({ error: { code: 'UNAUTHORIZED', message: 'PRIVATE_AUTH' } }, 401);
      if (path === `/api/training/${assignmentId}/quiz`) return reply({ available: true, reason: null, quiz: employeeQuiz(), attempts: [
        { ...summary('SUBMITTED'), passed: false, scorePercent: '0' }], attemptsRemaining: mode === 'failed' ? 1 : 0 });
      if (path.endsWith('/quiz/attempts')) return reply({ attempt: { ...summary(), attemptNumber: 2 }, quiz: employeeQuiz() });
      throw new Error(`Unexpected ${path}`);
    };
    render(createElement(EmployeeQuizPanel, { assignmentId }));
    await screen.findByRole('button', { name: 'Start assessment' });
    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }));
    await screen.findByText('Which action?');
    cleanup(); mode = 'exhausted'; render(createElement(EmployeeQuizPanel, { assignmentId }));
    await screen.findByText(/No attempts remain/);
    cleanup(); mode = 'denied'; render(createElement(EmployeeQuizPanel, { assignmentId }));
    await screen.findByText('Training could not be loaded');
    assert.doesNotMatch(document.body.textContent, /Which action\?|PRIVATE_AUTH/);
  });
});
