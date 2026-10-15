import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router';
import { validateAwarenessFilters } from '../src/features/analytics/awareness-analytics-api.js';

const programId = '123e4567-e89b-42d3-a456-426614174201';
const departmentId = '123e4567-e89b-42d3-a456-426614174202';
const data = {
  generatedAt: '2091-02-28T12:00:00Z', range: { period: 'custom', start: '2091-01-01', end: '2091-02-28', days: 59, timezone: 'UTC' },
  filterOptions: { departments: [{ id: departmentId, name: 'Operations' }], departmentsTruncated: false },
  training: { assignedPrograms: 1, assignments: 10, assignedEmployees: 8, completed: 6, inProgress: 3, notStarted: 1,
    completionRatePercent: 60, completedDuring: 7, byProgram: [{ id: programId, title: 'Phishing basics', assignments: 10, completed: 6, inProgress: 3, notStarted: 1, completionRatePercent: 60 }], programsTruncated: false },
  courseQuizzes: { submittedAttempts: 9, uniqueParticipants: 7, passedAttempts: 6, failedAttempts: 3,
    passRatePercent: 66.67, failRatePercent: 33.33, averageScorePercent: 78.5,
    byProgram: [{ id: programId, title: 'Phishing basics', submittedAttempts: 9, uniqueParticipants: 7, passedAttempts: 6, averageScorePercent: 78.5 }], programsTruncated: false },
  monthlyQuizzes: { months: 2, assignedAssignments: 12, submittedAssignments: 8, averageBestScorePercent: 72.5,
    trend: [{ period: '2091-01', assigned: 6, submitted: 4, participationRatePercent: 66.67, averageScorePercent: 80, averageChangePoints: null },
      { period: '2091-02', assigned: 6, submitted: 4, participationRatePercent: 66.67, averageScorePercent: 65, averageChangePoints: -15 }] },
  certificates: { totalIssued: 11, issuedDuring: 5, byProgram: [{ id: programId, title: 'Phishing basics', totalIssued: 11, issuedDuring: 5 }], programsTruncated: false },
  departments: { suppressed: false, minimumGroupSize: 5, rows: [{ id: departmentId, name: 'Operations', activeEmployeesNow: 8,
    trainingAssignments: 10, completedAssignments: 6, completionRatePercent: 60, monthlyAssigned: 6, monthlySubmitted: 4,
    monthlyParticipationRatePercent: 66.67, monthlyAverageScorePercent: null }] },
};
const reply = (body, status = 200) => Response.json(body, { status });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test('Phase 13C2 filter validation follows UTC and 366-day backend bounds', () => {
  assert.equal(validateAwarenessFilters({ period: '90d' }), '');
  assert.equal(validateAwarenessFilters({ period: 'custom', start: '2091-01-01', end: '2091-02-28', monthlyPeriod: '2091-02' }), '');
  assert.match(validateAwarenessFilters({ period: 'custom', start: '2091-02-30', end: '2091-03-01' }), /valid/);
  assert.match(validateAwarenessFilters({ period: 'custom', start: '2091-02-02', end: '2091-02-01' }), /on or after/);
  assert.match(validateAwarenessFilters({ period: 'custom', start: '2091-01-01', end: '2092-02-01' }), /366/);
  assert.match(validateAwarenessFilters({ period: 'custom', start: '2091-01-01', end: '2091-02-28', monthlyPeriod: '2091-03' }), /month/);
  assert.match(validateAwarenessFilters({ period: '30d', monthlyPeriod: '2091-01' }, new Date('2091-02-28T12:00:00Z')), /month/);
});

test('Phase 13C2 administrator awareness interface', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'CustomEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  const { render, screen, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react');
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { AwarenessAnalyticsPage } = await vite.ssrLoadModule('/src/features/analytics/AwarenessAnalyticsPage.jsx');
  const mount = () => render(createElement(MemoryRouter, null, createElement(AwarenessAnalyticsPage)));
  t.after(async () => { cleanup(); await vite.close(); dom.window.close(); delete globalThis.fetch; });
  t.afterEach(() => cleanup());

  await t.test('maps backend counts, charts, denominators, privacy and management navigation', async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => { calls.push([path, options]); return reply(data); };
    mount(); assert.ok(screen.getByRole('status', { name: 'Loading awareness analytics' }));
    await screen.findByRole('heading', { name: 'Monthly quiz trend' });
    assert.equal(calls[0][0], '/api/admin/analytics/awareness?period=90d');
    assert.equal(calls[0][1].credentials, 'include');
    const cards = screen.getByRole('region', { name: 'Awareness metrics' });
    for (const [title, value] of [['Training assignments', '10'], ['Completion rate', '60%'], ['Completed during period', '7'],
      ['Course quiz attempts', '9'], ['Course mean score', '78.5%'], ['Monthly participation', '8 / 12'],
      ['Monthly mean best score', '72.5%'], ['Certificates issued', '5']])
      assert.equal(within(within(cards).getByText(title).closest('section')).getByText(value).textContent, value);
    assert.ok(screen.getByRole('list', { name: 'Training assignment status' }));
    assert.ok(screen.getByRole('list', { name: 'Completion by training program' }));
    assert.ok(screen.getByRole('img', { name: /Average score trend for 2 scored months/ }));
    assert.ok(screen.getByRole('table', { name: 'Monthly quiz participation and best score averages' }));
    assert.match(screen.getByRole('table', { name: 'Eligible department training and monthly quiz comparisons' }).textContent, /suppressed/i);
    for (const [title, path] of [['Training Management', '/admin/training'], ['Course Quizzes', '/admin/training'],
      ['Monthly Quizzes', '/admin/monthly-quizzes'], ['Certificates', '/admin/certificates']])
      assert.equal(screen.getByRole('link', { name: title }).getAttribute('href'), path);
    assert.match(dom.window.document.body.textContent, /2091-01-01 through 2091-02-28|current/);
  });

  await t.test('filters use backend parameters, program search and reset', async () => {
    const calls = [];
    globalThis.fetch = async (path) => { calls.push(path); return path.startsWith('/api/admin/training?') ? reply({ items: [{ id: programId, title: 'Phishing basics' }], hasMore: false }) : reply(data); };
    mount(); await screen.findByRole('heading', { name: 'Monthly quiz trend' });
    fireEvent.change(screen.getByLabelText('Find a training program'), { target: { value: 'phishing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search programs' }));
    await waitFor(() => assert.ok(calls.some((path) => path.includes('/api/admin/training?sort=title_asc&pageSize=50&search=phishing'))));
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2091-01-01' } });
    fireEvent.change(screen.getByLabelText('End date (UTC)'), { target: { value: '2091-02-28' } });
    fireEvent.change(screen.getByLabelText('Training program'), { target: { value: programId } });
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: departmentId } });
    fireEvent.change(screen.getByLabelText('Training completion status'), { target: { value: 'COMPLETED' } });
    fireEvent.change(screen.getByLabelText('Monthly quiz period'), { target: { value: '2091-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => assert.ok(calls.some((path) => path.includes(`period=custom&start=2091-01-01&end=2091-02-28&programId=${programId}&departmentId=${departmentId}&completionStatus=COMPLETED&monthlyPeriod=2091-02`))));
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() => assert.equal(calls.filter((path) => path === '/api/admin/analytics/awareness?period=90d').length, 2));
  });

  await t.test('invalid date inputs do not fetch, and stale results cannot overwrite newer filters', async () => {
    const late = deferred(), calls = [];
    globalThis.fetch = (path) => { calls.push(path); return calls.length === 1 ? late.promise : Promise.resolve(reply({ ...data, training: { ...data.training, assignments: 21 } })); };
    mount();
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    assert.match(screen.getByRole('alert').textContent, /valid start and end/);
    assert.equal(calls.length, 1);
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: '30d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => assert.ok(calls.includes('/api/admin/analytics/awareness?period=30d')));
    await screen.findByRole('heading', { name: 'Monthly quiz trend' });
    late.resolve(reply(data));
    await waitFor(() => assert.equal(within(screen.getByRole('region', { name: 'Awareness metrics' })).getByText('21').textContent, '21'));
  });

  await t.test('empty, suppression, errors, retry and authorization failures clear private content', async () => {
    const empty = { ...data, training: { ...data.training, assignedPrograms: 0, assignments: 0, assignedEmployees: 0,
      completed: 0, inProgress: 0, notStarted: 0, completionRatePercent: null, completedDuring: 0, byProgram: [] },
    courseQuizzes: { ...data.courseQuizzes, submittedAttempts: 0, uniqueParticipants: 0, passedAttempts: 0,
      failedAttempts: 0, passRatePercent: null, averageScorePercent: null, byProgram: [] },
    monthlyQuizzes: { months: 0, assignedAssignments: 0, submittedAssignments: 0, averageBestScorePercent: null, trend: [] },
    certificates: { totalIssued: 0, issuedDuring: 0, byProgram: [] }, departments: { suppressed: true, minimumGroupSize: 5, rows: [] } };
    let mode = 'empty';
    globalThis.fetch = async () => mode === 'empty' ? reply(empty) : mode === 'error' ? reply({ error: { message: 'PRIVATE_ERROR' } }, 500)
      : mode === 'denied' ? reply({ error: { message: 'PRIVATE_MFA' } }, 403) : reply({ error: { message: 'PRIVATE_SESSION' } }, 401);
    mount(); await screen.findByText('No monthly quizzes in this period.');
    assert.match(dom.window.document.body.textContent, /Department comparisons are hidden/);
    assert.match(dom.window.document.body.textContent, /No submitted course quiz attempts/);
    mode = 'error'; fireEvent.click(screen.getByRole('button', { name: 'Refresh analytics' }));
    await screen.findByText('Awareness analytics unavailable');
    assert.doesNotMatch(dom.window.document.body.textContent, /PRIVATE_ERROR|No monthly quizzes in this period/);
    mode = 'denied'; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(/verified MFA/);
    assert.doesNotMatch(dom.window.document.body.textContent, /PRIVATE_MFA/);
    mode = 'expired'; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(/session has expired/);
    assert.doesNotMatch(dom.window.document.body.textContent, /PRIVATE_SESSION/);
  });
});
