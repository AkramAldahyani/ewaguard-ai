import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl } from '../src/config/env.js';
import { retentionPolicy } from '../src/privacy/retention-policy.js';
import { runRetentionBatch } from '../src/privacy/retention-service.js';

test('retention PostgreSQL eligibility, holds, dependencies and rollback (synthetic records only)', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  const database = createDatabaseClient();
  const rollback = new Error('ROLL_BACK_SYNTHETIC_FIXTURES');
  try {
    await database.$transaction(
      async (tx) => {
        const now = new Date();
        const past = new Date(now.getTime() - 1000);
        const future = new Date(now.getTime() + 86400000);
        const user = await tx.user.create({
          data: {
            email: `${randomUUID()}@example.invalid`,
            firstName: 'Retention',
            lastName: 'Fixture',
            role: { connect: { name: 'EMPLOYEE' } },
          },
        });
        const policy = retentionPolicy({ RETENTION_ENABLED: 'true', RETENTION_BATCH_SIZE: '100' });
        const acks = {};
        for (const context of [
          'EMAIL_ANALYSIS',
          'URL_ANALYSIS',
          'FILE_ANALYSIS',
          'COMMUNITY_POST',
          'COMMUNITY_ATTACHMENT',
        ]) {
          acks[context] = await tx.disclaimerAcknowledgement.create({
            data: { userId: user.id, context, version: 'retention-test' },
          });
        }
        // The runner is narrowed to this newly created owner. Revocation rows have
        // no owner and are excluded. All fixtures and audit records roll back.
        const store = {
          $transaction: async (operation) => {
            await tx.$executeRaw`SAVEPOINT retention_test_batch`;
            try {
              return await operation(tx);
            } catch (error) {
              await tx.$executeRaw`ROLLBACK TO SAVEPOINT retention_test_batch`;
              throw error;
            }
          },
        };
        const run = (apply = false) => runRetentionBatch(store, { apply, policy, now, ownerId: user.id });
        const email = (changes = {}) =>
          tx.emailAnalysis.create({
            data: {
              userId: user.id,
              acknowledgementId: acks.EMAIL_ANALYSIS.id,
              expiresAt: past,
              analyzedAt: past,
              status: 'COMPLETED',
              severity: 'LOW',
              riskScore: 0,
              riskRuleVersion: '1.0',
              ...changes,
            },
          });
        const removable = await email();
        const unexpired = await email({ expiresAt: future });
        const high = await email({ severity: 'HIGH', riskScore: 80 });
        const pending = await email({
          status: 'PENDING',
          analyzedAt: null,
          severity: null,
          riskScore: null,
          riskRuleVersion: null,
        });
        const linked = await email();
        const incident = await tx.incident.create({
          data: {
            reporterId: user.id,
            title: 'Synthetic retention test',
            description: 'Synthetic',
            severity: 'HIGH',
            riskScore: 80,
            riskRuleVersion: '1.0',
            type: 'PHISHING',
            detectionSource: 'EMAIL_ANALYSIS',
            status: 'CLOSED',
            legalHold: false,
            retentionUntil: past,
            evidence: { create: { emailAnalysisId: linked.id, summary: 'Synthetic', snapshot: {} } },
          },
        });
        const chat = await tx.chatSession.create({
          data: {
            ownerId: user.id,
            expiresAt: past,
            messages: { create: { role: 'USER', content: 'SYNTHETIC_PRIVATE_MESSAGE', sequence: 0, expiresAt: past } },
          },
        });
        const executingChat = await tx.chatSession.create({ data: { ownerId: user.id, expiresAt: past } });
        await tx.toolApproval.create({
          data: {
            userId: user.id,
            conversationId: executingChat.id,
            acknowledgementId: acks.EMAIL_ANALYSIS.id,
            requestId: randomUUID(),
            toolName: 'analyze_email',
            parameterDigest: 'a'.repeat(64),
            status: 'EXECUTING',
            createdAt: new Date(past.getTime() - 300000),
            expiresAt: past,
            decidedAt: past,
          },
        });
        const urlRow = await tx.urlAnalysis.create({
          data: {
            userId: user.id,
            acknowledgementId: acks.URL_ANALYSIS.id,
            hostname: 'example.invalid',
            urlSha256: 'b'.repeat(64),
            expiresAt: past,
            analyzedAt: past,
            status: 'COMPLETED',
            severity: 'MEDIUM',
            riskScore: 30,
            riskRuleVersion: '1.0',
          },
        });
        const file = (changes = {}) =>
          tx.fileAnalysis.create({
            data: {
              userId: user.id,
              acknowledgementId: acks.FILE_ANALYSIS.id,
              sha256: 'c'.repeat(64),
              sizeBytes: 5n,
              extension: 'txt',
              detectedMime: 'text/plain',
              deletedAt: past,
              expiresAt: past,
              analyzedAt: past,
              status: 'COMPLETED',
              severity: 'LOW',
              riskScore: 0,
              riskRuleVersion: '1.0',
              ...changes,
            },
          });
        const fileRow = await file();
        const retainedFile = await file({ storageKey: `synthetic-${randomUUID()}`, deletedAt: null });
        const attachment = await file();
        await tx.communityPost.create({
          data: {
            authorId: user.id,
            acknowledgementId: acks.COMMUNITY_POST.id,
            title: 'Synthetic',
            body: 'Synthetic',
            category: 'SECURITY_TIP',
            attachments: {
              create: {
                fileAnalysisId: attachment.id,
                acknowledgementId: acks.COMMUNITY_ATTACHMENT.id,
              },
            },
          },
        });
        const notification = await tx.notification.create({
          data: {
            recipientId: user.id,
            incidentId: incident.id,
            type: 'INCIDENT_UPDATE',
            title: 'Synthetic',
            message: 'Synthetic',
            expiresAt: past,
          },
        });

        await t.test('preview selects expired eligible rows, excluding source and community dependencies', async () => {
          const preview = await run();
          assert.equal(preview.status, 'COMPLETED');
          for (const name of ['chats', 'emails', 'urls', 'files', 'notifications']) {
            assert.equal(preview.categories.find((c) => c.category === name).eligibleInBatch, 1, name);
          }
          assert.ok(await tx.emailAnalysis.findUnique({ where: { id: removable.id } }));
          assert.equal(await tx.auditLog.count({ where: { resourceId: preview.runId } }), 0);
          assert.equal(JSON.stringify(preview).includes('SYNTHETIC_PRIVATE_MESSAGE'), false);
        });
        await t.test('active, resolved but not closed, and legal-held investigations protect records', async () => {
          for (const changes of [
            { status: 'UNDER_INVESTIGATION' },
            { status: 'RESOLVED' },
            { status: 'CLOSED', legalHold: true },
          ]) {
            await tx.incident.update({ where: { id: incident.id }, data: changes });
            const preview = await run();
            assert.equal(preview.status, 'COMPLETED');
            assert.ok(preview.categories.every((c) => c.eligibleInBatch === 0));
          }
          await tx.incident.update({ where: { id: incident.id }, data: { status: 'CLOSED', legalHold: false } });
        });
        await t.test(
          'apply removes only eligible fixtures, cascades private messages, writes audit and is idempotent',
          async () => {
            const result = await run(true);
            assert.equal(result.status, 'COMPLETED');
            for (const [model, row] of [
              ['emailAnalysis', removable],
              ['urlAnalysis', urlRow],
              ['fileAnalysis', fileRow],
              ['chatSession', chat],
              ['notification', notification],
            ])
              assert.equal(await tx[model].findUnique({ where: { id: row.id } }), null);
            assert.equal(await tx.chatMessage.count({ where: { sessionId: chat.id } }), 0);
            for (const row of [unexpired, high, pending, linked])
              assert.ok(await tx.emailAnalysis.findUnique({ where: { id: row.id } }));
            for (const row of [retainedFile, attachment])
              assert.ok(await tx.fileAnalysis.findUnique({ where: { id: row.id } }));
            assert.ok(await tx.chatSession.findUnique({ where: { id: executingChat.id } }));
            assert.equal(await tx.disclaimerAcknowledgement.count({ where: { userId: user.id } }), 5);
            const audit = await tx.auditLog.findFirst({ where: { resourceId: result.runId } });
            assert.equal(audit.action, 'RETENTION_CLEANUP');
            assert.equal(audit.actorId, null);
            assert.equal(JSON.stringify(audit).includes('SYNTHETIC_PRIVATE_MESSAGE'), false);
            const again = await run(true);
            assert.equal(again.status, 'COMPLETED');
            assert.ok(again.categories.every((c) => c.affected === 0));
          },
        );
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await database.$disconnect();
  }
});
