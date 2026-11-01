import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { createTrainingApi } from '../src/features/training/training-api.js';
import { courseBody, emptyDraft, fromProgram, listQuery, nextSection, trainingError, validateDraft } from '../src/features/training/training-model.js';

const id = '123e4567-e89b-42d3-a456-426614174000';
const employeeId = '123e4567-e89b-42d3-a456-426614174001';
const draft = () => ({ ...emptyDraft(), title: 'Recognizing suspicious requests', description: 'A reviewed example course.',
  learningObjectives: ['Identify warning signs.'], content: { version: 1, sections: [
    { key: 'introduction', title: 'Introduction', body: 'A suspicious message may ask for secrets.' },
    { key: 'key-takeaways', title: 'Key takeaways', body: 'Use the approved reporting channel.' },
  ] } });

test('administrator API follows the course lifecycle and assignment contract', async () => {
  const calls = []; const request = async (path, options) => { calls.push([path, options]); return { program: { id } }; };
  const api = createTrainingApi(true, request);
  await api.programs(listQuery({ search: 'suspicious', topic: 'PHISHING', status: 'DRAFT', sort: 'title_asc' }, 2, true));
  await api.create(courseBody(draft())); await api.detail(id);
  for (const operation of ['edit', 'review', 'publish', 'archive']) await api.change(id, operation, operation === 'edit' ? { ...courseBody(draft()), expectedUpdatedAt: 'v1' } : { expectedUpdatedAt: 'v1' });
  await api.employees({ page: 2, pageSize: 20, search: 'Ava' });
  await api.assignments(id, { page: 3, pageSize: 20, status: 'IN_PROGRESS' }); await api.assign(id, employeeId);
  assert.deepEqual(calls.map(([path]) => path), [
    '/api/admin/training?page=2&pageSize=20&status=DRAFT&topic=PHISHING&sort=title_asc&search=suspicious',
    '/api/admin/training', `/api/admin/training/${id}`,
    ...['edit', 'review', 'publish', 'archive'].map((operation) => `/api/admin/training/${id}/${operation}`),
    '/api/admin/training/employees?page=2&pageSize=20&search=Ava',
    `/api/admin/training/${id}/assignments?page=3&pageSize=20&status=IN_PROGRESS`, `/api/admin/training/${id}/assignments`,
  ]);
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body), { employeeId });
  assert.deepEqual(JSON.parse(calls[3][1].body).expectedUpdatedAt, 'v1');
  assert.equal(calls[2][1].cache, 'no-store');
  assert.throws(() => api.change(id, 'complete', {}), /Unsupported/);
});

test('employee API sends only assignment-scoped progress actions', async () => {
  const calls = []; const api = createTrainingApi(false, async (path, options) => { calls.push([path, options]); return {}; });
  await api.mine({ page: 2, pageSize: 20, status: 'IN_PROGRESS' }); await api.detail(id); await api.start(id); await api.acknowledge(id, 'introduction');
  assert.deepEqual(calls.map(([path]) => path), ['/api/training?page=2&pageSize=20&status=IN_PROGRESS', `/api/training/${id}`, `/api/training/${id}/start`, `/api/training/${id}/sections`]);
  assert.deepEqual(JSON.parse(calls[2][1].body), {}); assert.deepEqual(JSON.parse(calls[3][1].body), { sectionKey: 'introduction', acknowledged: true });
  assert.ok(!('create' in api) && !('assign' in api));
  assert.doesNotMatch(JSON.stringify(calls), /progressPercent|COMPLETED|userId|role|token/);
});

test('editor validation, pagination and saved progress boundaries', () => {
  const course = draft(); assert.equal(validateDraft(course), '');
  assert.equal(courseBody({ ...course, estimatedMinutes: '6' }).estimatedMinutes, 6);
  assert.deepEqual(fromProgram(course), course);
  for (const broken of [
    { ...course, title: '<img onerror=alert(1)>' }, { ...course, learningObjectives: [''] }, { ...course, estimatedMinutes: 61 },
    { ...course, content: { version: 1, sections: [course.content.sections[0]] } },
    { ...course, content: { version: 1, sections: [course.content.sections[0], { ...course.content.sections[1], key: 'introduction' }] } },
    { ...course, content: { version: 1, sections: [course.content.sections[0], { ...course.content.sections[1], body: '<script>alert(1)</script>' }] } },
  ]) assert.ok(validateDraft(broken));
  assert.throws(() => listQuery({ search: 'a'.repeat(101) }, 1, true), /100/);
  const assignment = { training: { content: course.content }, progress: { status: 'IN_PROGRESS', progressPercent: 50, completedSectionKeys: ['introduction'] } };
  assert.equal(nextSection(assignment), 1);
  assert.equal(nextSection({ ...assignment, progress: { ...assignment.progress, completedSectionKeys: ['introduction', 'key-takeaways'] } }), -1);
  assert.match(trainingError({ status: 409, code: 'TRAINING_STALE' }), /draft was not saved/);
  for (const status of [401, 403, 404, 429, 500]) assert.doesNotMatch(trainingError({ status, message: 'RAW_SECRET' }), /RAW_SECRET/);
});

test('training routes, editor controls and content use role guards and safe text', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { AppRoutes } = await server.ssrLoadModule('/src/App.jsx');
  const { AuthContext } = await server.ssrLoadModule('/src/context/auth-context.js');
  const { CourseContent, ProgressBar, TrainingBadge } = await server.ssrLoadModule('/src/features/training/TrainingCommon.jsx');
  function route(path, role) { return renderToStaticMarkup(createElement(AuthContext.Provider, { value: { user: { id: role, role, firstName: 'Synthetic', lastName: 'Tester' }, loading: false, logout: async () => {} } }, createElement(MemoryRouter, { initialEntries: [path] }, createElement(AppRoutes)))); }
  assert.match(route('/training', 'EMPLOYEE'), /My Training|Loading training/);
  assert.match(route('/training/' + id, 'EMPLOYEE'), /Loading training/);
  assert.match(route('/admin/training', 'IT_SECURITY_ADMIN'), /Training programs/);
  const form = route('/admin/training/new', 'IT_SECURITY_ADMIN');
  for (const name of ['Course essentials', 'Learning objectives', 'Learning sections', 'Create draft', 'Preview material', 'Quiz required']) assert.match(form, new RegExp(name));
  assert.match(form, /Move section 1 down|Move section 2 up/);
  assert.doesNotMatch(route('/admin/training/new', 'EMPLOYEE'), /Course essentials/);
  assert.doesNotMatch(route('/training', 'IT_SECURITY_ADMIN'), /No assigned courses/);
  const hostile = { ...draft(), content: { version: 1, sections: [{ key: 'one', title: '<script>title</script>', body: '<img src=x onerror=alert(1)>' }] } };
  const material = renderToStaticMarkup(createElement(CourseContent, { course: hostile }));
  assert.match(material, /&lt;img/); assert.doesNotMatch(material, /<img src=x|<script>/);
  assert.match(renderToStaticMarkup(createElement(ProgressBar, { progress: { progressPercent: 75 } })), /aria-valuenow="75"/);
  assert.match(renderToStaticMarkup(createElement(TrainingBadge, { status: 'ARCHIVED' })), /Archived/);
});

test('lesson bodies render structured plain text without interpreting HTML', async (t) => {
  const { lessonBlocks } = await import('../src/features/training/lesson-blocks.js');
  assert.deepEqual(lessonBlocks('One paragraph.\nSame paragraph.\n\nSigns:\n- first\n- second\n\n1. step one\n2. step two'), [
    { type: 'paragraph', lines: ['One paragraph.', 'Same paragraph.'] },
    { type: 'list', lead: 'Signs:', items: ['first', 'second'] },
    { type: 'steps', lead: null, items: ['step one', 'step two'] },
  ]);
  assert.deepEqual(lessonBlocks('Key takeaway: Report quickly.'), [{ type: 'callout', variant: 'takeaway', label: 'Key takeaway', title: null,
    blocks: [{ type: 'paragraph', lines: ['Report quickly.'] }] }]);
  assert.equal(lessonBlocks('Example: The email\nFrom: someone@example.com')[0].title, 'The email');
  assert.deepEqual(lessonBlocks('Plain legacy text without markers.'), [{ type: 'paragraph', lines: ['Plain legacy text without markers.'] }]);
  assert.deepEqual(lessonBlocks(undefined), []);

  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { CourseContent } = await server.ssrLoadModule('/src/features/training/TrainingCommon.jsx');
  const { phishingAwarenessCourse } = await import('../../backend/src/training/content/phishing-awareness.js');
  const first = renderToStaticMarkup(createElement(CourseContent, { course: phishingAwarenessCourse, activeIndex: 0 }));
  for (const text of ['What you will learn', '5 sections', 'About 9 minutes', 'Final quiz required', 'Lesson 1: What is phishing?', 'Key takeaway']) assert.match(first, new RegExp(text));
  assert.match(first, /<aside aria-label="Example: An unexpected email"/); assert.match(first, /<ul class="mt-2/);
  const later = renderToStaticMarkup(createElement(CourseContent, { course: phishingAwarenessCourse, activeIndex: 2 }));
  assert.doesNotMatch(later, /What you will learn/); assert.match(later, /Section 3 of 5/); assert.match(later, /<ol class="mt-2/);
  assert.match(later, /Watch out: The unsafe action/);
  const hostile = { ...phishingAwarenessCourse, content: { version: 1, sections: [{ key: 'one', title: 'T', body: 'Tip: <img src=x onerror=alert(1)>\n- <script>x</script>\n\n' + 'long '.repeat(1200) }] } };
  const markup = renderToStaticMarkup(createElement(CourseContent, { course: hostile }));
  assert.doesNotMatch(markup, /<img src=x|<script>/); assert.match(markup, /&lt;img/); assert.match(markup, /break-words/);
});

test('every provisioned course renders each lesson with accessible structure and plain text only', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { CourseContent } = await server.ssrLoadModule('/src/features/training/TrainingCommon.jsx');
  const { trainingContent } = await import('../../backend/src/training/content/index.js');
  for (const { course } of Object.values(trainingContent)) {
    const sections = course.content.sections;
    for (const [index, section] of sections.entries()) {
      const html = renderToStaticMarkup(createElement(CourseContent, { course, activeIndex: index }));
      assert.equal(/What you will learn/.test(html), index === 0, `${course.title} overview only on lesson 1`);
      assert.match(html, new RegExp(`Section ${index + 1} of 5`));
      assert.match(html, /<h2[^>]*>Lesson \d: /);
      assert.match(html, /<aside aria-label="Key takeaway/, `${course.title}: ${section.key}`);
      assert.match(html, /<ul class="mt-2|<ol class="mt-2/, `${course.title}: ${section.key} has a list`);
      assert.doesNotMatch(html, /<(script|img|iframe|a )/i);
    }
  }
  const privacy = renderToStaticMarkup(createElement(CourseContent, { course: trainingContent['data-privacy'].course, activeIndex: 4 }));
  assert.match(privacy, /aria-label="Example: You want to use an AI tool to summarize a work document"/);
  const browsing = renderToStaticMarkup(createElement(CourseContent, { course: trainingContent['safe-browsing'].course, activeIndex: 3 }));
  assert.match(browsing, /aria-label="Example: The sticker in the break room"/); assert.match(browsing, /cafeteria-rewards\.example/);
  const tailgating = renderToStaticMarkup(createElement(CourseContent, { course: trainingContent['physical-security'].course, activeIndex: 2 }));
  assert.match(tailgating, /aria-label="Example: The forgotten badge"/); assert.match(tailgating, /aria-label="Watch out: Stay safe"/);
  const reported = renderToStaticMarkup(createElement(CourseContent, { course: trainingContent['reporting-security-incidents'].course, activeIndex: 4 }));
  assert.match(reported, /aria-label="Example: Doing it right"/); assert.equal((reported.match(/<ol class="mt-2/g) ?? []).length, 2);
});
