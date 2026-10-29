import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl, parseConfig } from '../src/config/env.js';
import { issueAccessToken, authCookie } from '../src/auth/auth-token.js';
import { PRIVACY_NOTICE, modelPricing } from '../src/ai/chat-policy.js';
import { PDPL_SHA256, PDPL_PROFILE } from '../src/rag/pdpl-source.js';
import { searchChunks, readReferenceChunks } from '../src/rag/retrieval-store.js';

test('PDPL chat HTTP integration: actual PostgreSQL, synthetic providers, owned receipts and publication controls', async t => {
  const url = new URL(databaseUrl());
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const database = createDatabaseClient(); const users = []; let doc; let server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    try {
      await database.aiUsage.deleteMany({ where: { userId: { in: users } } });
      await database.auditLog.deleteMany({ where: { actorId: { in: users } } });
      if (doc) await database.knowledgeDocument.delete({ where: { id: doc.id } });
      await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
      await database.user.deleteMany({ where: { id: { in: users } } });
    } finally { await database.$disconnect(); }
  });
  const config = parseConfig({ NODE_ENV: 'test', FRONTEND_URL: 'http://127.0.0.1:5173',
    JWT_SECRET: 'synthetic-pdpl-chat-jwt-secret-32-characters', OPENAI_API_KEY: 'synthetic-not-a-live-key' });
  async function actor(role = 'EMPLOYEE') {
    const user = await database.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'Synthetic', lastName: 'PDPL Chat',
      status: 'ACTIVE', passwordHash: 'not-a-login-hash', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}) } });
    users.push(user.id);
    return { user, token: issueAccessToken(user.id, config, user.mfaEnabledAt), session: await database.chatSession.create({
      data: { ownerId: user.id, expiresAt: new Date(Date.now() + 3600000) } }) };
  }
  const owner = await actor(); const other = await actor(); const admin = await actor('IT_SECURITY_ADMIN');
  // Fixture only: copied public excerpt, synthetic vector. The approved real corpus is never modified.
  const source = await database.documentChunk.findFirstOrThrow({ where: { document: { documentKey: 'bahrain-pdpl', version: 1 },
    metadata: { path: ['section'], equals: 'PDPL Article (1)' } }, orderBy: { position: 'asc' } });
  doc = await database.knowledgeDocument.create({ data: { kind: 'PDPL', documentKey: 'bahrain-pdpl', version: 2147482000,
    title: 'Synthetic integration fixture using a public PDPL excerpt', source: 'pdpl/bahrain_pdpl.pdf', filename: 'bahrain_pdpl.pdf',
    contentSha256: PDPL_SHA256, uploadedById: admin.user.id, approvedById: admin.user.id, approvedAt: new Date(),
    active: true, status: 'APPROVED', indexingStatus: 'INDEXED', classification: 'PRODUCTION',
    ingestionMetadata: { referenceTrust: 'UNTRUSTED', legalSource: PDPL_PROFILE, index: { model: 'text-embedding-3-small', dimensions: 1536 } },
    chunks: { create: { position: 0, content: source.content, metadata: source.metadata } } }, include: { chunks: true } });
  const vector = [1, ...Array(1535).fill(0)]; const encoded = JSON.stringify(vector);
  await database.$executeRaw`UPDATE document_chunks SET embedding = ${encoded}::vector, "embeddingModel" = 'text-embedding-3-small' WHERE id = ${doc.chunks[0].id}::uuid`;
  await t.test('article context excludes frontmatter and includes an eligible low-similarity continuation only', async () => {
    const extra = [];
    for (const [position, section, page] of [[1, 'PDPL Article (1)', 4], [2, null, 1], [3, 'PDPL Article (22)', 19]]) {
      const chunk = await database.documentChunk.create({ data: { documentId: doc.id, position,
        content: 'Synthetic continuation or frontmatter for retrieval boundary testing.',
        metadata: { page, section, referenceTrust: 'UNTRUSTED' } } });
      extra.push(chunk);
      const values = JSON.stringify(position === 2 ? vector : [-1, ...Array(1535).fill(0)]);
      await database.$executeRaw`UPDATE document_chunks SET embedding = ${values}::vector, "embeddingModel" = 'text-embedding-3-small' WHERE id = ${chunk.id}::uuid`;
    }
    const filters = { category: 'PDPL', classification: 'PRODUCTION', approvalStatus: 'APPROVED',
      documentKey: 'bahrain-pdpl', contentSha256: PDPL_SHA256, pdplContext: true, question: 'Define personal data', limit: 3 };
    try {
      const matches = await searchChunks(database, filters, 'text-embedding-3-small', vector);
      assert.equal(matches[0].chunkId, doc.chunks[0].id);
      assert.equal(matches[1].chunkId, extra[0].id); assert.equal(matches[1].source.page, 4);
      assert.ok(!matches.some(m => [extra[1].id, extra[2].id].includes(m.chunkId)));
      await database.documentChunk.update({ where: { id: extra[0].id }, data: { metadata: { page: 4, section: 'PDPL Article (1)', referenceTrust: 'INVALID' } } });
      const removed = await readReferenceChunks(database, filters, 'text-embedding-3-small', [extra[0].id]);
      assert.deepEqual(removed, []);
    } finally { await database.documentChunk.deleteMany({ where: { id: { in: extra.map(c => c.id) } } }); }
  });
  await t.test('hybrid chat ranking promotes relevant legal terms without admitting untrusted chunks', async () => {
    const chunks = [];
    try {
      for (const [position, trust] of [[40, 'UNTRUSTED'], [41, 'INVALID']]) {
        const chunk = await database.documentChunk.create({ data: { documentId: doc.id, position,
          content: 'Synthetic consent example. Consent is the relevant subject of this test passage.',
          metadata: { page: 8, section: `Synthetic section ${position}`, referenceTrust: trust } } });
        chunks.push(chunk);
        const encoded = JSON.stringify([0.9, Math.sqrt(0.19), ...Array(1534).fill(0)]);
        await database.$executeRaw`UPDATE document_chunks SET embedding = ${encoded}::vector, "embeddingModel" = 'text-embedding-3-small' WHERE id = ${chunk.id}::uuid`;
      }
      const matches = await searchChunks(database, { category: 'PDPL', classification: 'PRODUCTION', approvalStatus: 'APPROVED',
        documentKey: 'bahrain-pdpl', contentSha256: PDPL_SHA256, pdplContext: true, question: 'Can customer records be collected without consent?', limit: 3 }, 'text-embedding-3-small', vector);
      assert.equal(matches[0].chunkId, chunks[0].id);
      assert.ok(!matches.some(m => m.chunkId === chunks[1].id));
    } finally { await database.documentChunk.deleteMany({ where: { id: { in: chunks.map(c => c.id) } } }); }
  });
  let embeddings = 0; let modelCalls = 0; let supported = true; let beforeAnswer = async () => {};
  const sentQuestions = [];
  const embeddingProvider = { model: 'text-embedding-3-small', dimensions: 1536, embed: async input => {
    embeddings++; sentQuestions.push(input); return { vectors: [vector], totalTokens: 1 };
  } };
  const provider = { model: 'gpt-6-luna', verify: async () => modelPricing('gpt-6-luna'), respond: async (input, options) => {
    modelCalls++;
    const output = input.findLast(item => item.type === 'function_call_output');
    let items;
    if (!output) items = [{ type: 'function_call', name: 'search_pdpl', call_id: 'pdpl_test', arguments: '{}' }];
    else {
      assert.equal(options.enableTools, false);
      const evidence = JSON.parse(output.output); const match = evidence.data.matches[0];
      await beforeAnswer();
      const value = supported ? { supported: true, explanation: 'The retrieved passage provides relevant definitions [PDPL1].',
        citations: [{ id: 'PDPL1', quoteId: match.quotes[0].id }] } : { supported: false, explanation: '', citations: [] };
      items = [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(value) }] }];
    }
    return { model: 'gpt-6-luna', status: 'completed', usage: { input_tokens: 100, output_tokens: 100 }, output: items };
  } };
  server = createApp(config, { database, chat: { provider, embeddingProvider } }).listen(0, '127.0.0.1');
  await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}`;
  const fetchOriginal = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (target, options) => { assert.equal(new URL(target).hostname, '127.0.0.1'); return fetchOriginal(target, options); });
  const path = `/api/chat/conversations/${owner.session.id}`;
  async function http(suffix, body, who = owner) {
    const response = await fetch(base + path + suffix, { method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: config.frontendUrl ?? 'http://127.0.0.1:5173', 'Content-Type': 'application/json',
        ...(who ? { Cookie: `${authCookie(config).name}=${who.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  }
  const body = content => ({ content, requestId: randomUUID(), privacyNoticeVersion: PRIVACY_NOTICE.version });
  let saved;
  await t.test('multiple PDPL questions return grounded answers and real physical source metadata', async () => {
    for (const question of ['What does Bahrain PDPL mean by personal data?', 'What is sensitive personal data under PDPL?']) {
      const request = body(question); const response = await http('/messages', request);
      assert.equal(response.status, 201, JSON.stringify(response.data));
      assert.match(response.data.messages[1].content, /Unofficial English/);
      assert.match(response.data.messages[1].content, /PDF page 3/);
      const match = response.data.verifiedResults[0].data.matches[0];
      assert.equal(match.source.documentId, doc.id); assert.equal(match.source.section, 'PDPL Article (1)');
      assert.deepEqual(sentQuestions.at(-1), [question]); saved = request;
      assert.ok(!JSON.stringify(response.data.toolMetadata).includes(source.content));
    }
  });
  await t.test('receipt recovery and replay incur no new embedding/model calls; foreign receipt denied', async () => {
    const before = [embeddings, modelCalls];
    const recovered = await http(`/requests/${saved.requestId}`);
    assert.equal(recovered.status, 200, JSON.stringify(recovered.data));
    assert.equal(recovered.data.verifiedResults[0].data.matches[0].chunkId, doc.chunks[0].id);
    assert.equal((await http('/messages', saved)).status, 200);
    assert.deepEqual([embeddings, modelCalls], before);
    assert.equal((await http(`/requests/${saved.requestId}`, undefined, other)).status, 404);
  });
  await t.test('old consent, anonymous users, administrators and foreign conversations are rejected', async () => {
    const before = embeddings;
    assert.equal((await http('/messages', { ...body('PDPL?'), privacyNoticeVersion: 'chat-privacy-v4' })).status, 400);
    assert.equal((await http('/messages', body('PDPL?'), null)).status, 401);
    assert.equal((await http('/messages', body('PDPL?'), admin)).status, 403);
    assert.equal((await http('/messages', body('PDPL?'), other)).status, 404);
    assert.equal(embeddings, before);
  });
  await t.test('unanswerable material produces a limitation, not an invented rule', async () => {
    supported = false;
    const response = await http('/messages', body('What does Bahrain PDPL say about the 2035 lunar colony privacy authority?'));
    assert.equal(response.status, 201); assert.match(response.data.messages[1].content, /does not support a reliable answer/);
    supported = true;
  });
  await t.test('withdrawal during generation invalidates the answer and recovered citations', async () => {
    beforeAnswer = () => database.knowledgeDocument.update({ where: { id: doc.id }, data: { active: false } });
    const response = await http('/messages', body('What is personal data under PDPL?'));
    assert.equal(response.status, 201); assert.match(response.data.messages[1].content, /does not support/);
    const recovered = await http(`/requests/${saved.requestId}`);
    assert.equal(recovered.data.verifiedResults[0].data.status, 'SOURCES_UNAVAILABLE');
    assert.deepEqual(recovered.data.verifiedResults[0].data.matches, []);
  });
});
