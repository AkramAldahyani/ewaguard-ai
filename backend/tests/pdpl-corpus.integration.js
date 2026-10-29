import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl } from '../src/config/env.js';
import { loadLocalManifest } from '../src/rag/local-sources.js';
import { ingestSource } from '../src/rag/ingestion-service.js';
import { indexSource } from '../src/rag/indexing-service.js';
import { approvePdpl } from '../src/rag/pdpl-approval.js';
import { PDPL_SHA256 } from '../src/rag/pdpl-source.js';
import { hasRetrievableChunks, searchChunks } from '../src/rag/retrieval-store.js';

test('PDPL corpus lifecycle uses real PostgreSQL with rollback-only fixtures and synthetic vectors', async t => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(); t.after(() => db.$disconnect());
  const source = { ...(await loadLocalManifest()).find(s => s.documentKey === 'bahrain-pdpl'), version: 2147483000 };
  const rollback = new Error('ROLLBACK_PDPL_FIXTURES');
  let documentId;
  try {
    await db.$transaction(async tx => {
      // Isolate visibility inside this rollback-only transaction; never commit publication changes.
      await tx.knowledgeDocument.updateMany({ where: { kind: 'PDPL', documentKey: source.documentKey, active: true }, data: { active: false } });
      const roles = await tx.role.findMany({ where: { name: { in: ['EMPLOYEE', 'IT_SECURITY_ADMIN'] } } });
      const makeUser = name => tx.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'Synthetic',
        lastName: 'PDPL', status: 'ACTIVE', passwordHash: '$2b$12$' + 'x'.repeat(53), roleId: roles.find(r => r.name === name).id } });
      const admin = await makeUser('IT_SECURITY_ADMIN'); const employee = await makeUser('EMPLOYEE');
      const database = { user: tx.user, knowledgeDocument: tx.knowledgeDocument, $transaction: callback => callback(tx) };
      const first = await ingestSource(database, source, admin.id); documentId = first.documentId;
      const filters = { category: 'PDPL', classification: 'PRODUCTION', approvalStatus: 'APPROVED', limit: 3 };
      const model = 'text-embedding-3-small'; const vector = [1, ...Array(1535).fill(0)]; let calls = 0;
      const provider = { model, dimensions: 1536, embed: async input => { calls++; return { vectors: input.map(() => vector), totalTokens: 0 }; } };
      const config = { model, maxDocumentBytes: 250000 };
      await t.test('ingestion is inactive and repeat does not duplicate', async () => {
        assert.equal((await ingestSource(database, source, admin.id)).status, 'UNCHANGED');
        assert.equal(await hasRetrievableChunks(tx, filters, model), false);
        await assert.rejects(approvePdpl(database, source, admin.id, PDPL_SHA256), { code: 'PDPL_NOT_READY_FOR_APPROVAL' });
      });
      await t.test('employees and wrong review fingerprints cannot approve', async () => {
        await assert.rejects(approvePdpl(database, source, employee.id, PDPL_SHA256), { code: 'ADMIN_REQUIRED' });
        await assert.rejects(approvePdpl(database, source, admin.id, 'wrong'), { code: 'SOURCE_REVIEW_REQUIRED' });
        await assert.rejects(approvePdpl(database, { ...source, kind: 'COMPANY_POLICY' }, admin.id, PDPL_SHA256), { code: 'PDPL_SOURCE_REQUIRED' });
      });
      await t.test('indexing remains unpublished and duplicate indexing makes no provider calls', async () => {
        assert.equal((await indexSource(database, source, admin.id, { config, provider })).status, 'INDEXED');
        const initialCalls = calls;
        assert.equal((await indexSource(database, source, admin.id, { config, provider })).status, 'UNCHANGED');
        assert.equal(calls, initialCalls);
        assert.equal(await hasRetrievableChunks(tx, filters, model), false);
      });
      const chunk = await tx.documentChunk.findFirstOrThrow({ where: { documentId }, orderBy: { position: 'asc' } });
      await t.test('forged citation metadata is rejected before indexing or approval', async () => {
        await tx.documentChunk.update({ where: { id: chunk.id }, data: { metadata: { ...chunk.metadata, page: 999 } } });
        await assert.rejects(approvePdpl(database, source, admin.id, PDPL_SHA256), { code: 'PDPL_NOT_READY_FOR_APPROVAL' });
        await assert.rejects(indexSource(database, source, admin.id, { config, provider }), { code: 'SOURCE_MISMATCH' });
        await tx.documentChunk.update({ where: { id: chunk.id }, data: { metadata: chunk.metadata } });
      });
      await t.test('missing embeddings prevent publication', async () => {
        await tx.$executeRaw`UPDATE document_chunks SET embedding = NULL WHERE id = ${chunk.id}::uuid`;
        await assert.rejects(approvePdpl(database, source, admin.id, PDPL_SHA256), { code: 'PDPL_NOT_READY_FOR_APPROVAL' });
        const encoded = JSON.stringify(vector);
        await tx.$executeRaw`UPDATE document_chunks SET embedding = ${encoded}::vector WHERE id = ${chunk.id}::uuid`;
      });
      await t.test('another active version blocks approval without silently replacing it', async () => {
        const alternate = await tx.knowledgeDocument.create({ data: { kind: 'PDPL', documentKey: source.documentKey,
          version: source.version + 1, title: 'Synthetic competing version', source: 'synthetic-only', uploadedById: admin.id,
          approvedById: admin.id, approvedAt: new Date(), active: true, status: 'APPROVED' } });
        await assert.rejects(approvePdpl(database, source, admin.id, PDPL_SHA256), { code: 'ACTIVE_VERSION_CONFLICT' });
        assert.equal((await tx.knowledgeDocument.findUniqueOrThrow({ where: { id: alternate.id } })).active, true);
        await tx.knowledgeDocument.update({ where: { id: alternate.id }, data: { active: false } });
      });
      await t.test('forged official-translation metadata cannot be published', async () => {
        const doc = await tx.knowledgeDocument.findUniqueOrThrow({ where: { id: documentId } });
        await tx.knowledgeDocument.update({ where: { id: documentId }, data: { ingestionMetadata: { ...doc.ingestionMetadata,
          legalSource: { ...doc.ingestionMetadata.legalSource, translationStatus: 'OFFICIAL' } } } });
        await assert.rejects(approvePdpl(database, source, admin.id, PDPL_SHA256), { code: 'PDPL_NOT_READY_FOR_APPROVAL' });
        await tx.knowledgeDocument.update({ where: { id: documentId }, data: { ingestionMetadata: doc.ingestionMetadata } });
      });
      await t.test('approval is audited, idempotent and enables actual source retrieval', async () => {
        assert.equal((await approvePdpl(database, source, admin.id, PDPL_SHA256)).status, 'APPROVED');
        assert.equal((await approvePdpl(database, source, admin.id, PDPL_SHA256)).status, 'UNCHANGED');
        assert.equal(await tx.auditLog.count({ where: { resourceId: documentId, action: 'KNOWLEDGE_DOCUMENT_APPROVED' } }), 1);
        const matches = await searchChunks(database, filters, model, vector);
        assert.equal(matches.length, 3);
        assert.ok(matches.every(m => m.source.documentId === documentId && m.source.page > 0));
        const doc = await tx.knowledgeDocument.findUniqueOrThrow({ where: { id: documentId } });
        assert.equal(doc.approvedById, admin.id);
        assert.equal(doc.ingestionMetadata.legalSource.translationStatus, 'UNOFFICIAL');
      });
      await t.test('suspended administrators cannot approve', async () => {
        await tx.user.update({ where: { id: admin.id }, data: { status: 'SUSPENDED' } });
        await assert.rejects(approvePdpl(database, source, admin.id, PDPL_SHA256), { code: 'ADMIN_REQUIRED' });
      });
      throw rollback;
    }, { timeout: 120000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.knowledgeDocument.count({ where: { id: documentId } }), 0);
});
