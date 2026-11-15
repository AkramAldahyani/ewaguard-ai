import { createDatabaseClient } from '../src/config/database.js';
import { retentionPolicy } from '../src/privacy/retention-policy.js';
import { runRetentionBatch } from '../src/privacy/retention-service.js';

let database;
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !['--preview', '--apply'].includes(args[0])))
    throw new Error('Invalid arguments');
  const policy = retentionPolicy();
  database = createDatabaseClient();
  const result = await runRetentionBatch(database, { policy, apply: args[0] === '--apply' });
  console.info(JSON.stringify({ event: 'retention_cleanup', ...result }));
  if (['FAILED', 'DISABLED'].includes(result.status)) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ event: 'retention_cleanup', status: 'FAILED' }));
  process.exitCode = 1;
} finally {
  await database?.$disconnect();
}
