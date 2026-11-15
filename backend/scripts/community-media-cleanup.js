import { parseConfig } from '../src/config/env.js';
import { createDatabaseClient } from '../src/config/database.js';
import { createCommunityMedia } from '../src/community/media-service.js';
import { cleanupCommunityMedia } from '../src/community/media-retention.js';

const config = parseConfig();
const database = createDatabaseClient();
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => !['--apply', '--preview'].includes(arg)))
    throw new Error('Invalid arguments');
  const apply = args.includes('--apply');
  if (apply && (!config.retention.enabled || config.retention.paused)) throw new Error('Retention disabled');
  console.info(
    JSON.stringify(await cleanupCommunityMedia(database, createCommunityMedia({ database, config }), { apply })),
  );
} catch {
  console.error('Community media cleanup failed or is disabled. No internal details are exposed.');
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
