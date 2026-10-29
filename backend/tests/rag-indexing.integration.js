import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl } from '../src/config/env.js';
import { ingestSource } from '../src/rag/ingestion-service.js';
import { indexSource } from '../src/rag/indexing-service.js';
import { embeddingConfig, EmbeddingError } from '../src/rag/embedding-policy.js';
import { docxFixture } from './fixtures/rag-documents.js';

// Real PostgreSQL + explicitly injected synthetic embeddings; never calls OpenAI.
test('transactional indexing lifecycle and privacy boundaries', { timeout: 60_000 }, async t => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const root = await mkdtemp(path.join(tmpdir(), 'ewaguard-rag-index-'));
  const db = createDatabaseClient(); const actorId = randomUUID(); const employeeId = randomUUID();
  t.after(async () => {
    try {
      await db.$transaction(async tx => {
        await tx.auditLog.deleteMany({ where: { actorId: { in: [actorId, employeeId] } } });
        await tx.knowledgeDocument.deleteMany({ where: { uploadedById: actorId } });
        await tx.user.deleteMany({ where: { id: { in: [actorId, employeeId] } } });
      });
    } finally { await db.$disconnect(); await rm(root, { recursive: true, force: true }); }
  });
  for (const [id, name] of [[actorId, 'IT_SECURITY_ADMIN'], [employeeId, 'EMPLOYEE']]) {
    const role = await db.role.findUniqueOrThrow({ where: { name } });
    await db.user.create({ data: { id, email: `${id}@example.invalid`, firstName: 'Synthetic', lastName: 'Indexing',
      status: 'ACTIVE', roleId: role.id, passwordHash: '$2b$12$' + 'x'.repeat(53) } });
  }
  await mkdir(path.join(root, 'company-policies'));
  const entry = { documentKey: `test-${randomUUID()}`, title: 'Synthetic indexing policy', filename: 'company-policies/test.docx',
    kind: 'COMPANY_POLICY', version: 1, classification: 'DEMONSTRATION', sourceUse: 'DEMONSTRATION' };
  await writeFile(path.join(root, entry.filename), docxFixture(`<w:p><w:r><w:t>${'Synthetic awareness policy text. '.repeat(1100)}</w:t></w:r></w:p>`));
  const ingested = await ingestSource(db, entry, actorId, { root });
  const config = embeddingConfig({}); let calls = 0;
  const makeProvider = (model = config.model, dimension = 0) => ({ model, dimensions: 1536,
    embed: async input => { calls++; return { totalTokens: input.length,
      vectors: input.map(() => Array.from({ length: 1536 }, (_, i) => i === dimension ? 1 : 0)) }; } });
  const provider = makeProvider();
  const options = { config, provider, root };
  const stored = () => db.$queryRaw`SELECT id, "embeddingModel", embedding::text AS embedding
    FROM document_chunks WHERE "documentId" = ${ingested.documentId}::uuid ORDER BY position`;
  const document = () => db.knowledgeDocument.findUniqueOrThrow({ where: { id: ingested.documentId } });

  await t.test('employee indexing denied before provider call', async () => {
    await assert.rejects(indexSource(db, entry, employeeId, options), { code: 'ADMIN_REQUIRED' }); assert.equal(calls, 0);
  });
  await t.test('indexing writes all vectors atomically and preserves draft approval state', async () => {
    const result = await indexSource(db, entry, actorId, options);
    assert.equal(result.status, 'INDEXED'); assert.ok(calls >= 2);
    const doc = await document(); assert.equal(doc.status, 'DRAFT'); assert.equal(doc.active, false);
    assert.equal(doc.indexingStatus, 'INDEXED'); assert.equal(doc.ingestionMetadata.externalProcessingPerformed, true);
    const rows = await stored(); assert.equal(rows.length, ingested.chunks);
    assert.ok(rows.every(row => row.embeddingModel === config.model && JSON.parse(row.embedding).length === 1536));
  });
  await t.test('identical repeat makes zero additional API calls or duplicate records', async () => {
    const before = calls; const rows = await stored();
    assert.equal((await indexSource(db, entry, actorId, options)).status, 'UNCHANGED');
    assert.equal(calls, before); assert.deepEqual(await stored(), rows);
    assert.equal(await db.auditLog.count({ where: { resourceId: ingested.documentId, action: 'KNOWLEDGE_INDEXED' } }), 1);
  });
  await t.test('partial provider failure preserves all old vectors and records explicit error', async () => {
    const before = await stored(); let batch = 0;
    const failing = { ...provider, embed: async input => {
      if (++batch === 2) throw new EmbeddingError('AI_RATE_LIMITED'); return provider.embed(input);
    } };
    await assert.rejects(indexSource(db, entry, actorId, { ...options, provider: failing, force: true }), { code: 'AI_RATE_LIMITED' });
    assert.equal(batch, 2); assert.deepEqual(await stored(), before);
    assert.equal((await document()).indexingStatus, 'ERROR');
    assert.equal((await document()).ingestionMetadata.indexAttempt.billingMayBeIncomplete, true);
  });
  await t.test('explicit retry and model change replace the full index without duplicating chunks', async () => {
    const model = 'text-embedding-3-large';
    const result = await indexSource(db, entry, actorId, { ...options, config: { ...config, model }, provider: makeProvider(model, 1) });
    assert.equal(result.status, 'INDEXED'); const rows = await stored();
    assert.equal(rows.length, ingested.chunks);
    assert.ok(rows.every(row => row.embeddingModel === model && JSON.parse(row.embedding)[1] === 1));
  });
  await t.test('audit failure rolls back replacement vectors and final state together', async () => {
    const before = await stored();
    const wrapped = { user: db.user, knowledgeDocument: db.knowledgeDocument,
      $transaction: (callback, settings) => db.$transaction(tx => callback(new Proxy(tx, { get(target, key) {
        if (key === 'auditLog') return { create: args => {
          if (args.data.action === 'KNOWLEDGE_INDEXED') throw new Error('Synthetic audit outage');
          return target.auditLog.create(args);
        } };
        return Reflect.get(target, key);
      } })), settings) };
    await assert.rejects(indexSource(wrapped, entry, actorId, options), { code: 'INDEXING_FAILED' });
    assert.deepEqual(await stored(), before); assert.equal((await document()).indexingStatus, 'ERROR');
  });
  await t.test('unexpired lease blocks a simultaneous indexer before duplicate external requests', async () => {
    let release; let entered;
    const waiting = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const delayed = { ...provider, embed: async input => { entered(); await waiting; return provider.embed(input); } };
    const first = indexSource(db, entry, actorId, { ...options, provider: delayed });
    try {
      await Promise.race([started, first.then(() => { throw new Error('Expected provider wait'); })]);
      await assert.rejects(indexSource(db, entry, actorId, options), { code: 'INDEXING_BUSY' });
    } finally { release(); }
    assert.equal((await first).status, 'INDEXED');
  });
  await t.test('production company classification and modified chunk content block external processing', async () => {
    const beforeCalls = calls;
    await db.knowledgeDocument.update({ where: { id: ingested.documentId }, data: { classification: 'PRODUCTION' } });
    await assert.rejects(indexSource(db, entry, actorId, options), { code: 'SOURCE_MISMATCH' });
    await db.knowledgeDocument.update({ where: { id: ingested.documentId }, data: { classification: 'DEMONSTRATION' } });
    const chunk = await db.documentChunk.findFirstOrThrow({ where: { documentId: ingested.documentId } });
    await db.documentChunk.update({ where: { id: chunk.id }, data: { content: 'Confidential replacement' } });
    await assert.rejects(indexSource(db, entry, actorId, options), { code: 'SOURCE_MISMATCH' });
    await db.documentChunk.update({ where: { id: chunk.id }, data: { content: chunk.content } });
    assert.equal(calls, beforeCalls);
  });
  await t.test('expired leases can be recovered and a stale worker cannot overwrite a newer run', async () => {
    const doc = await document();
    await db.knowledgeDocument.update({ where: { id: doc.id }, data: { indexingStatus: 'PENDING', ingestionMetadata: {
      ...doc.ingestionMetadata, indexAttempt: { state: 'RUNNING', runId: randomUUID(), expiresAt: '2000-01-01T00:00:00Z' } } } });
    assert.equal((await indexSource(db, entry, actorId, options)).status, 'INDEXED');
    const before = await stored(); const otherRun = randomUUID(); let changed = false;
    const superseding = { ...provider, embed: async input => {
      if (!changed) {
        changed = true; const current = await document();
        await db.knowledgeDocument.update({ where: { id: current.id }, data: { ingestionMetadata: {
          ...current.ingestionMetadata, indexAttempt: { ...current.ingestionMetadata.indexAttempt, runId: otherRun } } } });
      }
      return provider.embed(input);
    } };
    await assert.rejects(indexSource(db, entry, actorId, { ...options, provider: superseding, force: true }), { code: 'INDEXING_SUPERSEDED' });
    assert.deepEqual(await stored(), before);
    assert.equal((await document()).ingestionMetadata.indexAttempt.runId, otherRun);
  });
});
