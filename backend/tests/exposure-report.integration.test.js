import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { createIncidentFromAnalysis } from '../src/incidents/incident-engine.js';
import { createIncidentManagement } from '../src/incidents/incident-management.js';
import { createToolService } from '../src/ai/tools/tool-service.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';
import { cleanupTestIncidents } from './incident-cleanup.js';

// BUG-001: an employee's explicit "I entered my credentials" confirmation escalates deterministically to CRITICAL.
test('employee-confirmed credential exposure: create, upgrade, reopen, idempotency and authorization', async (t) => {
  const dbUrl = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname));
  const database = createDatabaseClient();
  const users = [];
  const servers = [];
  const config = parseConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-exposure-secret-at-least-32-characters',
    FRONTEND_URL: 'http://127.0.0.1:5173',
    TOOL_APPROVAL_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  });
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => server.close(resolve));
    const incidents = (
      await database.incident.findMany({ where: { reporterId: { in: users } }, select: { id: true } })
    ).map((row) => row.id);
    await database.chatSession.deleteMany({ where: { ownerId: { in: users } } });
    await cleanupTestIncidents(database, users);
    await database.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: users } }, { resourceId: { in: incidents } }] },
    });
    for (const delegate of ['emailAnalysis', 'urlAnalysis', 'fileAnalysis'])
      await database[delegate].deleteMany({ where: { userId: { in: users } } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    await database.$disconnect();
  });
  async function person(role = 'EMPLOYEE') {
    const user = await database.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        employeeIdentifier: `UM-${randomUUID()}`,
        firstName: 'Synthetic',
        lastName: 'Exposure',
        status: 'ACTIVE',
        passwordHash: 'synthetic-not-a-login-hash',
        role: { connect: { name: role } },
        ...(role === 'IT_SECURITY_ADMIN'
          ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n }
          : {}),
      },
    });
    users.push(user.id);
    const acks = {};
    for (const type of ['EMAIL', 'URL', 'FILE'])
      acks[type] = await database.disclaimerAcknowledgement.create({
        data: {
          userId: user.id,
          context: `${type}_ANALYSIS`,
          version: DISCLAIMER_DEFINITION.version,
        },
      });
    return { ...user, acks };
  }
  const owner = await person();
  const other = await person();
  const admin = await person('IT_SECURITY_ADMIN');
  async function analysis(level, type = 'EMAIL') {
    const score = { LOW: 10, MEDIUM: 30, HIGH: 60, CRITICAL: 90 }[level];
    return database[`${type.toLowerCase()}Analysis`].create({
      data: {
        userId: owner.id,
        acknowledgementId: owner.acks[type].id,
        status: 'COMPLETED',
        analyzedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        severity: level,
        riskScore: score,
        riskRuleVersion: '1.1',
        evidence: {
          body: 'RAW_BODY_SENTINEL',
          risk: {
            analyzerType: type,
            riskLevel: level,
            score,
            version: '1.1',
            confidence: 'MODERATE_CONFIDENCE',
            reasonCodes: ['INSUFFICIENT_EVIDENCE'],
            evidenceCoverage: { availableSources: [], unavailableSources: [], conflicting: false },
          },
        },
        ...(type === 'URL' ? { hostname: 'example.invalid', urlSha256: 'a'.repeat(64) } : {}),
        ...(type === 'FILE'
          ? { sha256: 'b'.repeat(64), sizeBytes: 10n, extension: 'txt', detectedMime: 'text/plain' }
          : {}),
      },
    });
  }
  const server = createApp(config, { database }).listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const confirm = { exposure: 'CREDENTIALS_SUBMITTED', confirmed: true };
  const report = async (type, id, body = confirm, user = owner, origin = config.frontendUrl) => {
    const response = await fetch(`${base}/api/analysis-escalations/${type}/${id}/exposure`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(user
          ? { Cookie: `${authCookie(config).name}=${issueAccessToken(user.id, config, user.mfaEnabledAt)}` }
          : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const incidentFor = (type, id) =>
    database.incident.findUniqueOrThrow({
      where: { sourceKey: `${type}:${id}` },
      include: {
        evidence: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
  const management = createIncidentManagement(database);

  await t.test('LOW or MEDIUM analysis without an incident creates a CRITICAL credential incident', async () => {
    for (const [level, type] of [
      ['LOW', 'EMAIL'],
      ['MEDIUM', 'URL'],
    ]) {
      const row = await analysis(level, type);
      const response = await report(type, row.id);
      assert.equal(response.status, 200, JSON.stringify(response.data));
      const receipt = response.data.incident;
      assert.equal(receipt.created, true);
      assert.equal(receipt.severity, 'CRITICAL');
      assert.equal(receipt.urgent, true);
      assert.equal(receipt.exposureRecorded, true);
      assert.equal(receipt.assistance.riskLevel, 'CRITICAL');
      assert.equal(receipt.assistance.credentialGuidance.applicability, 'REPORTED_CONTEXT');
      const incident = await incidentFor(type, row.id);
      assert.equal(incident.type, 'CREDENTIAL_COMPROMISE');
      assert.equal(incident.riskScore, 75);
      assert.equal(incident.reporterId, owner.id);
      assert.equal(incident.evidence.length, 1);
      assert.equal(incident.events.length, 1);
      assert.equal(incident.events[0].details.source, 'EMPLOYEE_CONFIRMATION');
      assert.equal(incident.events[0].actorId, owner.id);
      assert.equal(incident.evidence[0].snapshot.originalRisk.riskLevel, level);
      assert.ok(incident.evidence[0].snapshot.risk.reasonCodes.includes('CONFIRMED_CREDENTIAL_SUBMISSION'));
      assert.doesNotMatch(JSON.stringify(incident), /RAW_BODY_SENTINEL/);
      const detail = await management.detail(owner, false, incident.id);
      assert.equal(detail.incident.assessment.risk.status, 'AVAILABLE');
      assert.equal(detail.incident.assessment.risk.severity, 'CRITICAL');
      assert.equal(detail.incident.assessment.guidance.status, 'AVAILABLE');
      assert.equal(detail.incident.assessment.reportedExposure.type, 'CREDENTIALS_SUBMITTED');
      const alerts = await database.notification.findMany({
        where: { incidentId: incident.id, recipientId: admin.id },
      });
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].kind, 'INCIDENT_CREATED');
      assert.equal(alerts[0].type, 'INCIDENT_ALERT');
    }
  });

  await t.test(
    'existing HIGH incident is upgraded once; repeats are idempotent and the history is consistent',
    async () => {
      const row = await analysis('HIGH');
      const created = await createIncidentFromAnalysis(database, {
        analyzerType: 'EMAIL',
        analysisId: row.id,
        userId: owner.id,
      });
      assert.equal(created.severity, 'HIGH');
      const [first, ...repeats] = await Promise.all(Array.from({ length: 5 }, () => report('EMAIL', row.id)));
      const all = [first, ...repeats];
      assert.ok(
        all.every(
          (r) =>
            r.status === 200 &&
            r.data.incident.reference === created.reference &&
            r.data.incident.severity === 'CRITICAL',
        ),
      );
      assert.equal(all.filter((r) => r.data.incident.exposureRecorded).length, 1);
      const incident = await incidentFor('EMAIL', row.id);
      assert.equal(incident.severity, 'CRITICAL');
      assert.equal(incident.riskScore, 75);
      assert.equal(incident.type, 'CREDENTIAL_COMPROMISE');
      assert.equal(incident.escalationMetadata.urgent, true);
      assert.equal(incident.evidence.length, 1);
      assert.equal(incident.evidence[0].snapshot.risk.score, incident.riskScore);
      assert.deepEqual(
        incident.events.map((e) => e.type),
        ['CREATED', 'SEVERITY_CHANGED'],
      );
      assert.deepEqual(
        [incident.events[1].details.fromSeverity, incident.events[1].details.toSeverity],
        ['HIGH', 'CRITICAL'],
      );
      assert.equal(
        await database.auditLog.count({ where: { resourceId: incident.id, action: 'INCIDENT_EXPOSURE_REPORTED' } }),
        1,
      );
      const alerts = await database.notification.findMany({
        where: { incidentId: incident.id, recipientId: admin.id },
        orderBy: { createdAt: 'asc' },
      });
      assert.deepEqual(
        alerts.map((a) => [a.kind, a.type, a.severity]),
        [
          ['INCIDENT_CREATED', 'INCIDENT_ALERT', 'HIGH'],
          ['EXPOSURE_REPORTED', 'INCIDENT_ALERT', 'CRITICAL'],
        ],
      );
      assert.equal(await database.notification.count({ where: { incidentId: incident.id, recipientId: owner.id } }), 0);
      const detail = await management.detail(owner, false, incident.id);
      assert.equal(detail.incident.severity, 'CRITICAL');
      assert.equal(detail.incident.assessment.risk.status, 'AVAILABLE');
      assert.equal(detail.incident.assessment.guidance.assistance.riskLevel, 'CRITICAL');
      const history = await management.history(owner, false, incident.id, {});
      assert.deepEqual(history.items.find((item) => item.type === 'SEVERITY_CHANGED').details, {
        fromSeverity: 'HIGH',
        toSeverity: 'CRITICAL',
      });
    },
  );

  await t.test('a resolved incident returns to investigation when exposure is reported afterwards', async () => {
    const row = await analysis('HIGH', 'URL');
    await createIncidentFromAnalysis(database, { analyzerType: 'URL', analysisId: row.id, userId: owner.id });
    const before = await incidentFor('URL', row.id);
    await database.incident.update({ where: { id: before.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
    assert.equal((await report('URL', row.id)).status, 200);
    const after = await incidentFor('URL', row.id);
    assert.equal(after.status, 'UNDER_INVESTIGATION');
    assert.equal(after.resolvedAt, null);
    assert.deepEqual(after.events.map((e) => e.type).sort(), ['CREATED', 'SEVERITY_CHANGED', 'STATUS_CHANGED']);
  });

  await t.test('BUG-013 the assistant tool result reports the linked incident, or that none exists', async () => {
    const session = await database.chatSession.create({
      data: { ownerId: owner.id, expiresAt: new Date(Date.now() + 3600000) },
    });
    const tools = createToolService({ database });
    const call = (id, user = owner) =>
      tools.execute({
        auth: { userId: user.id, expiresAt: new Date(Date.now() + 60000).toISOString() },
        conversationId: session.id,
        name: 'get_analysis_result',
        argumentsJson: JSON.stringify({ analyzerType: 'EMAIL', analysisId: id }),
      });
    const quiet = await analysis('MEDIUM');
    assert.deepEqual((await call(quiet.id)).data.incident, { recorded: false });
    const high = await analysis('HIGH');
    const created = await createIncidentFromAnalysis(database, {
      analyzerType: 'EMAIL',
      analysisId: high.id,
      userId: owner.id,
    });
    const linked = (await call(high.id)).data.incident;
    assert.deepEqual(linked, {
      recorded: true,
      reference: created.reference,
      severity: 'HIGH',
      status: 'NEW',
      securityTeamAlerted: true,
      credentialExposureReported: false,
    });
    await report('EMAIL', high.id);
    const after = await call(high.id);
    assert.equal(after.data.risk.riskLevel, 'HIGH', 'analysis risk is unchanged');
    assert.equal(after.data.incident.severity, 'CRITICAL');
    assert.equal(after.data.incident.credentialExposureReported, true);
    assert.deepEqual(Object.keys(after.data.incident).sort(), [
      'credentialExposureReported',
      'recorded',
      'reference',
      'securityTeamAlerted',
      'severity',
      'status',
    ]);
    assert.doesNotMatch(JSON.stringify(after), /RAW_BODY_SENTINEL|assignee|Credential exposure reported after/);
  });

  await t.test('authorization, ownership, source type and exact confirmation body are enforced', async () => {
    const row = await analysis('MEDIUM');
    assert.equal((await report('EMAIL', row.id, confirm, other)).status, 404);
    assert.equal((await report('EMAIL', row.id, confirm, null)).status, 401);
    assert.equal((await report('EMAIL', row.id, confirm, admin)).status, 403);
    assert.equal((await report('EMAIL', row.id, confirm, owner, 'https://evil.invalid')).status, 403);
    for (const body of [
      {},
      { exposure: 'CREDENTIALS_SUBMITTED' },
      { exposure: 'CREDENTIALS_SUBMITTED', confirmed: 'true' },
      { exposure: 'OTHER', confirmed: true },
      { ...confirm, severity: 'LOW' },
      { ...confirm, userId: other.id },
      [confirm],
    ]) {
      assert.equal((await report('EMAIL', row.id, body)).status, 400, JSON.stringify(body));
    }
    const file = await analysis('LOW', 'FILE');
    assert.equal((await report('FILE', file.id)).data.error.code, 'INVALID_INCIDENT_SOURCE');
    assert.equal((await report('EMAIL', randomUUID())).status, 404);
    assert.equal(
      await database.incident.count({ where: { sourceKey: `EMAIL:${row.id}` } }),
      0,
      'rejected requests create nothing',
    );
  });
});
