import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('Phase 19A shared layout and accessible design contracts', async (t) => {
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => vite.close());
  const { AppRoutes } = await vite.ssrLoadModule('/src/App.jsx');
  const { AuthContext } = await vite.ssrLoadModule('/src/context/auth-context.js');
  const { PageHeader } = await vite.ssrLoadModule('/src/components/PageHeader.jsx');
  const ui = await vite.ssrLoadModule('/src/components/ui/index.jsx');
  const { AlertCircle } = await vite.ssrLoadModule('lucide-react');
  const documentFor = (node, path = '/') => new JSDOM(renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, node))).window.document;
  const portal = (path, role) => documentFor(createElement(AuthContext.Provider, { value: {
    user: { id: 'layout-fixture', firstName: 'Layout', lastName: 'Review', role }, loading: false, logout: async () => {},
  } }, createElement(AppRoutes)), path);

  await t.test('administrator destinations stay unique in each navigation and parent stays active for detail routes', () => {
    for (const path of ['/admin', '/admin/training/example', '/admin/incidents/example', '/admin/monthly-quizzes/example']) {
      const doc = portal(path, 'IT_SECURITY_ADMIN');
      for (const nav of doc.querySelectorAll('nav[aria-label="Primary navigation"]')) {
        const links = [...nav.querySelectorAll('a')];
        const hrefs = links.map((a) => a.getAttribute('href'));
        assert.deepEqual(hrefs, ['/admin', '/admin/incidents', '/admin/analytics/security', '/admin/analytics/incidents', '/admin/audit',
          '/admin/training', '/admin/monthly-quizzes', '/admin/certificates', '/admin/analytics/awareness', '/admin/community', '/admin/users', '/profile']);
        assert.equal(new Set(hrefs).size, hrefs.length);
        assert.equal(nav.querySelectorAll('a[aria-current="page"]').length, 1);
        assert.match(nav.textContent, /Security operations/);
        assert.match(nav.textContent, /Security awareness/);
      }
      assert.ok(doc.querySelector('button[aria-label="Sign out"]'));
      assert.ok(doc.querySelector('a[href="#main-content"]'));
      assert.equal(doc.querySelector('#main-content').getAttribute('tabindex'), '-1');
    }
  });
  await t.test('employee navigation preserves destinations, active page, profile and mobile dialog control', () => {
    const doc = portal('/training/example', 'EMPLOYEE');
    for (const nav of doc.querySelectorAll('nav[aria-label="Primary navigation"]')) {
      assert.equal(nav.querySelector('a[aria-current="page"]').getAttribute('href'), '/training');
      assert.equal(nav.querySelector('a[href^="/admin"]'), null);
      assert.ok(nav.querySelector('a[href="/profile"]'));
    }
    assert.equal(doc.querySelector('button[aria-label="Open navigation"]').getAttribute('aria-controls'), 'mobile-navigation');
    assert.ok(doc.querySelector('dialog#mobile-navigation[aria-label="Mobile navigation"]'));
  });
  await t.test('breadcrumbs have one current page and a role-appropriate root', () => {
    for (const [path, root] of [['/training/example', '/'], ['/admin/training/example', '/admin']]) {
      const doc = documentFor(createElement(PageHeader, { title: 'Detailed course title', breadcrumbs: ['Training', 'Course'], actions: createElement(ui.Button, null, 'Review course') }), path);
      assert.equal(doc.querySelector('nav a').getAttribute('href'), root);
      assert.equal(doc.querySelectorAll('[aria-current="page"]').length, 1);
      assert.equal(doc.querySelector('h1').textContent, 'Detailed course title');
      assert.equal(doc.querySelector('button').textContent, 'Review course');
    }
  });
  await t.test('shared errors announce useful text and fields preserve error associations', () => {
    const loading = documentFor(createElement(ui.LoadingPanel, { label: 'Loading records…' }));
    assert.equal(loading.querySelector('[role="status"]').textContent, 'Loading records…');
    assert.equal(loading.querySelectorAll('[aria-hidden="true"]').length, 2);
    const state = documentFor(createElement(ui.StatePanel, { icon: AlertCircle, tone: 'error', title: 'Unable to load', description: 'Try again shortly.', action: createElement(ui.Button, null, 'Retry') }));
    assert.match(state.querySelector('[role="alert"]').textContent, /Unable to load.*Try again shortly.*Retry/);
    const field = documentFor(createElement(ui.Field, { id: 'reference', label: 'Reference', error: 'Enter a reference.' }, (props) => createElement(ui.Input, props)));
    assert.equal(field.querySelector('input').getAttribute('aria-describedby'), 'reference-error');
    assert.equal(field.querySelector('input').getAttribute('aria-invalid'), 'true');
    assert.equal(field.querySelector('label').getAttribute('for'), 'reference');
  });
  await t.test('community tabs name their view and identify the active panel', () => {
    const doc = portal('/community', 'EMPLOYEE');
    const tablist = doc.querySelector('[role="tablist"]');
    const selected = tablist.querySelector('[role="tab"][aria-selected="true"]');
    const panel = doc.querySelector('[role="tabpanel"]');
    assert.equal(tablist.getAttribute('aria-label'), 'Community views');
    assert.equal(selected.getAttribute('aria-controls'), panel.id);
    assert.equal(panel.getAttribute('aria-labelledby'), selected.id);
    assert.equal(panel.getAttribute('tabindex'), '0');
  });
  await t.test('trend containers are keyboard accessible without losing underlying data', async () => {
    const { CreationTrend } = await vite.ssrLoadModule('/src/features/analytics/SecurityAnalyticsCharts.jsx');
    const { MonthlyTrends } = await vite.ssrLoadModule('/src/features/analytics/AwarenessAnalyticsCharts.jsx');
    const incident = documentFor(createElement(CreationTrend, { days: [{ day: '2026-10-01', count: 4 }] }));
    const monthly = documentFor(createElement(MonthlyTrends, { rows: [{ period: '2026-10', averageScorePercent: 70, submitted: 7, assigned: 10, participationRatePercent: 70 }] }));
    for (const doc of [incident, monthly]) {
      assert.equal(doc.querySelector('figure.ui-chart').getAttribute('tabindex'), '0');
      assert.ok(doc.querySelector('svg[role="img"][aria-label]'));
      assert.ok(doc.querySelector('details table caption'));
    }
  });
});
