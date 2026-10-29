import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';

test('Phase D real report persistence, privacy and atomic moderation', async (t) => {
  const url = new URL(databaseUrl()); assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(), users = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-report-secret-at-least-32-characters', FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve));
    await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await db.communityReport.deleteMany({ where: { reporterId: { in: users } } });
    await db.postModerationAction.deleteMany({ where: { moderatorId: { in: users } } });
    await db.communityPost.deleteMany({ where: { authorId: { in: users } } });
    await db.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect(); });
  async function user(role = 'EMPLOYEE', mfa = true) {
    const row = await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Reporter', email: `${randomUUID()}@example.invalid`,
      status: 'ACTIVE', passwordHash: 'synthetic', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' && mfa ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}) } });
    users.push(row.id); return row;
  }
  const employee = await user(), admin = await user('IT_SECURITY_ADMIN'), noMfa = await user('IT_SECURITY_ADMIN', false);
  const ack = await db.disclaimerAcknowledgement.create({ data: { userId: employee.id, context: 'COMMUNITY_POST', version: DISCLAIMER_DEFINITION.version } });
  async function post(status = 'APPROVED', authorId = employee.id) {
    const acknowledgement = authorId === employee.id ? ack : await db.disclaimerAcknowledgement.create({ data: { userId: authorId, context: 'COMMUNITY_POST', version: DISCLAIMER_DEFINITION.version } });
    return db.communityPost.create({ data: { authorId, acknowledgementId: acknowledgement.id,
    title: 'Synthetic report target', body: 'Verify unexpected requests.', category: 'SECURITY_TIP', status, submittedAt: new Date(), approvedAt: status === 'APPROVED' ? new Date() : null } }); }
  async function request(path, { actor = employee, body, origin = config.frontendUrl } = {}) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, { method: body ? 'POST' : 'GET', headers: { Origin: origin,
      ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  }
  const published = await post(), pending = await post('PENDING_REVIEW');
  const payload = (targetId, targetType = 'POST') => ({ targetId, targetType, category: 'MISLEADING', details: 'Please review this guidance.' });
  const report = (targetId, actor = employee, targetType = 'POST') => request('community/reports', { actor, body: payload(targetId, targetType) });
  const decision = (row, content, action = 'remove') => ({ action, reason: 'Reviewed against community guidelines.', expectedUpdatedAt: row.updatedAt.toISOString(), expectedContentUpdatedAt: content.updatedAt.toISOString() });
  await t.test('authentication, administrator MFA, trusted origin and private targets', async () => {
    assert.equal((await request('community/reports', { actor: null, body: payload(published.id) })).status, 401);
    assert.equal((await request('admin/community/reports')).status, 403);
    assert.equal((await request('admin/community/reports', { actor: noMfa })).status, 401);
    assert.equal((await request('community/reports', { origin: 'https://evil.invalid', body: payload(published.id) })).status, 403);
    assert.equal((await report(pending.id)).status, 404);
    assert.equal((await request('community/reports', { body: { ...payload(published.id), status: 'ACTIONED' } })).status, 400);
    assert.equal((await request('community/reports', { body: { ...payload(published.id), details: '<script>' } })).status, 400);
  });
  let row;
  await t.test('concurrent retries create one private report and one audit record', async () => {
    const reporter = await user();
    const results = await Promise.all([report(published.id, reporter), report(published.id, reporter)]);
    assert.ok(results.every((result) => result.status === 200)); assert.equal(results.filter((result) => result.data.alreadyReported).length, 1);
    row = await db.communityReport.findFirst({ where: { postId: published.id } });
    assert.equal(await db.communityReport.count({ where: { postId: published.id } }), 1);
    await assert.rejects(db.communityReport.create({ data: { reporterId: reporter.id, postId: published.id, category: 'SPAM' } }));
    await assert.rejects(db.communityReport.create({ data: { reporterId: reporter.id, category: 'SPAM' } }));
    assert.equal(await db.auditLog.count({ where: { resourceId: row.id, action: 'COMMUNITY_REPORT_SUBMITTED' } }), 1);
    assert.equal((await request(`community/${published.id}`)).data.post.reports, undefined);
    const queue = await request('admin/community/reports?pageSize=1', { actor: admin });
    assert.equal(queue.status, 200); assert.ok(queue.data.items.some((item) => item.id === row.id) || queue.data.hasMore);
    assert.equal((await request('admin/community/reports?status=FAKE', { actor: admin })).status, 400);
  });
  await t.test('stale and concurrent decisions preserve a single atomic removal and audit', async () => {
    const path = `admin/community/reports/${row.id}/resolve`;
    assert.equal((await request(path, { actor: employee, body: decision(row, published) })).status, 403);
    assert.equal((await request(path, { actor: admin, body: { ...decision(row, published), expectedContentUpdatedAt: 'stale' } })).status, 409);
    const results = await Promise.all([request(path, { actor: admin, body: decision(row, published) }), request(path, { actor: admin, body: decision(row, published) })]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal((await db.communityReport.findUnique({ where: { id: row.id } })).status, 'ACTIONED');
    assert.equal((await request(`community/${published.id}`)).status, 404);
    assert.equal(await db.postModerationAction.count({ where: { postId: published.id, decision: 'REMOVED' } }), 1);
    assert.equal(await db.auditLog.count({ where: { resourceId: row.id, action: 'COMMUNITY_REPORT_ACTIONED' } }), 1);
  });
  await t.test('comment reports remove roots and hide replies; hidden replies cannot be reported', async () => {
    const p = await post(), reporter = await user();
    const root = await db.communityComment.create({ data: { postId: p.id, authorId: employee.id, status: 'APPROVED', body: 'A synthetic public comment.' } });
    const reply = await db.communityComment.create({ data: { postId: p.id, parentId: root.id, authorId: employee.id, status: 'APPROVED', body: 'A reply.' } });
    assert.equal((await report(root.id, reporter, 'COMMENT')).status, 200);
    const r = await db.communityReport.findFirst({ where: { commentId: root.id } });
    assert.equal((await request(`admin/community/reports/${r.id}/resolve`, { actor: admin, body: decision(r, root) })).status, 200);
    assert.equal((await report(reply.id, reporter, 'COMMENT')).status, 404);
    const comments = await request(`community/${p.id}/comments`); assert.equal(comments.data.commentCount, 0);
    assert.equal(await db.commentModerationAction.count({ where: { commentId: root.id, decision: 'REMOVED' } }), 1);
  });
  await t.test('dismissal leaves content published; self review denied; rate limits enforced', async () => {
    const p = await post('APPROVED', admin.id), reporter = await user(), secondAdmin = await user('IT_SECURITY_ADMIN');
    assert.equal((await report(p.id, reporter)).status, 200);
    const r = await db.communityReport.findFirst({ where: { postId: p.id } }), body = decision(r, p, 'dismiss');
    assert.equal((await request(`admin/community/reports/${r.id}/resolve`, { actor: admin, body })).status, 403);
    assert.equal((await request(`admin/community/reports/${r.id}/resolve`, { actor: secondAdmin, body })).status, 200);
    assert.equal((await request(`community/${p.id}`)).status, 200);
    assert.equal((await db.communityReport.findUnique({ where: { id: r.id } })).status, 'DISMISSED');
    for (let i = 0; i < 4; i++) assert.equal((await report(p.id, reporter)).status, 200);
    assert.equal((await report(p.id, reporter)).status, 429);
  });
});
