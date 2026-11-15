import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadCommunityImages } from '../src/features/community/community-image-upload.js';
import { validateCommunityPost } from '../src/features/community/community-model.js';

const post = { title: '', body: '', category: 'SECURITY_TIP' };
function requestFixture() {
  return {
    upload: {},
    headers: {},
    open(method, url) {
      this.method = method;
      this.url = url;
    },
    setRequestHeader(key, value) {
      this.headers[key] = value;
    },
    send(form) {
      this.form = form;
    },
    abort() {
      this.onabort();
    },
  };
}
test('image-only posts require active consent and a category; text-only posts still need content', () => {
  assert.equal(validateCommunityPost(post, true, true), '');
  assert.ok(validateCommunityPost(post, false, true));
  assert.ok(validateCommunityPost(post, true, false));
  assert.ok(validateCommunityPost({ ...post, category: '' }, true, true));
});
test('multipart uploader sends consent, credentials, images and progress without a forged content type', async () => {
  const request = requestFixture(),
    progress = [];
  const promise = uploadCommunityImages(
    post,
    [new File(['fixture'], 'photo.png', { type: 'image/png' })],
    'consent-id',
    (value) => progress.push(value),
    undefined,
    () => request,
  );
  assert.equal(request.url, '/api/community/with-images');
  assert.equal(request.method, 'POST');
  assert.equal(request.withCredentials, true);
  assert.equal(request.headers['X-Community-Acknowledgement'], 'consent-id');
  assert.equal(request.headers['Content-Type'], undefined);
  assert.equal(request.form.getAll('images').length, 1);
  request.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
  assert.deepEqual(progress, [50]);
  request.status = 200;
  request.responseText = JSON.stringify({ post: { status: 'PENDING_REVIEW' } });
  request.onload();
  assert.equal((await promise).post.status, 'PENDING_REVIEW');
});
test('scanner failures and cancellation reject rather than reporting publication', async () => {
  const request = requestFixture();
  const promise = uploadCommunityImages(
    post,
    [],
    'consent-id',
    () => {},
    undefined,
    () => request,
  );
  request.status = 503;
  request.responseText = JSON.stringify({ error: { code: 'COMMUNITY_IMAGE_SCANNERS_UNAVAILABLE' } });
  request.onload();
  await assert.rejects(promise, { code: 'COMMUNITY_IMAGE_SCANNERS_UNAVAILABLE' });
  const controller = new AbortController();
  const cancelled = uploadCommunityImages(post, [], 'consent-id', () => {}, controller.signal, requestFixture);
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
});
