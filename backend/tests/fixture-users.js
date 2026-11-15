import { databaseUrl } from '../src/config/env.js';

// Disposable accounts created by user-management.integration.test.js. Both markers are required:
// `.invalid` is a reserved TLD that can never be a real mailbox, and the employee identifier is the
// test's own `UM-<uuid>` pattern. Display names are never used to identify accounts.
export const FIXTURE_EMAIL_SUFFIX = '@example.invalid';
export const FIXTURE_IDENTIFIER = /^UM-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isFixtureUser = (user) =>
  typeof user?.email === 'string' &&
  user.email.toLowerCase().endsWith(FIXTURE_EMAIL_SUFFIX) &&
  FIXTURE_IDENTIFIER.test(user.employeeIdentifier ?? '');

export function assertLocalDatabase(env = process.env) {
  const url = new URL(databaseUrl(env));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || env.NODE_ENV === 'production')
    throw new Error('Test-fixture cleanup only runs against a local, non-production database.');
}

export async function findFixtureUsers(database, { createdBefore } = {}) {
  const rows = await database.user.findMany({
    where: {
      email: { endsWith: FIXTURE_EMAIL_SUFFIX, mode: 'insensitive' },
      employeeIdentifier: { startsWith: 'UM-', mode: 'insensitive' },
      ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}),
    },
    select: {
      id: true,
      email: true,
      employeeIdentifier: true,
      firstName: true,
      lastName: true,
      status: true,
      createdAt: true,
      role: { select: { name: true } },
    },
  });
  return rows.filter(isFixtureUser);
}

// Every foreign key that references users.id, read from the live schema so new relations are never missed.
async function userReferences(database, ids) {
  const keys = await database.$queryRaw`
    SELECT kcu.table_name AS "table", kcu.column_name AS "column" FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.unique_constraint_schema
    WHERE ccu.table_name = 'users' AND ccu.column_name = 'id' AND kcu.table_schema = current_schema()`;
  const found = [];
  for (const { table, column } of keys) {
    if (!/^[a-z_]+$/.test(table) || !/^[A-Za-z_]+$/.test(column)) continue;
    const [{ total }] = await database.$queryRawUnsafe(
      `SELECT count(*)::int AS total FROM "${table}" WHERE "${column}"::text = ANY($1::text[])`,
      ids,
    );
    if (total) found.push({ table, column, total });
  }
  return found;
}

// Removes fixture accounts and the only dependents that may safely go with them: untouched training
// assignments (no quiz attempts, no certificate) that an administrator later gave these accounts.
// Anything else (incidents, analyses, chats, community posts...) is reported and the account is kept.
// Existing audit records are preserved; one FIXTURE_ACCOUNT_REMOVED entry records each leftover removal
// (a test's own teardown passes audit: false for accounts it created moments earlier).
export async function purgeFixtureUsers(database, users, { apply = false, audit = true } = {}) {
  assertLocalDatabase();
  const candidates = users.filter(isFixtureUser);
  const report = { removed: [], kept: [] };
  for (const user of candidates) {
    const assignments = await database.trainingAssignment.findMany({
      where: { employeeId: user.id },
      select: {
        id: true,
        trainingId: true,
        attempts: { select: { id: true } },
        progress: { select: { id: true, certificate: { select: { id: true } } } },
      },
    });
    const disposable = assignments.filter((row) => !row.attempts.length && !row.progress?.certificate);
    const blocking = (await userReferences(database, [user.id]))
      .map((ref) =>
        ref.table === 'training_assignments' && ref.column === 'employeeId'
          ? { ...ref, total: ref.total - disposable.length }
          : ref,
      )
      .filter((ref) => ref.total > 0 && !(ref.table === 'audit_logs' && ref.column === 'actorId'));
    const entry = {
      id: user.id,
      role: user.role?.name,
      createdAt: user.createdAt,
      trainingAssignments: disposable.length,
    };
    if (blocking.length) {
      report.kept.push({ ...entry, blocking });
      continue;
    }
    report.removed.push(entry);
    if (!apply) continue;
    await database.$transaction(async (tx) => {
      const assignmentIds = disposable.map((row) => row.id);
      await tx.trainingProgress.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
      await tx.trainingAssignment.deleteMany({ where: { id: { in: assignmentIds } } });
      await tx.user.delete({ where: { id: user.id } });
      if (audit)
        await tx.auditLog.create({
          data: {
            action: 'FIXTURE_ACCOUNT_REMOVED',
            resourceType: 'USER',
            resourceId: user.id,
            outcome: 'SUCCESS',
            metadata: {
              reason: 'Leftover automated-test fixture account',
              trainingAssignmentsRemoved: assignmentIds.length,
            },
            retentionUntil: new Date(Date.now() + 90 * 86_400_000),
          },
        });
    });
  }
  return report;
}
