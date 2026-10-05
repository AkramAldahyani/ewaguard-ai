import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';

// Render the actual routes/guards with isolated session fixtures; no browser or backend is simulated.
test('employee portal routes, preview boundaries and safe profile rendering', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { AppRoutes } = await server.ssrLoadModule('/src/App.jsx');
  const { AuthContext } = await server.ssrLoadModule('/src/context/auth-context.js');
  const user = { firstName: 'Portal', lastName: 'Fixture', email: 'portal@example.invalid', employeeIdentifier: 'QA-001', department: { name: 'Operations' }, role: 'EMPLOYEE', passwordHash: 'MUST_NOT_RENDER', id: 'INTERNAL_ID_MUST_NOT_RENDER' };
  function render(path, session = { user, loading: false }) {
    return renderToStaticMarkup(createElement(AuthContext.Provider, { value: { logout: async () => {}, ...session } },
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(AppRoutes))));
  }
  const pages = [['/', 'Welcome, Portal'], ['/assistant', 'Ask EWAGuard AI'], ['/analyze/email', 'Analyze Email'], ['/analyze/url', 'Analyze URL'], ['/analyze/file', 'Analyze File'], ['/password-security', 'Password Security'], ['/incidents', 'My Incidents'], ['/training', 'My Training'], ['/monthly-quiz', 'Monthly Quiz'], ['/certificates', 'Certificates'], ['/community', 'Security Community'], ['/profile', 'Profile']];
  await t.test('all employee destinations render with complete navigation', () => {
    for (const [path, title] of pages) {
      const html = render(path);
      assert.match(html, new RegExp(`<h1[^>]*>${title}</h1>`));
      for (const [destination] of pages) assert.ok(html.includes(`href="${destination}"`), `Missing ${destination} from ${path}`);
      assert.doesNotMatch(html, /Administrator workspace/);
    }
  });
  await t.test('only the local assistant composer accepts preview text; file selection never exists', () => {
    for (const [path] of pages.filter(([path]) => path !== '/profile')) {
      const html = render(path);
      if (path !== '/password-security') assert.match(html, /Preview only/);
      for (const control of html.matchAll(/<(?:input|textarea)\b[^>]*>/g)) {
        if (path === '/assistant') assert.match(control[0], /id="chat-message"/);
        else if (path !== '/password-security') assert.match(control[0], /disabled=""/);
      }
      assert.doesNotMatch(html, /type="file"/);
    }
    assert.doesNotMatch(render('/'), /68%|Representative only/);
  });
  await t.test('password security is operational, local-only, and employee restricted', () => {
    const html = render('/password-security');
    assert.match(html, /Private by design/);
    assert.match(html, /id="password-analysis"/);
    assert.match(html, /id="password-length"/);
    assert.match(html, /Generate password/);
    assert.match(html, /no backend endpoint/i);
    assert.doesNotMatch(html, /Preview only|coming later/);
  });
  await t.test('assistant has labeled controls, suggestions and an employee-only showcase', () => {
    const html = render('/assistant');
    assert.match(html, /How can EWAGuard AI help/);
    assert.match(html, /I received a suspicious email/);
    assert.match(html, /How does MFA protect my account/);
    assert.match(html, /maxLength="2000"/i);
    assert.match(html, /Shift/);
    assert.match(html, /OpenAI and security tools are not connected/);
    assert.match(html, /h-\[calc\(100dvh-4\.75rem\)\]/);
    assert.match(html, /min-h-0 min-w-0 flex-1/);
    assert.match(html, /shrink-0 border-t/);
    assert.match(render('/design-system/chat'), /Chat component previews/);
    assert.doesNotMatch(render('/design-system/chat', { user: null, loading: false }), /Chat component previews/);
    assert.doesNotMatch(render('/design-system/chat', { user: { ...user, role: 'IT_SECURITY_ADMIN' }, loading: false }), /Chat component previews/);
  });
  await t.test('profile uses session fields and does not serialize internal fields', () => {
    const html = render('/profile');
    for (const value of ['Portal Fixture', user.email, user.employeeIdentifier, user.department.name]) assert.ok(html.includes(value));
    assert.doesNotMatch(html, /MUST_NOT_RENDER|INTERNAL_ID/);
    const missing = render('/profile', { user: { ...user, department: null, employeeIdentifier: null }, loading: false });
    assert.match(missing, /Not assigned/); assert.match(missing, /Not provided/);
  });
  await t.test('anonymous and loading sessions do not render employee content', () => {
    for (const [path, title] of pages) {
      assert.doesNotMatch(render(path, { user: null, loading: false }), new RegExp(`<h1[^>]*>${title}</h1>`));
      const html = render(path, { user: null, loading: true });
      assert.match(html, /Checking your secure session/); assert.doesNotMatch(html, /Primary navigation/);
    }
  });
  await t.test('admin does not receive employee pages or navigation; employees cannot render admin area', () => {
    for (const [path, title] of pages) {
      const html = render(path, { user: { ...user, role: 'IT_SECURITY_ADMIN' }, loading: false });
      assert.doesNotMatch(html, new RegExp(`<h1[^>]*>${title}</h1>`));
      assert.doesNotMatch(html, /href="\/training"|href="\/analyze\/email"|href="\/monthly-quiz"/);
    }
    assert.doesNotMatch(render('/admin'), /Authorized access for IT and security administrators/);
    assert.match(render('/unauthorized'), /Access restricted/);
  });
});
