import '../src/config/env.js';
import { embeddingConfig, EmbeddingError } from '../src/rag/embedding-policy.js';
import { createEmbeddingAdapter } from '../src/rag/openai-embeddings.js';

// Explicit opt-in command. Sends one synthetic sentence; no document/database access.
try {
  if (process.argv.length !== 2) throw new EmbeddingError('INVALID_ARGUMENTS');
  const config = embeddingConfig();
  const result = await createEmbeddingAdapter(config).embed([
    'Synthetic cybersecurity awareness embedding verification.',
  ]);
  console.info(
    JSON.stringify({
      status: 'VERIFIED',
      model: config.model,
      dimensions: result.vectors[0].length,
      totalTokens: result.totalTokens,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'FAILED',
      code: error instanceof EmbeddingError ? error.code : 'EMBEDDING_VERIFICATION_FAILED',
    }),
  );
  process.exitCode = 1;
}
