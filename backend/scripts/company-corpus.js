import { createHash } from 'node:crypto';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig } from '../src/config/env.js';
import { loadLocalManifest, prepareSource } from '../src/rag/local-sources.js';
import { isDemoPolicy } from '../src/rag/company-source.js';
import { ingestSource } from '../src/rag/ingestion-service.js';
import { indexSource, previewIndex } from '../src/rag/indexing-service.js';
import { activateDemoPolicy } from '../src/rag/company-activation.js';
import { embeddingConfig, EMBEDDING_LIMITS, EmbeddingError } from '../src/rag/embedding-policy.js';
import { createEmbeddingAdapter } from '../src/rag/openai-embeddings.js';
import { IngestionError } from '../src/rag/ingestion-policy.js';

let database;
try {
  const args = process.argv.slice(2);
  const mode = args[0] ?? '--preview';
  if (
    !['--preview', '--ingest', '--index', '--activate-demo'].includes(mode) ||
    (mode === '--preview'
      ? args.length > 1
      : args[1] !== '--actor-email' || !args[2] || args.length !== (mode === '--activate-demo' ? 5 : 3)) ||
    (mode === '--activate-demo' && args[3] !== '--reviewed-sha256')
  )
    throw new IngestionError('INVALID_ARGUMENTS');
  const sources = (await loadLocalManifest()).filter(isDemoPolicy);
  if (sources.length !== 7) throw new IngestionError('SEVEN_DEMONSTRATION_SOURCES_REQUIRED');
  const prepared = [];
  for (const source of sources) {
    const item = await prepareSource(source);
    if (!item.ingestionMetadata.policySource?.demonstrationNoticePresent)
      throw new IngestionError('DEMONSTRATION_LABEL_REQUIRED');
    prepared.push(item);
  }
  const corpusSha256 = createHash('sha256')
    .update(JSON.stringify(prepared.map((p) => ({ source: p.source, hash: p.contentSha256 }))))
    .digest('hex');
  database = createDatabaseClient();
  const indexConfig = embeddingConfig();
  const previews = [];
  for (const source of sources) previews.push(await previewIndex(database, source, indexConfig));
  if (previews.reduce((sum, p) => sum + p.inputBytes, 0) > EMBEDDING_LIMITS.maxRunBytes)
    throw new EmbeddingError('RUN_BUDGET_EXCEEDED');
  if (mode === '--preview') {
    console.info(
      JSON.stringify({
        corpusSha256,
        documents: previews.map((p, i) => ({
          ...p,
          policySource: prepared[i].ingestionMetadata.policySource,
          sections: [...new Set(prepared[i].chunks.map((c) => c.metadata.section).filter(Boolean))],
        })),
      }),
    );
  } else {
    const actor = await database.user.findFirst({
      where: {
        email: args[2].trim().toLowerCase(),
        status: 'ACTIVE',
        deletedAt: null,
        role: { name: 'IT_SECURITY_ADMIN' },
      },
      select: { id: true },
    });
    if (!actor) throw new IngestionError('ADMIN_REQUIRED');
    if (mode === '--activate-demo' && args[4] !== corpusSha256) throw new IngestionError('SOURCE_REVIEW_REQUIRED');
    const config = parseConfig();
    const provider = mode === '--index' ? createEmbeddingAdapter(indexConfig) : null;
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const result =
        mode === '--ingest'
          ? await ingestSource(database, source, actor.id)
          : mode === '--index'
            ? await indexSource(database, source, actor.id, { config: indexConfig, provider })
            : await activateDemoPolicy(database, source, actor.id, prepared[i].contentSha256, { config });
      console.info(JSON.stringify({ documentKey: source.documentKey, ...result }));
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      event: 'company_corpus',
      status: 'FAILED',
      code:
        error instanceof IngestionError || error instanceof EmbeddingError
          ? error.code
          : 'COMPANY_CORPUS_OPERATION_FAILED',
    }),
  );
  process.exitCode = 1;
} finally {
  await database?.$disconnect();
}
