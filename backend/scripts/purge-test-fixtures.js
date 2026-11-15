// Removes leftover user-management test fixture accounts from the LOCAL development database.
// Usage: npm run fixtures:purge            (preview only, the default)
//        npm run fixtures:purge -- --apply (delete the accounts listed in the preview)
import { createDatabaseClient } from '../src/config/database.js';
import { assertLocalDatabase, findFixtureUsers, purgeFixtureUsers } from '../tests/fixture-users.js';

let database;
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !['--preview', '--apply'].includes(args[0])))
    throw new Error('Use --preview (default) or --apply.');
  assertLocalDatabase();
  database = createDatabaseClient();
  const apply = args[0] === '--apply';
  const report = await purgeFixtureUsers(database, await findFixtureUsers(database), { apply });
  console.info(JSON.stringify({ event: 'test_fixture_purge', mode: apply ? 'APPLY' : 'PREVIEW', ...report }, null, 2));
  if (report.kept.length) process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ event: 'test_fixture_purge', status: 'FAILED', message: error.message }));
  process.exitCode = 1;
} finally {
  await database?.$disconnect();
}
