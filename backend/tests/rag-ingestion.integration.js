import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl } from '../src/config/env.js';
import { ingestSource } from '../src/rag/ingestion-service.js';
import { docxFixture } from './fixtures/rag-documents.js';

test('local PostgreSQL ingestion persists provenance, blocks employees and is idempotent', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai', 'Explicit development database required');
  const root = await mkdtemp(path.join(tmpdir(), 'ewaguard-rag-db-'));
  const db = createDatabaseClient();
  t.after(async () => {
    await db.$disconnect();
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'company-policies'));
  const entry = {
    documentKey: `test-${randomUUID()}`,
    title: 'Synthetic policy',
    filename: 'company-policies/test.docx',
    kind: 'COMPANY_POLICY',
    version: 1,
    classification: 'DEMONSTRATION',
    sourceUse: 'DEMONSTRATION',
  };
  await writeFile(
    path.join(root, entry.filename),
    docxFixture('<w:p><w:r><w:t>Synthetic policy content</w:t></w:r></w:p>'),
  );
  const rollback = new Error('ROLLBACK_SYNTHETIC_FIXTURES');
  try {
    await db.$transaction(
      async (tx) => {
        const adminRole = await tx.role.findUniqueOrThrow({ where: { name: 'IT_SECURITY_ADMIN' } });
        const employeeRole = await tx.role.findUniqueOrThrow({ where: { name: 'EMPLOYEE' } });
        const user = (roleId) => ({
          email: `${randomUUID()}@example.invalid`,
          firstName: 'Synthetic',
          lastName: 'RAG',
          passwordHash: '$2b$12$' + 'x'.repeat(53),
          status: 'ACTIVE',
          roleId,
        });
        const admin = await tx.user.create({ data: user(adminRole.id) });
        const employee = await tx.user.create({ data: user(employeeRole.id) });
        // Keep real Prisma statements in one outer transaction which is rolled back.
        const database = { user: tx.user, $transaction: (callback) => callback(tx) };
        await t.test('employees cannot ingest', () =>
          assert.rejects(ingestSource(database, entry, employee.id, { root }), { code: 'ADMIN_REQUIRED' }),
        );
        const first = await ingestSource(database, entry, admin.id, { root });
        await t.test('draft provenance and unembedded chunks are stored', async () => {
          const doc = await tx.knowledgeDocument.findUniqueOrThrow({
            where: { id: first.documentId },
            include: { chunks: true },
          });
          assert.equal(doc.status, 'DRAFT');
          assert.equal(doc.active, false);
          assert.equal(doc.indexingStatus, 'NOT_INDEXED');
          assert.equal(doc.filename, 'test.docx');
          assert.equal(doc.source, entry.filename);
          assert.equal(doc.classification, 'DEMONSTRATION');
          assert.equal(doc.uploadedById, admin.id);
          assert.match(doc.contentSha256, /^[a-f0-9]{64}$/);
          assert.equal(doc.chunks[0].metadata.referenceTrust, 'UNTRUSTED');
          assert.equal(doc.chunks[0].metadata.page, null);
          const vectors =
            await tx.$queryRaw`SELECT embedding IS NULL AS empty FROM document_chunks WHERE "documentId" = ${doc.id}::uuid`;
          assert.ok(vectors.every((row) => row.empty));
          assert.equal(
            await tx.auditLog.count({ where: { resourceId: doc.id, action: 'KNOWLEDGE_DOCUMENT_INGESTED' } }),
            1,
          );
        });
        await t.test('repeat ingestion creates neither chunks nor audit duplicates', async () => {
          const repeat = await ingestSource(database, entry, admin.id, { root });
          assert.equal(repeat.status, 'UNCHANGED');
          assert.equal(repeat.documentId, first.documentId);
          assert.equal(await tx.knowledgeDocument.count({ where: { documentKey: entry.documentKey } }), 1);
          assert.equal(await tx.documentChunk.count({ where: { documentId: first.documentId } }), first.chunks);
          assert.equal(await tx.auditLog.count({ where: { resourceId: first.documentId } }), 1);
        });
        await t.test('changed bytes require a new version and preserve old content', async () => {
          await writeFile(
            path.join(root, entry.filename),
            docxFixture('<w:p><w:r><w:t>Updated synthetic content</w:t></w:r></w:p>'),
          );
          await assert.rejects(ingestSource(database, entry, admin.id, { root }), { code: 'VERSION_CONFLICT' });
          const next = await ingestSource(database, { ...entry, version: 2 }, admin.id, { root });
          assert.notEqual(next.documentId, first.documentId);
          const original = await tx.documentChunk.findFirst({ where: { documentId: first.documentId } });
          assert.equal(original.content, 'Synthetic policy content');
        });
        await t.test('suspended administrators cannot ingest', async () => {
          await tx.user.update({ where: { id: admin.id }, data: { status: 'SUSPENDED' } });
          await assert.rejects(ingestSource(database, entry, admin.id, { root }), { code: 'ADMIN_REQUIRED' });
        });
        throw rollback;
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await db.knowledgeDocument.count({ where: { documentKey: entry.documentKey } }), 0);
});
