import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl } from '../src/config/env.js';
import { loadLocalManifest, prepareSource } from '../src/rag/local-sources.js';
import { ingestSource } from '../src/rag/ingestion-service.js';
import { indexSource } from '../src/rag/indexing-service.js';
import { activateDemoPolicy } from '../src/rag/company-activation.js';
import { searchChunks, hasRetrievableChunks, readReferenceChunks } from '../src/rag/retrieval-store.js';
import { createRetrievalService } from '../src/rag/retrieval-service.js';
import { RETRIEVAL_PRIVACY } from '../src/rag/retrieval-policy.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';

test('demo corpus lifecycle and isolation: real PostgreSQL, synthetic embeddings, no paid API calls', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient();
  const userIds = [];
  const docs = [];
  t.after(async () => {
    try {
      await db.knowledgeDocument.deleteMany({ where: { id: { in: docs } } });
      await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await db.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  });
  async function user(role) {
    const u = await db.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        firstName: 'Synthetic',
        lastName: 'Company Corpus',
        status: 'ACTIVE',
        passwordHash: 'not-a-login-hash',
        role: { connect: { name: role } },
      },
    });
    userIds.push(u.id);
    return u;
  }
  const admin = await user('IT_SECURITY_ADMIN');
  const employee = await user('EMPLOYEE');
  const entry = {
    ...(await loadLocalManifest()).find((e) => e.documentKey === 'demo-password-authentication'),
    documentKey: `test-demo-${randomUUID()}`,
  };
  const prepared = await prepareSource(entry);
  const sha = prepared.contentSha256;
  const config = { nodeEnv: 'test', ragDemonstrationEnabled: true, openaiEmbeddingModel: 'text-embedding-3-small' };
  const indexConfig = { model: 'text-embedding-3-small', maxDocumentBytes: 250000 };
  let calls = 0;
  const vector = [1, ...Array(1535).fill(0)];
  const provider = {
    model: indexConfig.model,
    dimensions: 1536,
    embed: async (input) => {
      calls++;
      return { vectors: input.map(() => vector), totalTokens: 1 };
    },
  };
  const filters = {
    category: 'COMPANY_POLICY',
    classification: 'DEMONSTRATION',
    approvalStatus: 'NOT_OFFICIALLY_APPROVED',
    demoEligible: true,
    documentKey: entry.documentKey,
    contentSha256: sha,
    limit: 5,
  };
  let id;
  await t.test(
    'ingestion is idempotent, conflicting same-version metadata fails, and employees cannot ingest',
    async () => {
      await assert.rejects(ingestSource(db, entry, employee.id), { code: 'ADMIN_REQUIRED' });
      const first = await ingestSource(db, entry, admin.id);
      id = first.documentId;
      docs.push(id);
      assert.equal((await ingestSource(db, entry, admin.id)).status, 'UNCHANGED');
      await assert.rejects(ingestSource(db, { ...entry, title: 'Changed title' }, admin.id), {
        code: 'VERSION_CONFLICT',
      });
      assert.equal(await hasRetrievableChunks(db, filters, provider.model), false);
    },
  );
  await t.test(
    'indexing is idempotent; activation requires demo mode, explicit hash review, and completed vectors',
    async () => {
      await assert.rejects(activateDemoPolicy(db, entry, admin.id, sha, { config }), {
        code: 'DEMONSTRATION_NOT_READY',
      });
      await indexSource(db, entry, admin.id, { config: indexConfig, provider });
      const before = calls;
      assert.equal((await indexSource(db, entry, admin.id, { config: indexConfig, provider })).status, 'UNCHANGED');
      assert.equal(calls, before);
      await assert.rejects(activateDemoPolicy(db, entry, admin.id, sha, { config: {} }), {
        code: 'DEMONSTRATION_MODE_REQUIRED',
      });
      await assert.rejects(activateDemoPolicy(db, entry, employee.id, sha, { config }), { code: 'ADMIN_REQUIRED' });
      await assert.rejects(activateDemoPolicy(db, entry, admin.id, 'wrong', { config }), {
        code: 'SOURCE_REVIEW_REQUIRED',
      });
      assert.equal((await activateDemoPolicy(db, entry, admin.id, sha, { config })).status, 'DEMONSTRATION_ENABLED');
      assert.equal((await activateDemoPolicy(db, entry, admin.id, sha, { config })).status, 'UNCHANGED');
      const document = await db.knowledgeDocument.findUnique({ where: { id } });
      assert.equal(document.status, 'DRAFT');
      assert.equal(document.approvedById, null);
      assert.equal(document.approvedAt, null);
    },
  );
  await t.test(
    'references are labelled examples and PDPL/production/approved/disabled access is excluded',
    async () => {
      const found = await searchChunks(db, filters, provider.model, vector);
      assert.ok(found.length);
      assert.equal(found[0].source.policyId, 'DEMO-03');
      assert.equal(found[0].source.approvalStatus, 'NOT_OFFICIALLY_APPROVED');
      assert.match(found[0].source.notice, /not official EWA requirements/);
      assert.equal(found[0].source.page, null);
      for (const change of [
        { category: 'PDPL', classification: 'PRODUCTION', approvalStatus: 'APPROVED' },
        { classification: 'PRODUCTION' },
        { approvalStatus: 'APPROVED' },
        { demoEligible: false },
      ])
        assert.equal(await hasRetrievableChunks(db, { ...filters, ...change }, provider.model), false);
      const auth = {
        userId: employee.id,
        sessionId: randomUUID(),
        sessionVersion: employee.sessionVersion,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
      const ack = await db.disclaimerAcknowledgement.create({
        data: { userId: employee.id, context: 'CHAT', version: DISCLAIMER_DEFINITION.version },
      });
      const body = {
        question: 'What are the sample password rules?',
        category: 'COMPANY_POLICY',
        classification: 'DEMONSTRATION',
        approvalStatus: 'NOT_OFFICIALLY_APPROVED',
        acknowledgementId: ack.id,
        requestId: randomUUID(),
        privacyNoticeVersion: RETRIEVAL_PRIVACY.version,
      };
      const before = calls;
      await assert.rejects(
        createRetrievalService({
          database: db,
          config: { ...config, ragDemonstrationEnabled: false },
          provider,
        }).retrieve({ auth, body }),
        { code: 'DEMONSTRATION_MODE_REQUIRED' },
      );
      assert.equal(calls, before);
      const service = createRetrievalService({
        database: db,
        config,
        provider,
        sourceRestriction: { documentKey: entry.documentKey, contentSha256: sha },
      });
      assert.equal((await service.retrieve({ auth, body })).status, 'MATCHES');
      await db.knowledgeDocument.update({ where: { id }, data: { status: 'PENDING_REVIEW' } });
      const paidBefore = calls;
      assert.equal((await service.retrieve({ auth, body: { ...body, requestId: randomUUID() } })).status, 'NO_MATCHES');
      assert.equal(calls, paidBefore);
      await db.knowledgeDocument.update({ where: { id }, data: { status: 'DRAFT' } });
      await activateDemoPolicy(db, entry, admin.id, sha, { config });
      // An accidentally approved sample cannot bypass the separate demo eligibility contract.
      await db.knowledgeDocument.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: new Date(), approvedById: admin.id },
      });
      assert.equal(await hasRetrievableChunks(db, filters, provider.model), false);
      await db.knowledgeDocument.update({
        where: { id },
        data: { status: 'DRAFT', approvedAt: null, approvedById: null },
      });
    },
  );
  await t.test(
    'a reviewed higher version atomically retires the prior version and invalidates old receipts',
    async () => {
      const old = await searchChunks(db, filters, provider.model, vector);
      const updated = { ...entry, version: 2 };
      docs.push((await ingestSource(db, updated, admin.id)).documentId);
      await indexSource(db, updated, admin.id, { config: indexConfig, provider });
      await activateDemoPolicy(db, updated, admin.id, sha, { config });
      const previous = await db.knowledgeDocument.findUnique({ where: { id } });
      assert.equal(previous.active, false);
      assert.equal(previous.status, 'ARCHIVED');
      assert.ok((await searchChunks(db, filters, provider.model, vector)).every((m) => m.source.version === 2));
      assert.deepEqual(
        await readReferenceChunks(
          db,
          filters,
          provider.model,
          old.map((m) => m.chunkId),
        ),
        [],
      );
      await assert.rejects(activateDemoPolicy(db, entry, admin.id, sha, { config }), {
        code: 'DEMONSTRATION_NOT_READY',
      });
    },
  );
});
