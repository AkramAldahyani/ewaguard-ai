import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('community photo previews and publication review controls', async (t) => {
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
  ])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const { render, screen, fireEvent, cleanup } = await import('@testing-library/react');
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  const { CommunityImagePicker } = await vite.ssrLoadModule('/src/features/community/CommunityImagePicker.jsx');
  const { CommunityImageReview, CommunityImages } = await vite.ssrLoadModule(
    '/src/features/community/CommunityImages.jsx',
  );
  const originalCreate = URL.createObjectURL,
    originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  let counter = 0;
  URL.createObjectURL = () => `blob:fixture-${++counter}`;
  URL.revokeObjectURL = (url) => revoked.push(url);
  t.after(async () => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    await vite.close();
    dom.window.close();
  });
  t.afterEach(() => cleanup());
  await t.test('picker validates files, previews locally, removes and releases URLs', () => {
    const changes = [];
    const view = render(
      createElement(CommunityImagePicker, {
        options: { maxImages: 2, maxBytes: 1048576, formats: ['image/png'] },
        onChange: (value) => changes.push(value),
      }),
    );
    const input = screen.getByLabelText('Add photos');
    fireEvent.change(input, { target: { files: [new File(['bad'], 'script.svg', { type: 'image/svg+xml' })] } });
    assert.match(screen.getByRole('alert').textContent, /Choose JPG/);
    assert.equal(changes.length, 0);
    const image = new File(['fixture'], 'photo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [image] } });
    assert.equal(screen.getByAltText('Selected photo 1').getAttribute('src'), 'blob:fixture-1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    assert.equal(changes.at(-1).length, 0);
    assert.ok(revoked.includes('blob:fixture-1'));
    fireEvent.change(input, { target: { files: [image] } });
    view.unmount();
    assert.ok(revoked.includes('blob:fixture-2'));
  });
  const image = {
    id: 'attachment-1',
    available: true,
    width: 100,
    height: 80,
    validationStatus: 'NORMALIZED',
    clamavStatus: 'NO_KNOWN_DETECTION',
    yaraStatus: 'NO_KNOWN_DETECTION',
  };
  await t.test('administrator must load and actively acknowledge images', () => {
    const reviews = [];
    render(createElement(CommunityImageReview, { images: [image], onReview: (value) => reviews.push(value) }));
    const checkbox = screen.getByRole('checkbox');
    assert.equal(checkbox.disabled, true);
    assert.equal(checkbox.checked, false);
    const photo = screen.getByAltText('Community photo 1');
    assert.equal(photo.getAttribute('src'), '/api/admin/community/media/attachment-1');
    fireEvent.load(photo);
    assert.equal(checkbox.disabled, false);
    fireEvent.click(checkbox);
    assert.deepEqual(reviews.at(-1), ['attachment-1']);
    fireEvent.click(checkbox);
    assert.deepEqual(reviews.at(-1), []);
  });
  await t.test('feed images use protected endpoints, lazy load and degrade gracefully', () => {
    render(createElement(CommunityImages, { images: [image] }));
    const photo = screen.getByAltText('Community photo 1');
    assert.equal(photo.getAttribute('loading'), 'lazy');
    assert.equal(photo.getAttribute('src'), '/api/community/media/attachment-1');
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge photo 1' }));
    assert.ok(screen.getByAltText('Expanded community photo'));
    fireEvent.error(photo);
    assert.match(dom.window.document.body.textContent, /Image unavailable/);
  });
});
