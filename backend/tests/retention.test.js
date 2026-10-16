import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retentionPolicy, retentionCategories, retentionExpiry, DAY_MS } from '../src/privacy/retention-policy.js';
import { runRetentionBatch, startRetentionWorker } from '../src/privacy/retention-service.js';

const policy = retentionPolicy({ RETENTION_ENABLED: 'true', RETENTION_BATCH_SIZE: '2' });
const now = new Date('2026-10-15T00:00:00Z');
function database({ busy = false, fail = false, auditFail = false } = {}) {
  const state = { rows: ['one', 'two', 'three'], audits: [], queries: [] };
  const tx = { $executeRaw: async () => {}, $queryRaw: async () => [{ acquired: !busy }],
    auditLog: { create: async (args) => { if (auditFail) throw new Error('SECRET_DATABASE_URL'); state.audits.push(args.data); } } };
  for (const { model } of retentionCategories(now)) tx[model] = {
    findMany: async (args) => { state.queries.push(args); return model === 'revokedSession' ? state.rows.slice(0, args.take).map((id) => ({ id })) : []; },
    deleteMany: async ({ where }) => {
      if (fail) throw new Error('SECRET_DATABASE_URL');
      const ids = where.AND[1].id.in;
      state.rows = state.rows.filter((id) => !ids.includes(id)); return { count: ids.length };
    },
  };
  return { state, $transaction: async (operation) => {
    const previous = structuredClone(state);
    try { return await operation(tx); }
    catch (error) { Object.assign(state, previous); throw error; }
  } };
}
test('retention config defaults disabled, rejects malformed values without echoing secrets', () => {
  assert.equal(retentionPolicy({}).enabled, false);
  assert.equal(retentionPolicy({}).emailDays, 30);
  for (const env of [{ RETENTION_ENABLED: '1' }, { RETENTION_BATCH_SIZE: '501' }, { RETENTION_EMAIL_DAYS: '-1' },
    { RETENTION_FILE_DAYS: 'SECRET_DATABASE_URL' }]) {
    assert.throws(() => retentionPolicy(env), (error) => !error.message.includes('SECRET_DATABASE_URL'));
  }
  assert.equal(retentionExpiry('chat', now).getTime(), now.getTime() + 30 * DAY_MS);
  assert.throws(() => retentionExpiry('training', now));
});
test('preview is bounded, contains counts only and makes no data or audit changes', async () => {
  const db = database(); const result = await runRetentionBatch(db, { policy, now });
  assert.equal(result.mode, 'PREVIEW'); assert.equal(result.status, 'COMPLETED');
  assert.equal(result.categories.at(-1).eligibleInBatch, 2);
  assert.equal(result.categories.at(-1).batchFull, true);
  assert.equal(db.state.rows.length, 3); assert.equal(db.state.audits.length, 0);
  assert.equal(JSON.stringify(result).includes('one'), false);
  for (const query of db.state.queries) { assert.equal(query.take, 2); assert.deepEqual(query.select, { id: true }); }
});
test('disabled or paused apply never opens a database transaction', async () => {
  const db = { $transaction: () => assert.fail('must not access database') };
  for (const config of [retentionPolicy({}), { ...policy, paused: true }]) {
    assert.equal((await runRetentionBatch(db, { apply: true, policy: config })).status, 'DISABLED');
  }
});
test('bounded apply is retryable and records minimal system audit, preserving excluded categories', async () => {
  const db = database();
  for (const expected of [2, 1, 0]) {
    const result = await runRetentionBatch(db, { apply: true, policy, now });
    assert.equal(result.status, 'COMPLETED'); assert.equal(result.categories.at(-1).affected, expected);
  }
  assert.equal(db.state.audits.length, 3);
  const audit = db.state.audits[0];
  assert.equal(audit.actorId, null); assert.equal(audit.metadata.system, 'RETENTION_WORKER');
  assert.equal(audit.action, 'RETENTION_CLEANUP'); assert.equal(audit.outcome, 'SUCCESS');
  assert.equal(audit.retentionUntil.getTime(), now.getTime() + 90 * DAY_MS);
  assert.deepEqual(retentionCategories(now).map((entry) => entry.model),
    ['toolApproval', 'chatSession', 'emailAnalysis', 'urlAnalysis', 'fileAnalysis', 'notification', 'revokedSession']);
});
test('mutation or audit failure rolls back the batch and never returns secrets or false success', async () => {
  for (const options of [{ fail: true }, { auditFail: true }]) {
    const db = database(options); const result = await runRetentionBatch(db, { apply: true, policy, now });
    assert.equal(result.status, 'FAILED'); assert.deepEqual(result.categories, []);
    assert.equal(db.state.rows.length, 3); assert.equal(db.state.audits.length, 0);
    assert.equal(JSON.stringify(result).includes('SECRET_DATABASE_URL'), false);
  }
});
test('competing database worker skips without changes', async () => {
  const db = database({ busy: true }); const result = await runRetentionBatch(db, { apply: true, policy });
  assert.equal(result.status, 'BUSY'); assert.equal(db.state.queries.length, 0);
});
test('worker does not run at startup, overlap, log exceptions, or run after shutdown', async () => {
  let tick; let release; let calls = 0; const logs = [];
  const stop = startRetentionWorker({}, policy, { schedule: (fn) => { tick = fn; return 1; }, cancel: () => {},
    run: async () => { calls++; await new Promise((resolve) => { release = resolve; }); throw new Error('SECRET_PASSWORD'); },
    log: (value) => logs.push(value) });
  assert.equal(calls, 0); tick(); tick(); await Promise.resolve(); assert.equal(calls, 1);
  const stopped = stop(); release(); await stopped; tick(); assert.equal(calls, 1);
  assert.deepEqual(logs, [{ event: 'retention_cleanup', status: 'FAILED' }]);
});
