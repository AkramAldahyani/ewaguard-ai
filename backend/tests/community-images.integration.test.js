import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, readdir, readFile, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { createImageProcessor } from '../src/community/image-processing.js';
import { cleanupCommunityMedia } from '../src/community/media-retention.js';

test('B1 protected community images with real decoding/storage and explicit scanner fixtures', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const root = await mkdtemp(path.join(tmpdir(), 'ewaguard-media-integration-'));
  const database = createDatabaseClient(), users = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-community-images-secret-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173', COMMUNITY_MEDIA_ROOT: root });
  let scanState = 'CLEAN';
  const processor = createImageProcessor(config, config.communityMedia, { scanners: {
    clamav: async () => ({ status: scanState }), yara: async () => ({ status: 'NO_MATCH' }),
  } });
  const app = createApp(config, { database, communityMedia: { processor } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users } }, { resourceId: { in: (await database.fileAnalysis.findMany({ where: { userId: { in: users } }, select: { id: true } })).map((row) => row.id) } }] } });
    await database.postModerationAction.deleteMany({ where: { moderatorId: { in: users } } });
    await database.communityPostAttachment.deleteMany({ where: { post: { authorId: { in: users } } } });
    await database.communityPost.deleteMany({ where: { authorId: { in: users } } });
    await database.fileAnalysis.deleteMany({ where: { userId: { in: users } } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } }); await database.$disconnect();
    await rm(root, { recursive: true, force: true });
  });
  async function makeUser(role = 'EMPLOYEE') {
    const row = await database.user.create({ data: { firstName: 'Synthetic', lastName: 'Image', email: `${randomUUID()}@example.invalid`,
      status: 'ACTIVE', passwordHash: 'synthetic', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}) } });
    users.push(row.id); return row;
  }
  const employee = await makeUser(), other = await makeUser(), admin = await makeUser('IT_SECURITY_ADMIN');
  async function request(route, { actor = employee, body, form, acknowledgement, origin = config.frontendUrl, method } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: method ?? (body || form ? 'POST' : 'GET'),
      headers: { Origin: origin, ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}), ...(acknowledgement ? { 'X-Community-Acknowledgement': acknowledgement } : {}) },
      ...(body ? { body: JSON.stringify(body) } : form ? { body: form } : {}) });
    return { status: response.status, headers: response.headers,
      data: response.headers.get('content-type')?.startsWith('image/') ? Buffer.from(await response.arrayBuffer()) : await response.json() };
  }
  const ack = (await request('/api/disclaimers/acknowledge', { body: { context: 'COMMUNITY_POST' } })).data.acknowledgement.id;
  const png = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#145677' } }).png().toBuffer();
  function form(title = 'A visual security tip', bytes = png, name = 'photo.png', type = 'image/png', count = 1) {
    const value = new FormData(); value.append('title', title); value.append('body', ''); value.append('category', 'SECURITY_TIP');
    for (let index = 0; index < count; index++) value.append('images', new Blob([bytes], { type }), name);
    return value;
  }
  let post;
  const detail = async () => (await request(`/api/admin/community/${post.id}`, { actor: admin })).data.post;
  const decide = async (action, reviewedAttachmentIds, actor = admin) => request(`/api/admin/community/${post.id}/${action}`, { actor,
    body: { reason: 'Reviewed synthetic image fixture.', expectedUpdatedAt: (await detail()).updatedAt, ...(reviewedAttachmentIds ? { reviewedAttachmentIds } : {}) } });

  await t.test('upload requires identity, origin, current owned acknowledgement and bounded images', async () => {
    assert.equal((await request('/api/community/with-images', { actor: null, form: form(), acknowledgement: ack })).status, 401);
    assert.equal((await request('/api/community/with-images', { actor: other, form: form(), acknowledgement: ack })).status, 403);
    assert.equal((await request('/api/community/with-images', { origin: 'https://evil.invalid', form: form(), acknowledgement: ack })).status, 403);
    assert.equal((await request('/api/community/media-options')).data.videoEnabled, false);
    const result = await request('/api/community/with-images', { form: form(), acknowledgement: ack });
    assert.equal(result.status, 200, JSON.stringify(result.data)); post = result.data.post;
    assert.equal(post.status, 'PENDING_REVIEW'); assert.equal(post.images.length, 1);
    assert.equal(post.images[0].available, true);
    assert.doesNotMatch(JSON.stringify(post), /storageKey|sha256|originalname/);
  });
  await t.test('pending images are owner/admin only; approval requires explicit image review', async () => {
    const retry = await request('/api/community/with-images', { form: form(), acknowledgement: ack });
    assert.equal(retry.status, 200); assert.equal(retry.data.alreadySubmitted, true); assert.equal(retry.data.post.id, post.id);
    assert.equal((await readdir(root)).length, 1);
    const route = `/api/community/media/${post.images[0].id}`;
    assert.equal((await request(route, { actor: other })).status, 404);
    assert.equal((await request(route, { actor: null })).status, 401);
    assert.equal((await request(route)).status, 200);
    const preview = await request(`/api/admin/community/media/${post.images[0].id}`, { actor: admin });
    assert.equal(preview.status, 200); assert.equal((await sharp(preview.data).metadata()).format, 'png');
    assert.match(preview.headers.get('cache-control'), /no-store/);
    assert.equal((await decide('approve', undefined)).status, 409);
    const stored = await database.communityPostAttachment.findUnique({ where: { id: post.images[0].id }, include: { fileAnalysis: true } });
    const filePath = path.join(root, stored.fileAnalysis.storageKey), original = await readFile(filePath);
    await writeFile(filePath, Buffer.alloc(original.length));
    assert.equal((await request(route)).status, 404);
    assert.equal((await decide('approve', [post.images[0].id])).status, 409);
    await writeFile(filePath, original);
    assert.equal((await decide('approve', [post.images[0].id], employee)).status, 403);
    assert.equal((await decide('approve', [post.images[0].id])).status, 200);
    assert.equal((await request(route, { actor: other })).status, 200);
    assert.ok((await request('/api/community', { actor: other })).data.items.some((item) => item.id === post.id && item.images.length === 1));
    assert.equal((await decide('remove')).status, 200);
    assert.equal((await request(route, { actor: other })).status, 404);
  });
  await t.test('expiry denies playback and retention removes bytes but preserves post history', async () => {
    const attachment = await database.communityPostAttachment.findUnique({ where: { id: post.images[0].id }, include: { fileAnalysis: true } });
    await database.fileAnalysis.update({ where: { id: attachment.fileAnalysisId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await request(`/api/community/media/${attachment.id}`)).status, 404);
    const preview = await cleanupCommunityMedia(database, app.locals.communityMedia, { ownerId: employee.id });
    assert.equal(preview.eligible, 1); assert.equal(preview.removed, 0);
    const result = await cleanupCommunityMedia(database, app.locals.communityMedia, { apply: true, ownerId: employee.id });
    assert.equal(result.removed, 1); assert.equal((await readdir(root)).length, 0);
    assert.ok(await database.communityPost.findUnique({ where: { id: post.id } }));
    assert.equal(await database.postModerationAction.count({ where: { postId: post.id } }), 2);
    const orphan = `${randomUUID()}.png`; await writeFile(path.join(root, orphan), png);
    await utimes(path.join(root, orphan), new Date(0), new Date(0));
    await cleanupCommunityMedia(database, app.locals.communityMedia, { apply: true, ownerId: employee.id });
    assert.equal((await readdir(root)).length, 0);
  });
  await t.test('unavailable scanners reject upload without publishing or leaving files', async () => {
    scanState = 'UNAVAILABLE';
    const result = await request('/api/community/with-images', { form: form('Scanner unavailable'), acknowledgement: ack });
    assert.equal(result.status, 503); assert.equal(result.data.error.code, 'COMMUNITY_IMAGE_SCANNERS_UNAVAILABLE');
    assert.equal((await readdir(root)).length, 0);
    scanState = 'CLEAN';
  });
  await t.test('rejected images remain private and rejection shortens retention', async () => {
    const result = await request('/api/community/with-images', { form: form('Review rejection'), acknowledgement: ack });
    assert.equal(result.status, 200); post = result.data.post;
    assert.equal((await decide('reject')).status, 200);
    assert.equal((await request(`/api/community/media/${post.images[0].id}`, { actor: other })).status, 404);
    assert.equal((await request(`/api/community/media/${post.images[0].id}`)).status, 200);
    const stored = await database.communityPostAttachment.findUnique({ where: { id: post.images[0].id }, include: { fileAnalysis: true } });
    assert.ok(stored.fileAnalysis.expiresAt.getTime() <= Date.now() + 7 * 86400000);
    assert.equal((await request('/api/community/mine')).data.items.find((item) => item.id === post.id).status, 'REJECTED');
  });
  await t.test('owner deletion expires photos and preserves moderation history', async () => {
    assert.equal((await request(`/api/community/${post.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await request(`/api/community/media/${post.images[0].id}`)).status, 404);
    assert.equal((await request(`/api/community/media/${post.images[0].id}`, { actor: other })).status, 404);
    assert.equal((await request('/api/community/mine')).data.items.some((item) => item.id === post.id), false);
    assert.equal(await database.postModerationAction.count({ where: { postId: post.id } }), 1);
    const result = await cleanupCommunityMedia(database, app.locals.communityMedia, { apply: true, ownerId: employee.id });
    assert.equal(result.removed, 1);
  });
});
