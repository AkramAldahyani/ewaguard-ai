import { createDatabaseClient } from '../src/config/database.js';
import { loadLocalManifest, prepareSource } from '../src/rag/local-sources.js';
import { ingestSource, requireIngestionAdministrator } from '../src/rag/ingestion-service.js';
import { IngestionError } from '../src/rag/ingestion-policy.js';

let database;
try {
  const args = process.argv.slice(2);
  const apply = args[0] === '--apply';
  if (!(
    args.length === 0 ||
    (args.length === 1 && args[0] === '--preview') ||
    (args.length === 3 && apply && args[1] === '--actor')
  ))
    throw new IngestionError('INVALID_ARGUMENTS');
  const sources = await loadLocalManifest();
  if (apply) {
    database = createDatabaseClient();
    await requireIngestionAdministrator(database, args[2]);
  }
  for (const source of sources) {
    if (apply) console.info(JSON.stringify(await ingestSource(database, source, args[2])));
    else {
      const prepared = await prepareSource(source);
      console.info(
        JSON.stringify({
          status: 'PREVIEW',
          documentKey: source.documentKey,
          filename: source.filename,
          kind: source.kind,
          version: source.version,
          classification: source.classification,
          chunks: prepared.chunks.length,
          pages: prepared.ingestionMetadata.pageCount,
          warnings: prepared.ingestionMetadata.warnings,
        }),
      );
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      event: 'knowledge_ingestion',
      status: 'FAILED',
      code: error instanceof IngestionError ? error.code : 'INGESTION_FAILED',
    }),
  );
  process.exitCode = 1;
} finally {
  await database?.$disconnect();
}
