import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { databaseUrl } from '../src/config/env.js';

// Real vector round trips with synthetic fixtures, rolled back even on failure.
test('pgvector document embeddings', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  t.after(async () => { await db.query('ROLLBACK'); await db.end(); });
  await db.query('BEGIN');

  await t.test('extension, vector dimension and HNSW index exist', async () => {
    assert.equal((await db.query("SELECT extname FROM pg_extension WHERE extname = 'vector'")).rowCount, 1);
    const column = await db.query("SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = 'document_chunks'::regclass AND attname = 'embedding' AND NOT attisdropped");
    assert.equal(column.rows[0]?.type, 'vector(1536)');
    const index = await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'document_chunks_embedding_hnsw'");
    assert.match(index.rows[0]?.indexdef ?? '', /USING hnsw.*vector_cosine_ops/);
  });

  const userId = randomUUID();
  const documentId = randomUUID();
  const nearId = randomUUID();
  const farId = randomUUID();
  const vector = (axis) => JSON.stringify(Array.from({ length: 1536 }, (_, index) => index === axis ? 1 : 0));
  await db.query('INSERT INTO users (id, email, "firstName", "lastName", "roleId", "updatedAt") SELECT $1, $2, $3, $4, id, now() FROM roles WHERE name = $5', [userId, `${userId}@example.invalid`, 'Vector', 'Test', 'EMPLOYEE']);
  await db.query('INSERT INTO knowledge_documents (id, kind, "documentKey", title, source, "uploadedById", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())', [documentId, 'PDPL', documentId, 'Synthetic vector test', 'example.invalid', userId]);
  for (const [id, position] of [[nearId, 0], [farId, 1]]) {
    await db.query('INSERT INTO document_chunks (id, "documentId", position, content, "embeddingModel", embedding, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6::vector, now())', [id, documentId, position, 'Synthetic test data', 'synthetic-unit-vector-1536', vector(position)]);
  }
  await t.test('1536-dimensional vectors persist and rank by cosine distance', async () => {
    const result = await db.query('SELECT id, vector_dims(embedding) AS dimensions, embedding <=> $1::vector AS distance FROM document_chunks WHERE "documentId" = $2 ORDER BY embedding <=> $1::vector', [vector(0), documentId]);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].id, nearId);
    assert.equal(result.rows[0].dimensions, 1536);
    assert.equal(result.rows[0].distance, 0);
    assert.equal(result.rows[1].id, farId);
    assert.equal(result.rows[1].distance, 1);
  });
  await t.test('vectors can be returned through an explicit text cast', async () => {
    const result = await db.query('SELECT embedding::text AS embedding FROM document_chunks WHERE id = $1', [nearId]);
    assert.deepEqual(JSON.parse(result.rows[0].embedding), JSON.parse(vector(0)));
  });
  async function reject(name, sql, values, code) {
    await t.test(name, async () => {
      await db.query('SAVEPOINT vector_negative');
      try { await assert.rejects(() => db.query(sql, values), { code }); }
      finally { await db.query('ROLLBACK TO SAVEPOINT vector_negative'); }
    });
  }
  await reject('wrong dimensions are rejected', 'UPDATE document_chunks SET embedding = $1::vector WHERE id = $2', ['[1,0,0]', nearId], '22000');
  await reject('populated embeddings require model metadata', 'UPDATE document_chunks SET "embeddingModel" = NULL WHERE id = $1', [nearId], '23514');
});
