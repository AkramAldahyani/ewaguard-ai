import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';

test('C1 persistent community likes and private saved posts', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(),
    users = [];
  const config = parseConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-engagement-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173',
  });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await db.communityPost.deleteMany({ where: { authorId: { in: users } } });
    await db.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });
  async function user(role = 'EMPLOYEE') {
    const value = await db.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Engagement',
        email: `${randomUUID()}@example.invalid`,
        passwordHash: 'synthetic',
        status: 'ACTIVE',
        role: { connect: { name: role } },
        ...(role === 'IT_SECURITY_ADMIN'
          ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n }
          : {}),
      },
    });
    users.push(value.id);
    return value;
  }
  const employee = await user(),
    other = await user(),
    admin = await user('IT_SECURITY_ADMIN');
  async function request(path, { actor = employee, method, body, origin = config.frontendUrl } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/community${path}`, {
      method: method ?? (body ? 'PUT' : 'GET'),
      headers: {
        Origin: origin,
        ...(actor
          ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}` }
          : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }
  const ack = await db.disclaimerAcknowledgement.create({
    data: { userId: employee.id, context: 'COMMUNITY_POST', version: 'synthetic' },
  });
  const marker = randomUUID();
  async function post(status, category = 'SECURITY_TIP') {
    return db.communityPost.create({
      data: {
        authorId: employee.id,
        acknowledgementId: ack.id,
        title: `${marker} ${status}`,
        body: 'Verify unusual requests independently.',
        category,
        status,
        submittedAt: new Date(),
        ...(status === 'APPROVED' ? { approvedAt: new Date() } : {}),
      },
    });
  }
  const published = await post('APPROVED'),
    second = await post('APPROVED', 'PHISHING'),
    pending = await post('PENDING_REVIEW'),
    rejected = await post('REJECTED');
  const set = (kind, active, options = {}) => request(`/${published.id}/${kind}`, { body: { active }, ...options });
  await t.test('authentication, role, origin and input validation are enforced', async () => {
    assert.equal((await set('like', true, { actor: null })).status, 401);
    assert.equal((await set('save', true, { actor: admin })).status, 403);
    assert.equal((await set('like', true, { origin: 'https://evil.invalid' })).status, 403);
    for (const body of [{ active: 'true' }, { active: true, userId: other.id }, {}, { active: true, count: 999 }])
      assert.equal((await request(`/${published.id}/like`, { body })).status, 400);
    assert.equal((await request('/saved?userId=' + other.id)).status, 400);
    assert.equal((await request('/saved', { actor: null })).status, 401);
    for (const row of [pending, rejected, { id: randomUUID() }])
      for (const kind of ['like', 'save'])
        assert.equal((await request(`/${row.id}/${kind}`, { body: { active: true } })).status, 404);
  });
  await t.test('concurrent retries are idempotent and database uniqueness is enforced', async () => {
    const responses = await Promise.all([set('like', true), set('like', true)]);
    assert.ok(responses.every((result) => result.status === 200 && result.data.engagement.likeCount === 1));
    await assert.rejects(db.communityPostLike.create({ data: { userId: employee.id, postId: published.id } }), {
      code: 'P2002',
    });
    assert.equal((await set('like', true, { actor: other })).data.engagement.likeCount, 2);
    const detail = (await request(`/${published.id}`)).data.post;
    assert.equal(detail.likeCount, 2);
    assert.equal(detail.liked, true);
    assert.equal(detail.likes, undefined);
    assert.equal(detail.saves, undefined);
    assert.equal((await set('like', false)).data.engagement.likeCount, 1);
    assert.equal((await set('like', false)).data.engagement.likeCount, 1);
    assert.equal((await request(`/${published.id}`, { actor: other })).data.post.liked, true);
  });
  await t.test('saved state persists, is private, and supports search/category/pagination', async () => {
    assert.equal((await set('save', true)).status, 200);
    assert.equal((await set('save', true)).status, 200);
    await assert.rejects(db.communityPostSave.create({ data: { userId: employee.id, postId: published.id } }), {
      code: 'P2002',
    });
    assert.equal((await request(`/${second.id}/save`, { body: { active: true } })).status, 200);
    const own = await request('/saved?pageSize=1');
    assert.equal(own.data.items.length, 1);
    assert.equal(own.data.hasMore, true);
    assert.equal((await request('/saved?pageSize=1&page=2')).data.items.length, 1);
    assert.equal((await request('/saved', { actor: other })).data.items.length, 0);
    assert.equal((await request(`/saved?search=${marker}&category=PHISHING`)).data.items[0].id, second.id);
    assert.equal((await request('/saved?search=not-a-matching-title')).data.items.length, 0);
    assert.equal((await request(`/${published.id}`)).data.post.saved, true);
    assert.equal((await request(`?search=${marker}`)).data.items.find((row) => row.id === published.id).saved, true);
    assert.equal((await set('save', false)).data.engagement.saved, false);
    assert.equal((await request('/saved')).data.items.length, 1);
  });
  await t.test('removed posts disappear from saved/feed and reject engagement changes', async () => {
    await db.communityPost.update({ where: { id: second.id }, data: { status: 'REMOVED', removedAt: new Date() } });
    assert.equal((await request('/saved')).data.items.length, 0);
    assert.equal((await request(`/${second.id}/like`, { body: { active: true } })).status, 404);
    assert.equal((await request(`/${second.id}`)).status, 404);
    assert.equal(await db.communityPostSave.count({ where: { userId: employee.id, postId: second.id } }), 1);
  });
});
