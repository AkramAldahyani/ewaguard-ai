import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter, Route, Routes } from 'react-router';

// BUG-008: a quiz-required course cannot be published without an approved quiz or assigned without a published quiz.
const courseId = '123e4567-e89b-42d3-a456-426614174100';
const time = '2026-11-10T00:00:00.000Z';
const course = (changes) => ({
  id: courseId,
  title: 'Quiz-gated course',
  description: 'Overview.',
  topic: 'PHISHING',
  estimatedMinutes: 6,
  status: 'DRAFT',
  version: 1,
  requiresQuiz: true,
  learningObjectives: ['Identify warning signs.'],
  content: {
    version: 1,
    sections: [
      { key: 'intro', title: 'Intro', body: 'Read this.' },
      { key: 'end', title: 'End', body: 'Done.' },
    ],
  },
  createdAt: time,
  updatedAt: time,
  publishedAt: null,
  reviewedAt: time,
  createdBy: { firstName: 'Security', lastName: 'Trainer' },
  reviewedBy: { firstName: 'Security', lastName: 'Reviewer' },
  courseQuizStatus: null,
  ...changes,
});
const reply = (body, status = 200) => Response.json(body, { status });

test('BUG-008 quiz readiness gates publication and assignment in the admin course page', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Node',
    'Event',
    'MutationObserver',
    'CustomEvent',
    'HTMLDialogElement',
  ])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
  const { render, screen, cleanup, findByText } = await import('@testing-library/react');
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  const { AdminTrainingDetailPage } = await vite.ssrLoadModule('/src/features/training/AdminTrainingPages.jsx');
  const mount = (view = '') =>
    render(
      createElement(
        MemoryRouter,
        { initialEntries: [`/admin/training/${courseId}${view}`] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/admin/training/:id', element: createElement(AdminTrainingDetailPage) }),
        ),
      ),
    );
  t.after(async () => {
    cleanup();
    await vite.close();
    dom.window.close();
    delete globalThis.fetch;
  });
  t.afterEach(() => cleanup());
  const serve = (program) => {
    const calls = [];
    globalThis.fetch = async (path) => {
      calls.push(path);
      if (path === `/api/admin/training/${courseId}`) return reply({ program });
      return reply({ items: [], page: 1, pageSize: 20, hasMore: false });
    };
    return calls;
  };

  await t.test('reviewed draft without an approved quiz cannot be published', async () => {
    for (const courseQuizStatus of [null, 'DRAFT']) {
      serve(course({ courseQuizStatus }));
      const { container } = mount();
      const publish = await screen.findByRole('button', { name: 'Publish program' });
      assert.equal(publish.disabled, true, String(courseQuizStatus));
      assert.match(container.textContent, /create and approve it in the Course quiz tab before publishing/);
      cleanup();
    }
    serve(course({ courseQuizStatus: 'APPROVED' }));
    mount();
    assert.equal((await screen.findByRole('button', { name: 'Publish program' })).disabled, false);
    cleanup();
    serve(course({ requiresQuiz: false }));
    mount();
    assert.equal(
      (await screen.findByRole('button', { name: 'Publish program' })).disabled,
      false,
      'material-only courses are unaffected',
    );
  });

  await t.test(
    'published course without a published quiz shows why it cannot be assigned and loads no employees',
    async () => {
      const calls = serve(course({ status: 'PUBLISHED', publishedAt: time, courseQuizStatus: 'APPROVED' }));
      const { container } = mount('?view=assignments');
      await findByText(container, /Publish the course quiz from the Course quiz tab before assigning employees/);
      assert.equal(screen.queryByRole('button', { name: 'Assign to all active employees' }), null);
      assert.equal(
        calls.some((path) => path.startsWith('/api/admin/training/employees')),
        false,
      );
      cleanup();
      const ready = serve(course({ status: 'PUBLISHED', publishedAt: time, courseQuizStatus: 'PUBLISHED' }));
      mount('?view=assignments');
      await screen.findByRole('button', { name: 'Assign to all active employees' });
      assert.doesNotMatch(dom.window.document.body.textContent, /Publish the course quiz/);
      assert.ok(ready.some((path) => path.startsWith('/api/admin/training/employees')));
    },
  );
});
