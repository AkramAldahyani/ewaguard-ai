import { createDatabaseClient } from '../src/config/database.js';
import { loadLocalManifest, prepareSource } from '../src/rag/local-sources.js';
import { ingestSource } from '../src/rag/ingestion-service.js';
import { indexSource, previewIndex } from '../src/rag/indexing-service.js';
import { embeddingConfig, EmbeddingError } from '../src/rag/embedding-policy.js';
import { createEmbeddingAdapter } from '../src/rag/openai-embeddings.js';
import { IngestionError } from '../src/rag/ingestion-policy.js';
import { isPdplSource } from '../src/rag/pdpl-source.js';
import { approvePdpl } from '../src/rag/pdpl-approval.js';

let database;
try {
  const args = process.argv.slice(2);
  const mode = args[0] ?? '--preview';
  const mutation = ['--ingest', '--index', '--approve'].includes(mode);
  if (
    (!mutation && (mode !== '--preview' || args.length > 1)) ||
    (mutation && (args[1] !== '--actor' || !args[2] || args.length !== (mode === '--approve' ? 5 : 3))) ||
    (mode === '--approve' && args[3] !== '--sha256')
  )
    throw new IngestionError('INVALID_ARGUMENTS');
  const sources = (await loadLocalManifest()).filter(isPdplSource);
  if (sources.length !== 1) throw new IngestionError('PDPL_SOURCE_REQUIRED');
  const source = sources[0];
  database = createDatabaseClient();
  if (mode === '--preview') {
    const prepared = await prepareSource(source);
    console.info(
      JSON.stringify({
        ...(await previewIndex(database, source, embeddingConfig())),
        mode: 'PREVIEW',
        sha256: prepared.contentSha256,
        pages: prepared.ingestionMetadata.pageCount,
        legalSource: prepared.ingestionMetadata.legalSource,
        sections: [...new Set(prepared.chunks.map((c) => c.metadata.section).filter(Boolean))],
      }),
    );
  } else if (mode === '--ingest') console.info(JSON.stringify(await ingestSource(database, source, args[2])));
  else if (mode === '--index') {
    const config = embeddingConfig();
    console.info(
      JSON.stringify(
        await indexSource(database, source, args[2], { config, provider: createEmbeddingAdapter(config) }),
      ),
    );
  } else console.info(JSON.stringify(await approvePdpl(database, source, args[2], args[4])));
} catch (error) {
  console.error(
    JSON.stringify({
      event: 'pdpl_corpus',
      status: 'FAILED',
      code: error instanceof IngestionError || error instanceof EmbeddingError ? error.code : 'PDPL_OPERATION_FAILED',
    }),
  );
  process.exitCode = 1;
} finally {
  await database?.$disconnect();
}
