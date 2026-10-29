import { createDatabaseClient } from '../src/config/database.js';
import { loadLocalManifest } from '../src/rag/local-sources.js';
import { requireIngestionAdministrator } from '../src/rag/ingestion-service.js';
import { IngestionError } from '../src/rag/ingestion-policy.js';
import { embeddingConfig, EMBEDDING_LIMITS, EmbeddingError } from '../src/rag/embedding-policy.js';
import { createEmbeddingAdapter } from '../src/rag/openai-embeddings.js';
import { indexSource, previewIndex } from '../src/rag/indexing-service.js';

let database;
try {
  const args = process.argv.slice(2); const flags = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--preview', '--apply', '--actor', '--document', '--force'].includes(key) || flags.has(key)) throw new EmbeddingError('INVALID_ARGUMENTS');
    if (['--actor', '--document'].includes(key)) {
      const value = args[++i]; if (!value || value.startsWith('--')) throw new EmbeddingError('INVALID_ARGUMENTS');
      flags.set(key, value);
    } else flags.set(key, true);
  }
  const apply = flags.has('--apply');
  if ((apply && flags.has('--preview')) || (apply !== flags.has('--actor')) || (flags.has('--force') && !apply))
    throw new EmbeddingError('INVALID_ARGUMENTS');
  const config = embeddingConfig();
  let sources = await loadLocalManifest();
  if (flags.has('--document')) sources = sources.filter(source => source.documentKey === flags.get('--document'));
  if (!sources.length) throw new EmbeddingError('DOCUMENT_NOT_IN_MANIFEST');
  database = createDatabaseClient();
  if (apply) await requireIngestionAdministrator(database, flags.get('--actor'));
  let inputBytes = 0;
  for (const source of sources) {
    const preview = await previewIndex(database, source, config); inputBytes += preview.inputBytes;
    if (inputBytes > EMBEDDING_LIMITS.maxRunBytes) throw new EmbeddingError('RUN_BUDGET_EXCEEDED');
    if (apply && preview.status === 'NOT_INGESTED') throw new EmbeddingError('DOCUMENT_NOT_INGESTED');
    if (!apply) console.info(JSON.stringify({ ...preview, mode: 'PREVIEW' }));
  }
  if (apply) {
    const provider = createEmbeddingAdapter(config);
    for (const source of sources) console.info(JSON.stringify(await indexSource(database, source, flags.get('--actor'), {
      config, provider, force: flags.has('--force'),
    })));
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'knowledge_indexing', status: 'FAILED',
    code: error instanceof EmbeddingError || error instanceof IngestionError ? error.code : 'INDEXING_FAILED' }));
  process.exitCode = 1;
} finally { await database?.$disconnect(); }
