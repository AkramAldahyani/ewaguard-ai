import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl } from '../src/config/env.js';
import { DISCLAIMER_DEFINITION } from '../../shared/disclaimer.js';
import { createToolService } from '../src/ai/tools/tool-service.js';
import { CONFIRMATION_CONTRACT } from '../src/ai/tools/tool-confirmation.js';

test('tool authorization with real local PostgreSQL and synthetic data ($0)', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/ewaguard_ai');
  t.mock.method(globalThis, 'fetch', () => assert.fail('Registry cannot make provider requests'));
  const database = createDatabaseClient();
  const users = [];
  t.after(async () => {
    for (const delegate of ['emailAnalysis', 'urlAnalysis', 'fileAnalysis'])
      await database[delegate].deleteMany({ where: { userId: { in: users } } });
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    await database.$disconnect();
  });
  async function user(role = 'EMPLOYEE') {
    const value = await database.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        firstName: 'Synthetic',
        lastName: 'Tools',
        status: 'ACTIVE',
        passwordHash: 'non-login-test-fixture',
        role: { connect: { name: role } },
      },
    });
    users.push(value.id);
    return value;
  }
  const employee = await user();
  const other = await user();
  const admin = await user('IT_SECURITY_ADMIN');
  const session = await database.chatSession.create({
    data: { ownerId: employee.id, expiresAt: new Date(Date.now() + 3600000) },
  });
  const service = createToolService({ database });
  const auth = (u = employee) => ({ userId: u.id, expiresAt: new Date(Date.now() + 60000).toISOString() });
  const request = (name, args, overrides = {}) => ({
    auth: auth(),
    conversationId: session.id,
    name,
    argumentsJson: JSON.stringify(args),
    ...overrides,
  });
  const records = {};
  const acknowledgements = {};
  for (const analyzerType of ['EMAIL', 'URL', 'FILE']) {
    const ack = await database.disclaimerAcknowledgement.create({
      data: { userId: employee.id, context: `${analyzerType}_ANALYSIS`, version: DISCLAIMER_DEFINITION.version },
    });
    acknowledgements[analyzerType] = ack;
    const risk = {
      analyzerType,
      score: 25,
      riskLevel: 'MEDIUM',
      version: '1.0',
      confidence: 'LIMITED_CONFIDENCE',
      reasonCodes: ['INSUFFICIENT_EVIDENCE'],
    };
    records[analyzerType] = await database[`${analyzerType.toLowerCase()}Analysis`].create({
      data: {
        userId: employee.id,
        acknowledgementId: ack.id,
        status: 'COMPLETED',
        analyzedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        riskScore: 25,
        severity: 'MEDIUM',
        riskRuleVersion: '1.0',
        evidence: { risk },
        ...(analyzerType === 'URL' ? { hostname: 'example.invalid', urlSha256: 'a'.repeat(64) } : {}),
        ...(analyzerType === 'FILE'
          ? { sha256: 'b'.repeat(64), sizeBytes: 10n, extension: '.txt', detectedMime: 'text/plain' }
          : {}),
      },
    });
  }
  const ref = (type = 'EMAIL') => ({ analyzerType: type, analysisId: records[type].id });
  await t.test('read-only tools retrieve own completed results and stored risk for all analyzers', async () => {
    for (const type of ['EMAIL', 'URL', 'FILE'])
      for (const tool of ['get_analysis_result', 'explain_risk', 'get_security_recommendations']) {
        const value = await service.execute(request(tool, ref(type)));
        assert.equal(value.data.analysisId, records[type].id);
        assert.equal(value.data.risk.score, 25);
        if (tool === 'explain_risk') assert.equal(value.data.assistance, undefined);
        else assert.ok(value.data.assistance.immediateActions.length);
      }
    assert.equal(
      (await service.execute(request('get_file_analysis', { analysisId: records.FILE.id }))).data.analyzerType,
      'FILE',
    );
  });
  await t.test('missing, expired and nonexistent authentication denied', async () => {
    for (const value of [
      null,
      {},
      { userId: employee.id, expiresAt: 'invalid' },
      { userId: employee.id, expiresAt: new Date(0).toISOString() },
      auth({ id: randomUUID() }),
    ]) {
      await assert.rejects(service.execute(request('get_analysis_result', ref(), { auth: value })), {
        code: 'TOOL_AUTHENTICATION_REQUIRED',
      });
    }
  });
  await t.test('current database role/status wins over role claims and old sessions', async () => {
    await assert.rejects(
      service.execute(request('get_analysis_result', ref(), { auth: { ...auth(admin), role: 'EMPLOYEE' } })),
      { code: 'TOOL_FORBIDDEN' },
    );
    for (const status of ['INVITED', 'SUSPENDED', 'DEACTIVATED']) {
      await database.user.update({ where: { id: employee.id }, data: { status } });
      await assert.rejects(service.execute(request('get_analysis_result', ref())), {
        code: 'TOOL_AUTHENTICATION_REQUIRED',
      });
    }
    await database.user.update({ where: { id: employee.id }, data: { status: 'ACTIVE' } });
    await database.user.update({ where: { id: employee.id }, data: { deactivatedAt: new Date() } });
    await assert.rejects(service.execute(request('get_analysis_result', ref())), {
      code: 'TOOL_AUTHENTICATION_REQUIRED',
    });
    await database.user.update({
      where: { id: employee.id },
      data: { deactivatedAt: null, role: { connect: { name: 'IT_SECURITY_ADMIN' } } },
    });
    await assert.rejects(service.execute(request('get_analysis_result', ref())), { code: 'TOOL_FORBIDDEN' });
    await database.user.update({ where: { id: employee.id }, data: { role: { connect: { name: 'EMPLOYEE' } } } });
  });
  await t.test('closed and expired owned conversations deny both reads and action preparation', async () => {
    for (const data of [{ closedAt: new Date() }, { expiresAt: new Date(0) }]) {
      const unavailable = await database.chatSession.create({
        data: { ownerId: employee.id, expiresAt: new Date(Date.now() + 60000), ...data },
      });
      const context = { conversationId: unavailable.id };
      await assert.rejects(service.execute(request('get_analysis_result', ref(), context)), { code: 'TOOL_NOT_FOUND' });
      await assert.rejects(
        service.prepareActionContract(request('analyze_url', { url: 'https://example.com/' }, context)),
        { code: 'TOOL_NOT_FOUND' },
      );
    }
  });
  await t.test('foreign conversations and all cross-employee analysis types denied', async () => {
    await assert.rejects(service.execute(request('get_analysis_result', ref(), { auth: auth(other) })), {
      code: 'TOOL_NOT_FOUND',
    });
    const otherSession = await database.chatSession.create({
      data: { ownerId: other.id, expiresAt: new Date(Date.now() + 60000) },
    });
    for (const type of ['EMAIL', 'URL', 'FILE'])
      await assert.rejects(
        service.execute(
          request('get_analysis_result', ref(type), { auth: auth(other), conversationId: otherSession.id }),
        ),
        { code: 'TOOL_NOT_FOUND' },
      );
    await assert.rejects(
      service.execute(
        request(
          'get_file_analysis',
          { analysisId: records.FILE.id },
          { auth: auth(other), conversationId: otherSession.id },
        ),
      ),
      { code: 'TOOL_NOT_FOUND' },
    );
  });
  await t.test('unknown tools, injected identities, risk and file paths cannot invoke operations', async () => {
    for (const name of ['execute_sql', 'create_security_incident', 'analyze_file', 'reset_password'])
      await assert.rejects(service.execute(request(name, {})), { code: 'TOOL_UNKNOWN' });
    for (const args of [
      { ...ref(), userId: other.id },
      { ...ref(), riskScore: 100 },
      { ...ref(), role: 'IT_SECURITY_ADMIN' },
    ])
      await assert.rejects(service.execute(request('get_analysis_result', args)), { code: 'TOOL_INVALID_ARGUMENTS' });
    for (const args of [
      { path: 'C:\\Windows\\secret' },
      { analysisId: '/etc/passwd' },
      { analysisId: records.FILE.id, filePath: 'secret' },
    ])
      await assert.rejects(service.execute(request('get_file_analysis', args)), { code: 'TOOL_INVALID_ARGUMENTS' });
  });
  await t.test('expired, incomplete and missing risk results fail closed', async () => {
    await database.emailAnalysis.update({ where: { id: records.EMAIL.id }, data: { expiresAt: new Date(0) } });
    await assert.rejects(service.execute(request('get_analysis_result', ref())), { code: 'TOOL_NOT_FOUND' });
    await database.emailAnalysis.update({
      where: { id: records.EMAIL.id },
      data: { expiresAt: new Date(Date.now() + 60000), status: 'ERROR' },
    });
    await assert.rejects(service.execute(request('get_analysis_result', ref())), { code: 'TOOL_NOT_FOUND' });
    await database.emailAnalysis.update({
      where: { id: records.EMAIL.id },
      data: { status: 'COMPLETED', evidence: {} },
    });
    await assert.rejects(service.execute(request('get_analysis_result', ref())), { code: 'TOOL_RESULT_UNAVAILABLE' });
    await database.emailAnalysis.update({
      where: { id: records.EMAIL.id },
      data: { evidence: records.EMAIL.evidence },
    });
  });
  await t.test('missing/expired/future/obsolete acknowledgements block protected proposals', async () => {
    const otherSession = await database.chatSession.create({
      data: { ownerId: other.id, expiresAt: new Date(Date.now() + 60000) },
    });
    const context = { auth: auth(other), conversationId: otherSession.id };
    for (const [type, name, args] of [
      ['EMAIL', 'analyze_email', { body: 'Suspicious invitation.', headers: '' }],
      ['URL', 'analyze_url', { url: 'https://example.com/' }],
    ]) {
      await assert.rejects(service.prepareActionContract(request(name, args, context)), {
        code: 'TOOL_ACKNOWLEDGEMENT_REQUIRED',
      });
      for (const update of [
        { createdAt: new Date(Date.now() - 16 * 60000) },
        { createdAt: new Date(Date.now() + 60000) },
        { createdAt: new Date(), version: 'obsolete' },
      ]) {
        const ack = await database.disclaimerAcknowledgement.create({
          data: { userId: other.id, context: `${type}_ANALYSIS`, version: DISCLAIMER_DEFINITION.version, ...update },
        });
        await assert.rejects(service.prepareActionContract(request(name, args, context)), {
          code: 'TOOL_ACKNOWLEDGEMENT_REQUIRED',
        });
        await database.disclaimerAcknowledgement.delete({ where: { id: ack.id } });
      }
    }
  });
  await t.test('pending contract binds exact operation; no model confirmation or execution', async () => {
    const parameters = { body: 'Synthetic unexpected message.', headers: '' };
    const proposal = await service.prepareActionContract(request('analyze_email', parameters));
    assert.equal(proposal.serverDraft.userId, employee.id);
    assert.equal(proposal.serverDraft.conversationId, session.id);
    assert.deepEqual(proposal.serverDraft.parameters, parameters);
    assert.equal(proposal.serverDraft.state, 'PENDING');
    assert.equal(proposal.serverDraft.acknowledgementId, acknowledgements.EMAIL.id);
    assert.equal(Date.parse(proposal.serverDraft.expiresAt) - Date.parse(proposal.serverDraft.createdAt), 300000);
    assert.equal(proposal.publicRequest.executionEnabled, false);
    assert.equal(JSON.stringify(proposal.publicRequest).includes(parameters.body), false);
    assert.throws(() => {
      proposal.serverDraft.state = 'CONFIRMED';
    }, TypeError);
    assert.throws(() => {
      proposal.serverDraft.parameters.body = 'changed';
    }, TypeError);
    assert.equal(CONFIRMATION_CONTRACT.executionEnabled, false);
    await assert.rejects(service.execute(request('analyze_email', parameters)), { code: 'TOOL_EXECUTION_DEFERRED' });
    await assert.rejects(service.execute(request('analyze_url', { url: 'https://example.com/' })), {
      code: 'TOOL_EXECUTION_DEFERRED',
    });
    await assert.rejects(service.prepareActionContract(request('analyze_email', { ...parameters, confirmed: true })), {
      code: 'TOOL_INVALID_ARGUMENTS',
    });
  });
  await t.test('an acknowledgement for a different submission context cannot authorize an action', async () => {
    const otherSession = await database.chatSession.create({
      data: { ownerId: other.id, expiresAt: new Date(Date.now() + 60000) },
    });
    const ack = await database.disclaimerAcknowledgement.create({
      data: { userId: other.id, context: 'FILE_ANALYSIS', version: DISCLAIMER_DEFINITION.version },
    });
    const context = { auth: auth(other), conversationId: otherSession.id };
    await assert.rejects(
      service.prepareActionContract(request('analyze_email', { body: 'Synthetic invitation.', headers: '' }, context)),
      { code: 'TOOL_ACKNOWLEDGEMENT_REQUIRED' },
    );
    await assert.rejects(
      service.prepareActionContract(request('analyze_url', { url: 'https://example.com/' }, context)),
      { code: 'TOOL_ACKNOWLEDGEMENT_REQUIRED' },
    );
    await database.disclaimerAcknowledgement.delete({ where: { id: ack.id } });
  });
  await t.test('foundation creates no incidents, new analyses or usage entries', async () => {
    assert.equal(await database.incident.count({ where: { reporterId: { in: users } } }), 0);
    assert.equal(await database.aiUsage.count({ where: { userId: { in: users } } }), 0);
    for (const delegate of ['emailAnalysis', 'urlAnalysis', 'fileAnalysis'])
      assert.equal(await database[delegate].count({ where: { userId: { in: users } } }), 1);
  });
});
