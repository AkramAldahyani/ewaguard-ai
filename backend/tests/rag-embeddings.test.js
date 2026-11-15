import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmbeddingAdapter } from '../src/rag/openai-embeddings.js';
import { embeddingConfig, inputByteBound, validateVector } from '../src/rag/embedding-policy.js';

const vector = () => [1, ...Array(1535).fill(0)];
const response = (count = 1) => ({
  model: 'text-embedding-3-small',
  usage: { total_tokens: 4 },
  data: Array.from({ length: count }, (_, index) => ({ index, embedding: vector() })),
});
const adapter = (handler) =>
  createEmbeddingAdapter({ apiKey: 'synthetic-test-key', client: { embeddings: { create: handler } } });

test('embedding configuration is allow-listed and fixed to existing vector dimensions', () => {
  assert.equal(embeddingConfig({}).model, 'text-embedding-3-small');
  assert.equal(embeddingConfig({ OPENAI_EMBEDDING_MODEL: 'text-embedding-3-large' }).dimensions, 1536);
  assert.throws(() => embeddingConfig({ OPENAI_EMBEDDING_MODEL: 'unreviewed-model' }));
  assert.throws(() => embeddingConfig({ RAG_EMBEDDING_MAX_DOCUMENT_BYTES: '999999999' }));
});

test('bounded inputs handle Unicode and reject empty, malformed or excessive text before API calls', async () => {
  assert.equal(inputByteBound('مرحبا'), 10);
  assert.equal(inputByteBound('a'.repeat(8000)), 8000);
  let calls = 0;
  const provider = adapter(async () => {
    calls++;
    return response();
  });
  for (const input of [[''], ['  '], ['\ud800'], ['a'.repeat(8001)], ['😀'.repeat(2001)], Array(17).fill('test'), []])
    await assert.rejects(provider.embed(input));
  assert.equal(calls, 0);
  await assert.rejects(createEmbeddingAdapter().embed(['test']), { code: 'AI_NOT_CONFIGURED' });
});

test('SDK request uses float embeddings, dimensions, bounded time and no retries; handles response order', async () => {
  let calls = 0;
  const provider = adapter(async (body, options) => {
    calls++;
    assert.equal(body.dimensions, 1536);
    assert.equal(body.encoding_format, 'float');
    assert.equal(body.model, 'text-embedding-3-small');
    assert.deepEqual(body.input, ['first', 'second']);
    assert.equal(options.maxRetries, 0);
    assert.ok(options.signal instanceof AbortSignal);
    const result = response(2);
    result.data[1].embedding = [0, 1, ...Array(1534).fill(0)];
    result.data.reverse();
    return result;
  });
  const result = await provider.embed(['first', 'second']);
  assert.equal(result.vectors[0][0], 1);
  assert.equal(result.vectors[1][1], 1);
  assert.equal(result.totalTokens, 4);
  assert.equal(calls, 1);
});

test('wrong dimensions, zero/nonfinite vectors, missing/duplicate indices, usage and model mismatches fail closed', async () => {
  for (const bad of [
    Array(1536).fill(0),
    [1],
    [NaN, ...Array(1535).fill(0)],
    [Infinity, ...Array(1535).fill(0)],
    [1e-100, ...Array(1535).fill(0)],
  ])
    assert.throws(() => validateVector(bad));
  for (const change of [
    (r) => {
      r.model = 'other';
    },
    (r) => {
      r.data = [];
    },
    (r) => {
      r.data[0].index = 2;
    },
    (r) => {
      r.data[0].embedding = [1];
    },
    (r) => {
      r.usage = {};
    },
    (r) => {
      r.data.push(r.data[0]);
    },
  ]) {
    const result = response();
    change(result);
    await assert.rejects(adapter(async () => result).embed(['test']), { code: 'EMBEDDING_RESPONSE_INVALID' });
  }
  const result = response(2);
  result.data[1].index = 0;
  await assert.rejects(adapter(async () => result).embed(['a', 'b']), { code: 'EMBEDDING_RESPONSE_INVALID' });
});

test('provider failures are sanitized and never retried', async () => {
  for (const [error, code] of [
    [{ status: 429 }, 'AI_RATE_LIMITED'],
    [{ status: 401 }, 'AI_AUTHENTICATION_FAILED'],
    [{ name: 'APIConnectionTimeoutError' }, 'AI_TIMEOUT'],
    [{ code: 'insufficient_quota' }, 'AI_CREDITS_UNAVAILABLE'],
    [{ status: 500 }, 'AI_PROVIDER_UNAVAILABLE'],
  ]) {
    let calls = 0;
    await assert.rejects(
      adapter(async () => {
        calls++;
        throw { ...error, message: 'secret provider payload' };
      }).embed(['test']),
      (failure) => failure.code === code && !failure.message.includes('secret'),
    );
    assert.equal(calls, 1);
  }
});
