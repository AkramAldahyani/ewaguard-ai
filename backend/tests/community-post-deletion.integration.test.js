import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';
import { createModerationService } from '../src/community/moderation-service.js';

test('employees delete only their own posts; withdrawal is persistent and auditable', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(),
    ids = [];
  const config = parseConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-deletion-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173',
  });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.communityPost.deleteMany({ where: { authorId: { in: ids } } });
    await db.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  async function user() {
    const row = await db.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Deletion',
        email: `${randomUUID()}@example.invalid`,
        passwordHash: 'synthetic',
        status: 'ACTIVE',
        role: { connect: { name: 'EMPLOYEE' } },
      },
    });
    ids.push(row.id);
    return row;
  }
  const owner = await user(),
    other = await user();
  const ack = await db.disclaimerAcknowledgement.create({
    data: { userId: owner.id, context: 'COMMUNITY_POST', version: DISCLAIMER_DEFINITION.version },
  });
  async function request(path, method = 'GET', actor = owner, origin = config.frontendUrl) {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/community/${path}`, {
      method,
      headers: {
        Origin: origin,
        ...(actor ? { Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config)}` } : {}),
      },
    });
    return { status: result.status, body: await result.json() };
  }
  for (const status of ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REMOVED'])
    await t.test(`owner can delete ${status}; others cannot`, async () => {
      const post = await db.communityPost.create({
        data: {
          authorId: owner.id,
          acknowledgementId: ack.id,
          title: 'Deletion fixture',
          body: 'Verify unexpected requests.',
          category: 'SECURITY_TIP',
          status,
          submittedAt: new Date(),
          ...(status === 'APPROVED' ? { approvedAt: new Date() } : {}),
        },
      });
      await db.communityPostSave.create({ data: { userId: other.id, postId: post.id } });
      await db.communityComment.create({
        data: { authorId: other.id, postId: post.id, status: 'APPROVED', body: 'A comment.' },
      });
      assert.equal((await request(post.id, 'DELETE', null)).status, 401);
      assert.equal((await request(post.id, 'DELETE', other)).status, 404);
      assert.equal((await request(post.id, 'DELETE', owner, 'https://evil.invalid')).status, 403);
      assert.equal((await db.communityPost.findUnique({ where: { id: post.id } })).status, status);
      const results = await Promise.all([request(post.id, 'DELETE'), request(post.id, 'DELETE')]);
      assert.ok(results.every((result) => result.status === 200 && result.body.deleted));
      const stored = await db.communityPost.findUnique({ where: { id: post.id } });
      assert.ok(stored.deletedAt);
      assert.equal(stored.status, 'REMOVED');
      assert.equal((await request(`mine/${post.id}`)).status, 404);
      assert.equal((await request(post.id, 'GET', other)).status, 404);
      assert.equal((await request(`${post.id}/comments`, 'GET', other)).status, 404);
      assert.equal(
        (await request('mine')).body.items.some((item) => item.id === post.id),
        false,
      );
      assert.equal(
        (await request('saved', 'GET', other)).body.items.some((item) => item.id === post.id),
        false,
      );
      assert.equal(await db.auditLog.count({ where: { resourceId: post.id, action: 'COMMUNITY_POST_DELETED' } }), 1);
      await assert.rejects(
        createModerationService(db).decide(other, post.id, 'APPROVED', {
          reason: 'Stale review.',
          expectedUpdatedAt: post.updatedAt.toISOString(),
        }),
        { status: 409 },
      );
    });
});
