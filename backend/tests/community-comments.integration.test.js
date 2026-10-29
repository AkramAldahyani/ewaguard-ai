import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';
import { commentText, screenComment } from '../src/community/comment-policy.js';

test('comment screening normalizes text and rejects bounded secret/abuse indicators', () => {
  for (const value of ['', '<script>', '＜script＞', 'x'.repeat(2001), 'hello\u202e']) assert.throws(() => commentText(value));
  for (const value of ['password=synthetic-secret', 'Contact alice@example.invalid', '-----BEGIN PRIVATE KEY-----', "I will hurt you"])
    assert.throws(() => screenComment(commentText(value)));
  assert.doesNotThrow(() => screenComment(commentText('Never share your password. Verify unexpected requests independently.')));
});

test('C2 immediately published comments and one-level replies', async (t) => {
  const url = new URL(databaseUrl()); assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(), users = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-comment-secret-at-least-32-characters', FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve));
    await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await db.communityPost.deleteMany({ where: { authorId: { in: users } } });
    await db.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect(); });
  async function makeUser(role = 'EMPLOYEE', mfa = true) {
    const row = await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Commenter', email: `${randomUUID()}@example.invalid`,
      status: 'ACTIVE', passwordHash: 'synthetic', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' && mfa ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}) } });
    users.push(row.id); return row;
  }
  const author = await makeUser(), other = await makeUser(), admin = await makeUser('IT_SECURITY_ADMIN'), noMfa = await makeUser('IT_SECURITY_ADMIN', false);
  const ack = await db.disclaimerAcknowledgement.create({ data: { userId: author.id, context: 'COMMUNITY_POST', version: DISCLAIMER_DEFINITION.version } });
  async function post(status = 'APPROVED') { return db.communityPost.create({ data: { authorId: author.id, acknowledgementId: ack.id,
    title: 'Synthetic discussion', body: 'Verify requests independently.', category: 'SECURITY_TIP', status, submittedAt: new Date(), ...(status === 'APPROVED' ? { approvedAt: new Date() } : {}) } }); }
  const published = await post(), another = await post(), pendingPost = await post('PENDING_REVIEW');
  async function request(path, { actor = author, body, method, origin = config.frontendUrl } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, { method: method ?? (body ? 'POST' : 'GET'), headers: { Origin: origin,
      ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  const payload = (body, parentId) => ({ body, ...(parentId ? { parentId } : {}) });
  const submit = (body, parentId, actor = author, postId = published.id) => request(`community/${postId}/comments`, { actor, body: payload(body, parentId) });
  const list = (actor = author, parentId) => request(`community/${published.id}/comments${parentId ? `?parentId=${parentId}` : ''}`, { actor });
  const decide = async (row, action, actor = admin) => request(`admin/community/comments/${row.id}/${action}`, { actor,
    body: { reason: 'Reviewed for appropriate security discussion.', expectedUpdatedAt: row.updatedAt.toISOString ? row.updatedAt.toISOString() : row.updatedAt } });
  let root, reply;
  await t.test('identity, role, MFA, origin, forged fields and sensitive content', async () => {
    assert.equal((await list(null)).status, 401);
    assert.equal((await request('admin/community/comments', { actor: author })).status, 403);
    assert.equal((await request('admin/community/comments', { actor: noMfa })).status, 401);
    assert.equal((await request(`community/${published.id}/comments`, { origin: 'https://evil.invalid' })).status, 403);
    for (const body of [{ ...payload('Useful contribution'), acknowledged: true }, { ...payload('Useful contribution'), status: 'APPROVED' }, payload('password=synthetic-only')])
      assert.equal((await request(`community/${published.id}/comments`, { actor: other, body })).status, 400);
    assert.equal((await submit('Private post comment', null, other, pendingPost.id)).status, 404);
  });
  await t.test('submission publishes immediately, retries deduplicate and counts update without moderation', async () => {
    const results = await Promise.all([submit('Verify urgent requests through a known channel.'), submit('Verify urgent requests through a known channel.')]);
    assert.ok(results.every((value) => value.status === 200)); root = results[0].data.comment;
    assert.equal(results[1].data.comment.id, root.id); assert.equal(root.status, 'APPROVED');
    assert.equal((await list(other)).data.items.length, 1); assert.equal((await list()).data.items.length, 1);
    assert.equal((await list()).data.commentCount, 1);
    const stored = await db.communityComment.findUnique({ where: { id: root.id } });
    assert.equal(stored.acknowledgementVersion, null); assert.equal(stored.acknowledgedAt, null);
    assert.equal((await decide(root, 'approve', author)).status, 403);
    assert.equal((await decide(root, 'approve')).status, 409);
    const current = await db.communityComment.findUnique({ where: { id: root.id } });
    assert.equal(current.status, 'APPROVED');
    assert.equal(await db.commentModerationAction.count({ where: { commentId: root.id } }), 0);
    assert.equal(await db.auditLog.count({ where: { resourceId: root.id, action: 'COMMUNITY_COMMENT_PUBLISHED' } }), 1);
    assert.equal((await list(other)).data.commentCount, 1);
    assert.equal((await request(`community/${published.id}`)).data.post.commentCount, 1);
    assert.equal((await list(other)).data.items[0].moderationReason, undefined);
  });
  await t.test('replies publish immediately but require published roots in the same post', async () => {
    assert.equal((await submit('Wrong post reply', root.id, other, another.id)).status, 404);
    const result = await submit('Check the address before responding.', root.id); assert.equal(result.status, 200); reply = result.data.comment;
    assert.equal((await list(other, root.id)).data.items.length, 1); assert.equal((await list(author, root.id)).data.items[0].status, 'APPROVED');
    assert.equal((await submit('Nested reply', reply.id, other)).status, 404);
    assert.equal((await decide(reply, 'approve')).status, 409); assert.equal((await list(other, root.id)).data.items.length, 1);
    assert.equal((await list(other)).data.commentCount, 2);
    await assert.rejects(db.communityComment.create({ data: { postId: another.id, authorId: other.id, parentId: root.id, body: 'Invalid cross-post fixture',
      acknowledgedAt: new Date(), acknowledgementVersion: 'synthetic' } }));
    await assert.rejects(db.communityComment.create({ data: { postId: published.id, authorId: other.id, parentId: reply.id, body: 'Invalid nested fixture',
      acknowledgedAt: new Date(), acknowledgementVersion: 'synthetic' } }));
  });
  await t.test('legacy pending comments remain private and reviewable; self moderation is denied', async () => {
    const row = await db.communityComment.create({ data: { postId: published.id, authorId: author.id, body: 'Legacy pending comment.',
      acknowledgedAt: new Date(), acknowledgementVersion: 'synthetic' } });
    assert.equal((await list(other)).data.items.some((item) => item.id === row.id), false);
    assert.equal((await decide(row, 'reject')).status, 200);
    assert.equal((await list(other)).data.items.some((item) => item.id === row.id), false);
    assert.match((await list()).data.items.find((item) => item.id === row.id).moderationReason, /Reviewed/);
    const self = await db.communityComment.create({ data: { postId: published.id, authorId: admin.id, body: 'Synthetic administrator authored comment',
      acknowledgedAt: new Date(), acknowledgementVersion: 'synthetic' } });
    assert.equal((await decide(self, 'approve')).status, 403);
  });
  await t.test('owner deletion redacts text, hides replies and prevents stale approval', async () => {
    assert.equal((await request(`community/comments/${root.id}`, { actor: other, method: 'DELETE' })).status, 404);
    assert.equal((await request(`community/comments/${root.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await request(`community/comments/${root.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await db.communityComment.findUnique({ where: { id: root.id } })).body, '');
    assert.equal((await list(other)).data.commentCount, 0); assert.equal((await list(other, root.id)).status, 404);
    assert.equal((await decide(root, 'approve')).status, 409);
    const replyNow = await db.communityComment.findUnique({ where: { id: reply.id } });
    const outcomes = await Promise.all([decide(replyNow, 'remove'), decide(replyNow, 'remove')]);
    assert.deepEqual(outcomes.map((value) => value.status).sort(), [200, 409]);
    assert.equal(await db.auditLog.count({ where: { actorId: author.id, resourceId: root.id, action: 'COMMUNITY_COMMENT_DELETED' } }), 1);
  });
  await t.test('administrators can remove immediately published comments from public discussion', async () => {
    const result = await submit('A removable public contribution.'); const row = result.data.comment;
    assert.equal((await list(other)).data.items.some((item) => item.id === row.id), true);
    const queue = await request('admin/community/comments', { actor: admin });
    assert.ok(queue.data.items.every((item) => item.status === 'APPROVED'));
    assert.equal((await decide(row, 'remove')).status, 200);
    assert.equal((await list(other)).data.items.some((item) => item.id === row.id), false);
    assert.equal((await list(other)).data.commentCount, 0);
  });
  await t.test('post removal hides discussion and blocks later approvals', async () => {
    const result = await submit('One final pending perspective.'); assert.equal(result.status, 200);
    await db.communityPost.update({ where: { id: published.id }, data: { status: 'REMOVED', removedAt: new Date() } });
    assert.equal((await submit('Cannot publish on a removed post.')).status, 404);
    assert.equal((await list()).status, 404); assert.equal((await decide(result.data.comment, 'approve')).status, 409);
    const queue = await request('admin/community/comments?status=PENDING_REVIEW&pageSize=1', { actor: admin });
    assert.equal(queue.status, 200); assert.equal(queue.data.items.length, 1);
    assert.equal((await request('admin/community/comments?status=DRAFT', { actor: admin })).status, 400);
  });
  await t.test('pagination excludes private comments and comment abuse limits are enforced', async () => {
    await db.communityComment.createMany({ data: Array.from({ length: 3 }, (_, index) => ({ id: randomUUID(), postId: another.id, authorId: other.id,
      body: `Synthetic paginated contribution ${index}`, status: index === 2 ? 'PENDING_REVIEW' : 'APPROVED', acknowledgedAt: new Date(), acknowledgementVersion: 'synthetic' })) });
    const first = await request(`community/${another.id}/comments?pageSize=1`);
    const second = await request(`community/${another.id}/comments?pageSize=1&page=2`);
    assert.equal(first.data.hasMore, true); assert.equal(second.data.hasMore, false);
    assert.notEqual(first.data.items[0].id, second.data.items[0].id); assert.equal(first.data.commentCount, 2);
    const limited = await makeUser();
    for (let index = 0; index < 10; index++) assert.equal((await submit('Retry-limited synthetic contribution.', null, limited, another.id)).status, 200);
    assert.equal((await submit('Retry-limited synthetic contribution.', null, limited, another.id)).status, 429);
  });
});
