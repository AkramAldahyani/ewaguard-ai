import { randomUUID } from 'node:crypto';
import { DAY_MS, RETENTION_VERSION, retentionCategories, retentionPolicy } from './retention-policy.js';

// No HTTP endpoint. The caller is a trusted operator or the opt-in system worker.
// One bounded transaction: audit failure or any category failure rolls back all
// changes. Serialization failures are retried on the next scheduled/operator run.
export async function runRetentionBatch(
  database,
  { apply = false, policy = retentionPolicy(), now = new Date(), categories: requestedCategories, ownerId } = {},
) {
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isInteger(policy.batchSize) ||
    policy.batchSize < 1 ||
    policy.batchSize > 500
  )
    throw new Error('Invalid retention options');
  if (requestedCategories && !Array.isArray(requestedCategories)) throw new Error('Invalid retention categories');
  const selected = retentionCategories(now).filter(
    (entry) => !requestedCategories || requestedCategories.includes(entry.name),
  );
  if (
    requestedCategories &&
    (!Array.isArray(requestedCategories) ||
      !requestedCategories.length ||
      requestedCategories.some((name) => !selected.some((entry) => entry.name === name)))
  )
    throw new Error('Invalid retention categories');
  if (ownerId && !/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error('Invalid retention owner');
  const runId = randomUUID();
  const base = { runId, policyVersion: RETENTION_VERSION, mode: apply ? 'APPLY' : 'PREVIEW' };
  if (apply && (!policy.enabled || policy.paused)) return { ...base, status: 'DISABLED', categories: [] };
  try {
    return await database.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
        await tx.$executeRaw`SET LOCAL lock_timeout = '1000ms'`;
        const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(808515::bigint) AS acquired`;
        if (!lock.acquired) return { ...base, status: 'BUSY', categories: [] };
        // Coordinate with existing chat and approval mutations, without changing
        // their admission, billing, or execution rules.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(808001::bigint)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(808201::bigint)`;
        const categories = [];
        for (const category of selected) {
          // Optional operator/test narrowing can never broaden eligibility.
          if (ownerId) {
            if (category.model === 'revokedSession') continue;
            const ownerField =
              category.model === 'chatSession'
                ? 'ownerId'
                : category.model === 'notification'
                  ? 'recipientId'
                  : 'userId';
            category.where = { ...category.where, [ownerField]: ownerId };
          }
          const delegate = tx[category.model];
          const rows = await delegate.findMany({
            where: category.where,
            select: { id: true },
            orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
            take: policy.batchSize,
          });
          let affected = 0;
          if (apply && rows.length) {
            const where = { AND: [category.where, { id: { in: rows.map((row) => row.id) } }] };
            const result = category.data
              ? await delegate.updateMany({ where, data: category.data })
              : await delegate.deleteMany({ where });
            affected = result.count;
          }
          categories.push({
            category: category.name,
            eligibleInBatch: rows.length,
            affected,
            batchFull: rows.length === policy.batchSize,
          });
        }
        if (apply)
          await tx.auditLog.create({
            data: {
              actorId: null,
              action: 'RETENTION_CLEANUP',
              resourceType: 'RETENTION_RUN',
              resourceId: runId,
              correlationId: runId,
              outcome: 'SUCCESS',
              metadata: { system: 'RETENTION_WORKER', policyVersion: RETENTION_VERSION, categories },
              retentionUntil: new Date(now.getTime() + policy.auditReviewDays * DAY_MS),
            },
          });
        return { ...base, status: 'COMPLETED', categories };
      },
      { isolationLevel: 'Serializable', maxWait: 2000, timeout: 15000 },
    );
  } catch {
    // Never expose SQL, connection strings, payloads, or exception text. Failure
    // cannot be durably audited if the database is down; the CLI/worker logs it.
    return { ...base, status: 'FAILED', categories: [] };
  }
}

export function startRetentionWorker(
  database,
  policy,
  {
    run = runRetentionBatch,
    log = (value) => console.info(JSON.stringify(value)),
    schedule = setInterval,
    cancel = clearInterval,
  } = {},
) {
  let pending = null;
  let stopped = false;
  if (!policy.enabled || policy.paused) return async () => {};
  const tick = () => {
    if (stopped || pending) return;
    pending = Promise.resolve()
      .then(() => run(database, { apply: true, policy }))
      .then((result) => log({ event: 'retention_cleanup', ...result }))
      .catch(() => log({ event: 'retention_cleanup', status: 'FAILED' }))
      .finally(() => {
        pending = null;
      });
  };
  // No startup purge. Operators can preview before the first timed run.
  const timer = schedule(tick, policy.intervalMinutes * 60_000);
  timer.unref?.();
  return async () => {
    stopped = true;
    cancel(timer);
    await pending;
  };
}
