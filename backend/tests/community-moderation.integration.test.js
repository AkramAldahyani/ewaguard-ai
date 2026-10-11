import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';

test('Phase 12B1 administrator community moderation', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(), users = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-community-moderation-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await db.postModerationAction.deleteMany({ where: { moderatorId: { in: users } } });
    await db.communityPost.deleteMany({ where: { authorId: { in: users } } });
    await db.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });
  async function user(role = 'EMPLOYEE', extra = {}) {
    const row = await db.user.create({ data: { firstName: 'Synthetic', lastName: role === 'EMPLOYEE' ? 'Author' : 'Moderator',
      email: `${randomUUID()}@example.invalid`, status: 'ACTIVE', passwordHash: 'synthetic',
      role: { connect: { name: role } }, ...(role === 'IT_SECURITY_ADMIN' ?
        { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}), ...extra } });
    users.push(row.id); return row;
  }
  const employee = await user(), other = await user(), admin = await user('IT_SECURITY_ADMIN');
  const admin2 = await user('IT_SECURITY_ADMIN');
  const noMfa = await user('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
  async function request(path, { actor = admin, body, origin = config.frontendUrl } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin,
        ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  const ack = (await request('/api/disclaimers/acknowledge', { actor: employee, body: { context: 'COMMUNITY_POST' } })).data.acknowledgement.id;
  async function submit(title, category = 'PHISHING') {
    const result = await request('/api/community', { actor: employee, body: { title, body: `Advice for ${title}`,
      category, acknowledgementId: ack } });
    assert.equal(result.status, 200);
    return (await request(`/api/admin/community/${result.data.post.id}`)).data.post;
  }
  const first = await submit('Recognize suspicious requests');
  const second = await submit('Use a trusted reporting channel', 'SECURITY_TIP');
  const decision = (post, action, actor = admin, reason = 'Reviewed against community policy.') =>
    request(`/api/admin/community/${post.id}/${action}`, { actor, body: { reason, expectedUpdatedAt: post.updatedAt } });

  await t.test('admin endpoints require authentication, role, MFA and trusted origin', async () => {
    for (const path of ['/api/admin/community', `/api/admin/community/${first.id}`]) {
      assert.equal((await request(path, { actor: null })).status, 401);
      assert.equal((await request(path, { actor: employee })).status, 403);
      assert.equal((await request(path, { actor: noMfa })).status, 401);
      assert.equal((await request(path, { origin: 'https://evil.invalid' })).status, 403);
    }
    assert.equal((await decision(first, 'approve', employee)).status, 403);
    assert.equal((await decision(first, 'approve', noMfa)).status, 401);
    assert.equal((await request('/api/admin/community', { actor: other })).status, 403);
  });
  await t.test('review queue supports search, filters, dates, sort and pagination', async () => {
    const list = await request('/api/admin/community?status=PENDING_REVIEW&pageSize=1&sort=submitted_asc');
    assert.equal(list.status, 200); assert.equal(list.data.items.length, 1); assert.equal(list.data.hasMore, true);
    assert.equal(list.data.items[0].id, first.id);
    assert.match(list.cache, /no-store/);
    assert.equal((await request('/api/admin/community?category=SECURITY_TIP&search=trusted')).data.items[0].id, second.id);
    assert.equal((await request(`/api/admin/community?authorId=${employee.id}`)).data.items.length, 2);
    assert.equal((await request(`/api/admin/community?authorId=${other.id}`)).data.items.length, 0);
    const day = new Date(first.submittedAt).toISOString().slice(0, 10);
    assert.equal((await request(`/api/admin/community?submittedFrom=${day}&submittedTo=${day}`)).data.items.length, 2);
    for (const query of ['status=DRAFT', 'category=BAD', 'sort=bad', 'submittedFrom=2026-02-31',
      'submittedFrom=2026-12-31&submittedTo=2026-01-01', 'page=0', 'authorId=bad'])
      assert.equal((await request(`/api/admin/community?${query}`)).status, 400);
    assert.equal((await request(`/api/admin/community/${first.id}`)).data.post.history.length, 0);
  });
  await t.test('reason and version are required; forged fields and invalid transitions fail', async () => {
    for (const body of [{ expectedUpdatedAt: first.updatedAt }, { reason: '<script>', expectedUpdatedAt: first.updatedAt },
      { reason: 'x', expectedUpdatedAt: first.updatedAt, status: 'APPROVED' },
      { reason: 'x', expectedUpdatedAt: 'invalid' }])
      assert.equal((await request(`/api/admin/community/${first.id}/approve`, { body })).status, 400);
    assert.equal((await decision(first, 'remove')).status, 409);
    assert.equal((await request('/api/community', { actor: other })).data.items.length, 0);
  });
  let approved;
  await t.test('concurrent decisions produce one approval and immutable history', async () => {
    const results = await Promise.all([decision(first, 'approve', admin), decision(first, 'approve', admin2)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    approved = results.find((r) => r.status === 200).data.post;
    assert.equal(approved.history.length, 1);
    assert.equal(approved.history[0].previousStatus, 'PENDING_REVIEW');
    assert.equal(approved.history[0].decision, 'APPROVED');
    assert.ok([admin.id, admin2.id].includes(approved.history[0].moderator.id));
    assert.equal(await db.postModerationAction.count({ where: { postId: first.id } }), 1);
    assert.equal(await db.auditLog.count({ where: { resourceId: first.id, action: { startsWith: 'COMMUNITY_POST_' } } }), 2);
    assert.equal((await decision(first, 'approve')).status, 409);
    assert.equal((await request(`/api/admin/community/${first.id}`)).data.post.history.length, 1);
  });
  await t.test('approval, rejection and removal control employee visibility', async () => {
    const publicFirst = await request(`/api/community/${first.id}`, { actor: other });
    assert.equal(publicFirst.status, 200);
    const rejected = await decision(second, 'reject');
    assert.equal(rejected.status, 200); assert.equal(rejected.data.post.history[0].decision, 'REJECTED');
    assert.equal((await request(`/api/community/${second.id}`, { actor: other })).status, 404);
    assert.equal((await request('/api/community/mine?status=REJECTED', { actor: employee })).data.items[0].id, second.id);
    assert.equal((await decision(second, 'approve')).status, 409);
    const removed = await decision(approved, 'remove');
    assert.equal(removed.status, 200); assert.equal(removed.data.post.status, 'REMOVED');
    assert.equal(removed.data.post.history.length, 2);
    assert.equal(removed.data.post.history[1].previousStatus, 'APPROVED');
    assert.equal((await request(`/api/community/${first.id}`, { actor: other })).status, 404);
    assert.equal((await request('/api/community', { actor: other })).data.items.length, 0);
    assert.equal((await request('/api/community/mine?status=REMOVED', { actor: employee })).data.items[0].id, first.id);
    assert.equal((await decision(removed.data.post, 'remove')).status, 409);
    const own = await request(`/api/community/mine/${second.id}`, { actor: employee });
    assert.equal(own.data.post.status, 'REJECTED');
    assert.doesNotMatch(JSON.stringify(own.data), /moderationActions|history|moderator|reason/i);
    assert.equal((await request(`/api/community/mine/${second.id}`, { actor: other })).status, 404);
  });
  await t.test('conflicting concurrent decisions leave exactly one terminal outcome', async () => {
    const third = await submit('Check urgent payment messages', 'SUSPICIOUS_EMAIL');
    const results = await Promise.all([decision(third, 'approve', admin), decision(third, 'reject', admin2)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const resolved = (await request(`/api/admin/community/${third.id}`)).data.post;
    assert.equal(resolved.history.length, 1);
    assert.equal(resolved.status, resolved.history[0].decision);
    assert.equal((await request(`/api/community/${third.id}`, { actor: other })).status,
      resolved.status === 'APPROVED' ? 200 : 404);
  });
});
