import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';

test('Phase 12A1 community posts: protected feed and pending submissions', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(), users = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-community-secret-at-least-32-characters', FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve));
    await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await db.communityPost.deleteMany({ where: { authorId: { in: users } } });
    await db.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect(); });
  async function user(role = 'EMPLOYEE', extra = {}) {
    const row = await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Community', email: `${randomUUID()}@example.invalid`,
      status: 'ACTIVE', passwordHash: 'synthetic', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}), ...extra } });
    users.push(row.id); return row;
  }
  const employee = await user(), other = await user(), admin = await user('IT_SECURITY_ADMIN');
  const noMfa = await user('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
  async function request(path, { actor = employee, body, origin = config.frontendUrl } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  const acknowledge = async (actor = employee, context = 'COMMUNITY_POST') => (await request('/api/disclaimers/acknowledge', { actor, body: { context } })).data.acknowledgement.id;
  const post = (acknowledgementId, extra = {}) => ({ title: 'Recognize phishing', body: 'Confirm unusual requests using a trusted channel.',
    category: 'PHISHING', acknowledgementId, ...extra });

  await t.test('authentication, role, MFA and origin are enforced', async () => {
    assert.equal((await request('/api/community', { actor: null })).status, 401);
    assert.equal((await request('/api/community', { actor: admin })).status, 403);
    assert.equal((await request('/api/community', { actor: noMfa })).status, 401);
    assert.equal((await request('/api/community', { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await request('/api/community', { body: post(randomUUID()), actor: admin })).status, 403);
  });
  const ack = await acknowledge();
  await t.test('server verifies current, owned community acknowledgement', async () => {
    const wrongContext = await acknowledge(employee, 'EMAIL_ANALYSIS');
    const foreign = await acknowledge(other);
    for (const id of [randomUUID(), wrongContext, foreign]) {
      const result = await request('/api/community', { body: post(id) });
      assert.equal(result.status, 403); assert.equal(result.data.error.code, 'COMMUNITY_ACKNOWLEDGEMENT_REQUIRED');
    }
    const stale = await db.disclaimerAcknowledgement.create({ data: { userId: employee.id, context: 'COMMUNITY_POST', version: '1.0', createdAt: new Date(Date.now() - 11 * 60_000) } });
    assert.equal((await request('/api/community', { body: post(stale.id) })).status, 403);
    assert.equal(await db.communityPost.count({ where: { authorId: employee.id } }), 0);
  });
  await t.test('strict content validation rejects scripts, forged status and author', async () => {
    for (const bad of [{ title: '<script>alert(1)</script>' }, { body: '<img src=x>' }, { title: 'x'.repeat(201) },
      { body: 'x'.repeat(5001) }, { category: 'UNKNOWN' }, { status: 'APPROVED' },
      { authorId: other.id }, { approvedAt: new Date().toISOString() }, { attachments: [] }]) {
      assert.equal((await request('/api/community', { body: post(ack, bad) })).status, 400);
    }
    assert.equal(await db.communityPost.count({ where: { authorId: employee.id } }), 0);
  });
  let submitted;
  await t.test('concurrent retries create one pending post and audit once', async () => {
    const results = await Promise.all([1, 2].map(() => request('/api/community', { body: post(ack) })));
    assert.ok(results.every((result) => result.status === 200));
    assert.equal(results[0].data.post.id, results[1].data.post.id);
    assert.deepEqual(results.map((result) => result.data.alreadySubmitted).sort(), [false, true]);
    submitted = results[0].data.post;
    assert.equal(submitted.status, 'PENDING_REVIEW'); assert.equal(submitted.approvedAt, null);
    assert.equal(await db.communityPost.count({ where: { authorId: employee.id } }), 1);
    assert.equal(await db.auditLog.count({ where: { action: 'COMMUNITY_POST_SUBMITTED', resourceId: submitted.id } }), 1);
    assert.equal((await request('/api/community')).data.items.some((item) => item.id === submitted.id), false);
    assert.match((await request('/api/community')).cache, /no-store/);
  });
  await t.test('private status and detail are owner-only; shared detail is approved-only', async () => {
    assert.equal((await request('/api/community/mine')).data.items[0].status, 'PENDING_REVIEW');
    assert.equal((await request(`/api/community/mine/${submitted.id}`)).data.post.body, submitted.body);
    assert.equal((await request('/api/community/mine', { actor: other })).data.items.length, 0);
    assert.equal((await request(`/api/community/mine/${submitted.id}`, { actor: other })).status, 404);
    assert.equal((await request(`/api/community/${submitted.id}`, { actor: other })).status, 404);
    assert.equal((await request(`/api/community/${submitted.id}`)).status, 404);
    assert.equal((await request('/api/community/mine?status=APPROVED')).data.items.length, 0);
  });
  await t.test('approved-only feed supports category, search, pagination and minimized author', async () => {
    await db.communityPost.update({ where: { id: submitted.id }, data: { status: 'APPROVED', approvedAt: new Date() } });
    const second = await request('/api/community', { body: post(ack, { title: 'USB warning', category: 'SECURITY_WARNING', body: 'Do not use unknown removable media.' }) });
    assert.equal(second.data.post.status, 'PENDING_REVIEW');
    const approved = await request('/api/community?category=PHISHING&search=unusual&pageSize=1');
    assert.equal(approved.data.items.length, 1); assert.equal(approved.data.items[0].id, submitted.id);
    assert.equal(approved.data.items[0].authorName, 'Synthetic C.');
    assert.doesNotMatch(JSON.stringify(approved.data), /email|employeeIdentifier|moderationActions|acknowledgementId|authorId/i);
    assert.equal((await request('/api/community?category=SECURITY_WARNING')).data.items.length, 0);
    assert.equal((await request(`/api/community/${submitted.id}`)).data.post.body, submitted.body);
    assert.equal((await request('/api/community?category=UNKNOWN')).status, 400);
    assert.equal((await request('/api/community?status=PENDING_REVIEW')).status, 400);
    assert.equal((await request('/api/community?page=0')).status, 400);
    await db.communityPost.update({ where: { id: second.data.post.id }, data: { status: 'REJECTED' } });
    assert.equal((await request('/api/community/mine?status=REJECTED')).data.items[0].id, second.data.post.id);
    assert.equal((await request('/api/community')).data.items.some((item) => item.id === submitted.id), true);
    await db.communityPost.update({ where: { id: submitted.id }, data: { status: 'REMOVED', removedAt: new Date() } });
    assert.equal((await request('/api/community')).data.items.some((item) => item.id === submitted.id), false);
    assert.equal((await request('/api/community/mine?status=REMOVED')).data.items[0].id, submitted.id);
  });
  await t.test('optional titles and complete feed text preserve approval boundaries', async () => {
    const content = 'Practical cybersecurity guidance. '.repeat(30).trim();
    const result = await request('/api/community', { body: post(ack, { title: '', body: content }) });
    assert.equal(result.status, 200);
    assert.equal(result.data.post.title, '');
    assert.equal(result.data.post.status, 'PENDING_REVIEW');
    assert.equal((await request(`/api/community/${result.data.post.id}`, { actor: other })).status, 404);
    assert.equal((await request('/api/community/mine')).data.items.find((item) => item.id === result.data.post.id).body, content);
    await db.communityPost.update({ where: { id: result.data.post.id }, data: { status: 'APPROVED', approvedAt: new Date() } });
    const feed = await request('/api/community', { actor: other });
    assert.equal(feed.data.items.find((item) => item.id === result.data.post.id).body, content);
    assert.doesNotMatch(JSON.stringify(feed.data), /moderationActions|acknowledgementId|authorId/);
    const noTitle = post(ack, { body: 'Report concerns through the approved channel.' });
    delete noTitle.title;
    assert.equal((await request('/api/community', { body: noTitle })).status, 200);
  });
});
