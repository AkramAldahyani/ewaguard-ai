export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_MODELS = Object.freeze(['text-embedding-3-small', 'text-embedding-3-large']);
export const EMBEDDING_LIMITS = Object.freeze({
  inputBytes: 8000,
  batchSize: 16,
  requestMs: 30_000,
  jobMs: 300_000,
  leaseMs: 600_000,
  maxRunBytes: 1_000_000,
});
export class EmbeddingError extends Error {
  constructor(code) {
    super('Knowledge document indexing could not be completed.');
    this.code = code;
  }
}

export function embeddingConfig(env = process.env) {
  const model = env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
  const maxDocumentBytes = Number(env.RAG_EMBEDDING_MAX_DOCUMENT_BYTES ?? '250000');
  if (!EMBEDDING_MODELS.includes(model)) throw new EmbeddingError('EMBEDDING_MODEL_UNSUPPORTED');
  if (!Number.isInteger(maxDocumentBytes) || maxDocumentBytes < 8000 || maxDocumentBytes > 2_000_000)
    throw new EmbeddingError('EMBEDDING_BUDGET_INVALID');
  return Object.freeze({
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    maxDocumentBytes,
    apiKey: env.OPENAI_API_KEY?.trim() || null,
  });
}

// For byte-level BPE models, UTF-8 bytes bound the token count from above.
// This is deliberately conservative, not an estimated/exact token count.
export function inputByteBound(text) {
  if (typeof text !== 'string' || !text.trim() || !text.isWellFormed())
    throw new EmbeddingError('EMBEDDING_INPUT_INVALID');
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > EMBEDDING_LIMITS.inputBytes) throw new EmbeddingError('EMBEDDING_INPUT_LIMIT');
  return bytes;
}

export function validateVector(vector) {
  if (
    !Array.isArray(vector) ||
    vector.length !== EMBEDDING_DIMENSIONS ||
    !vector.every((value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1) ||
    !vector.some((value) => Math.fround(value) !== 0)
  )
    throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID');
  return vector;
}
