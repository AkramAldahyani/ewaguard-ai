import OpenAI from 'openai';
import { providerError } from '../ai/openai-adapter.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODELS, EMBEDDING_LIMITS, EmbeddingError, inputByteBound, validateVector } from './embedding-policy.js';

export function createEmbeddingAdapter({ apiKey, model = 'text-embedding-3-small', client } = {}) {
  if (!EMBEDDING_MODELS.includes(model)) throw new EmbeddingError('EMBEDDING_MODEL_UNSUPPORTED');
  let sdk = client;
  return Object.freeze({ model, dimensions: EMBEDDING_DIMENSIONS,
    async embed(input, { signal } = {}) {
      if (!apiKey || apiKey === 'YOUR_OPENAI_API_KEY') throw new EmbeddingError('AI_NOT_CONFIGURED');
      if (!Array.isArray(input) || !input.length || input.length > EMBEDDING_LIMITS.batchSize)
        throw new EmbeddingError('EMBEDDING_BATCH_INVALID');
      input.forEach(inputByteBound);
      sdk ??= new OpenAI({ apiKey, baseURL: 'https://api.openai.com/v1', maxRetries: 0,
        timeout: EMBEDDING_LIMITS.requestMs, logLevel: 'off' });
      let response;
      try {
        response = await sdk.embeddings.create({ model, dimensions: EMBEDDING_DIMENSIONS, input, encoding_format: 'float' },
          { maxRetries: 0, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(EMBEDDING_LIMITS.requestMs)])
            : AbortSignal.timeout(EMBEDDING_LIMITS.requestMs) });
      } catch (error) { throw new EmbeddingError(providerError(error).code); }
      if (response?.model !== model || !Array.isArray(response.data) || response.data.length !== input.length ||
        !Number.isSafeInteger(response.usage?.total_tokens) || response.usage.total_tokens < 0)
        throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID');
      const vectors = new Array(input.length); const seen = new Set();
      for (const item of response.data) {
        if (!Number.isInteger(item?.index) || item.index < 0 || item.index >= input.length || seen.has(item.index))
          throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID');
        seen.add(item.index); vectors[item.index] = validateVector(item.embedding);
      }
      return { vectors, totalTokens: response.usage.total_tokens };
    },
  });
}
