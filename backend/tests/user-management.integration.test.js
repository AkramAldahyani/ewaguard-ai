import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { databaseUrl, parseConfig } from '../src/config/env.js';
import { hashPassword } from '../src/auth/auth-service.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { attachRealtime } from '../src/notifications/realtime.js';
import { io } from 'socket.io-client';
import { findFixtureUsers, purgeFixtureUsers } from './fixture-users.js';

async function fixture(t, demoEnabled = true) {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Integration fixtures must use the local development database.');
  assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(), ids = [], incidents = [], sockets = [];
  // A run interrupted before teardown (killed process, timeout) leaves its accounts behind; sweep any older
  // than 30 minutes so they never accumulate in local application data. Recent ones may belong to a live run.
  await purgeFixtureUsers(db, await findFixtureUsers(db, { createdBefore: new Date(Date.now() - 30 * 60_000) }), { apply: true });
  const config = parseConfig({ NODE_ENV: 'test', DEMO_ACCOUNT_SETUP_ENABLED: String(demoEnabled), JWT_SECRET: 'user-management-test-secret-with-sufficient-length', FRONTEND_URL: 'http://127.0.0.1:5173', LOGIN_RATE_LIMIT_MAX: '100' });
  const app = createApp(config, { database: db }), server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const realtime = attachRealtime(server, { database: db, config, pollIntervalMs: 100 });
  app.locals.realtime = realtime;
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    // Each step runs even if an earlier one fails, so fixture accounts are always removed.
    const failures = [];
    const step = async (work) => { try { await work(); } catch (error) { failures.push(error); } };
    for (const socket of sockets) socket.disconnect();
    await step(() => realtime.close());
    await step(() => new Promise((resolve) => server.close(resolve)));
    await step(() => db.incident.deleteMany({ where: { id: { in: incidents } } }));
    await step(() => db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { resourceType: 'USER', resourceId: { in: ids } }] } }));
    await step(() => db.user.deleteMany({ where: { id: { in: ids } } }));
    // Removes accounts still referenced by records created outside this test (e.g. a course assigned to all employees).
    await step(async () => {
      const remaining = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, employeeIdentifier: true } });
      const report = await purgeFixtureUsers(db, remaining, { apply: true, audit: false });
      if (report.kept.length) throw new Error(`Fixture accounts could not be removed: ${JSON.stringify(report.kept)}`);
    });
    await db.$disconnect();
    if (failures.length) throw new AggregateError(failures, 'User-management fixture teardown failed.');
  });
  const password = `Fixture-password-${randomUUID()}!`;
  const passwordHash = await hashPassword(password);
  const department = await db.department.findFirstOrThrow({ select: { id: true } });
  async function account(role = 'EMPLOYEE', extra = {}) {
    const row = await db.user.create({ data: { firstName: 'Lifecycle', lastName: 'Fixture', email: `${randomUUID()}@example.invalid`,
      employeeIdentifier: `UM-${randomUUID()}`, status: 'ACTIVE', department: { connect: { id: department.id } }, passwordHash,
      role: { connect: { name: role } }, ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}), ...extra } });
    ids.push(row.id); return row;
  }
  const admin = await account('IT_SECURITY_ADMIN'), employee = await account();
  const cookie = (actor) => `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt, actor.sessionVersion)}`;
  async function request(path, { actor = admin, method = 'GET', body, auth, origin = config.frontendUrl, contentType = 'application/json' } = {}) {
    const response = await fetch(`${base}${path}`, { method, headers: { Origin: origin,
      ...(auth ? { Cookie: auth } : actor ? { Cookie: cookie(actor) } : {}), ...(body !== undefined ? { 'Content-Type': contentType } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) : null, headers: response.headers };
  }
  const current = async (id) => (await db.user.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
  const write = async (id, operation, body, options = {}) => request(`/api/admin/users/${id}/${operation}`, {
    method: 'POST', body: { expectedUpdatedAt: await current(id), ...body }, ...options,
  });
  const input = () => ({ firstName: 'New', lastName: 'Employee', email: `${randomUUID()}@example.invalid`, employeeIdentifier: `UM-${randomUUID()}`, departmentId: department.id });
  async function create(body = input(), options = {}) {
    const result = await request('/api/admin/users', { method: 'POST', body, ...options });
    if (result.status === 201) ids.push(result.data.user.id);
    return result;
  }
  return { db, config, base, ids, incidents, sockets, admin, employee, password, department, account, cookie, request, current, write, input, create };
}

test('user lifecycle: real database provisioning, search, sessions, updates, retention and audit', async (t) => {
  const f = await fixture(t), { db, request, write, employee, admin, create } = f;
  let created, setupToken, employeeCookie;
  await t.test('administrator lists real directory and totals; all account projections omit credentials', async () => {
    const response = await request('/api/admin/users');
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(response.data.total >= 2); assert.equal(response.data.pageSize, 20);
    assert.doesNotMatch(JSON.stringify(response.data), /passwordHash|mfaSecret|setupTokenHash|sessionVersion|mfaChallenge/);
    const summary = await request('/api/admin/users/summary');
    assert.equal(summary.data.total, await db.user.count({ where: { deletedAt: null } }));
    assert.equal(summary.data.administrators, await db.user.count({ where: { deletedAt: null, role: { name: 'IT_SECURITY_ADMIN' } } }));
    assert.ok((await request('/api/admin/users/options')).data.departments.some((row) => row.id === f.department.id));
  });
  await t.test('create employee uses invited state and one-time token; no password or automatic admin grant', async () => {
    const result = await create({ ...f.input(), firstName: 'Alexandra', lastName: 'Directory', status: 'ACTIVE' });
    assert.equal(result.status, 201); created = result.data.user; setupToken = result.data.setup.token;
    assert.equal(created.status, 'INVITED'); assert.equal(created.role.name, 'EMPLOYEE');
    assert.match(setupToken, /^[A-Za-z0-9_-]{43}$/);
    const stored = await db.user.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(stored.passwordHash, null); assert.notEqual(stored.setupTokenHash, setupToken);
    assert.ok(stored.setupTokenExpiresAt > new Date());
    assert.equal((await create({ ...f.input(), role: 'IT_SECURITY_ADMIN' })).status, 403);
  });
  assert.ok(created, 'Provisioning must succeed before dependent lifecycle checks.');
  await t.test('duplicate identities are case-insensitively rejected; database enforces uniqueness', async () => {
    assert.equal((await create({ ...f.input(), email: created.email.toUpperCase() })).data.error.code, 'USER_EMAIL_EXISTS');
    assert.equal((await create({ ...f.input(), employeeIdentifier: created.employeeIdentifier.toLowerCase() })).data.error.code, 'USER_EMPLOYEE_ID_EXISTS');
    await assert.rejects(db.user.create({ data: { firstName: 'Duplicate', lastName: 'Fixture', email: created.email, roleId: employee.roleId } }), { code: 'P2002' });
  });
  await t.test('search includes full/partial names, email, internal UUID and employee identifier', async () => {
    for (const search of ['alexandra directory', 'alexan', created.email.toUpperCase(), created.id.toUpperCase(), created.employeeIdentifier.toLowerCase()]) {
      const result = await request(`/api/admin/users?search=${encodeURIComponent(search)}`);
      assert.equal(result.status, 200); assert.ok(result.data.items.some((row) => row.id === created.id), search);
    }
    const filter = `search=Lifecycle&role=EMPLOYEE&status=ACTIVE&departmentId=${f.department.id}&pageSize=1`;
    const page = await request(`/api/admin/users?${filter}`);
    assert.equal(page.data.items.length, 1); assert.equal(page.data.items[0].role.name, 'EMPLOYEE');
    const end = await request(`/api/admin/users?${filter}&page=100000`);
    assert.equal(end.data.items.length, 0); assert.equal(end.data.hasMore, false);
    const second = await f.account();
    const pageOne = await request(`/api/admin/users?${filter}`);
    const pageTwo = await request(`/api/admin/users?${filter}&page=2`);
    assert.equal(pageOne.data.hasMore, true); assert.notEqual(pageOne.data.items[0].id, pageTwo.data.items[0].id);
    assert.ok((await request(`/api/admin/users?search=${second.id}&role=EMPLOYEE&status=ACTIVE`)).data.total === 1);
    for (const sort of ['name', 'createdAt', 'lastLoginAt']) assert.equal((await request(`/api/admin/users?sort=${sort}&direction=desc`)).status, 200);
    assert.equal((await request(`/api/admin/users?search=${randomUUID()}`)).data.total, 0);
  });
  await t.test('setup is single-use even under simultaneous consumption and does not create a session', async () => {
    const body = { token: setupToken, password: f.password };
    const results = await Promise.all([1, 2].map(() => request('/api/auth/setup', { actor: null, method: 'POST', body })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    assert.ok(results.every((r) => !r.headers.has('set-cookie')));
    const row = await db.user.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(row.status, 'ACTIVE'); assert.equal(row.setupTokenHash, null); assert.equal(row.setupTokenExpiresAt, null);
    assert.notEqual(row.passwordHash, f.password);
    const login = await request('/api/auth/login', { actor: null, method: 'POST', body: { email: created.email, password: f.password } });
    assert.equal(login.status, 200); employeeCookie = login.headers.get('set-cookie').split(';')[0];
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: created.id } })).lastLoginAt);
  });
  await t.test('deactivation disconnects sockets, rejects login and permanently invalidates old tokens', async () => {
    const socket = io(f.base, { path: '/api/realtime', transports: ['websocket'], autoConnect: false, reconnection: false,
      extraHeaders: { Origin: f.config.frontendUrl, Cookie: employeeCookie } });
    f.sockets.push(socket);
    const connected = once(socket, 'connect', { signal: AbortSignal.timeout(5000) }); socket.connect(); await connected;
    const disconnected = once(socket, 'disconnect', { signal: AbortSignal.timeout(5000) });
    assert.equal((await write(created.id, 'status', { status: 'DEACTIVATED' })).status, 200);
    await disconnected; assert.equal(socket.connected, false);
    assert.equal((await request('/api/auth/me', { auth: employeeCookie })).status, 401);
    assert.equal((await request('/api/auth/login', { actor: null, method: 'POST', body: { email: created.email, password: f.password } })).status, 401);
    assert.equal((await write(created.id, 'status', { status: 'ACTIVE' })).status, 200);
    assert.equal((await request('/api/auth/me', { auth: employeeCookie })).status, 401, 'Reactivation must never revive a pre-deactivation token.');
    const login = await request('/api/auth/login', { actor: null, method: 'POST', body: { email: created.email, password: f.password } });
    assert.equal(login.status, 200); employeeCookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/api/auth/me', { auth: employeeCookie })).status, 200);
  });
  await t.test('edit validates identities and prevents stale overwrites and mass assignment', async () => {
    const previous = await f.current(created.id);
    const result = await write(created.id, 'update', { firstName: 'Updated', employeeIdentifier: 'UM-' + randomUUID() });
    assert.equal(result.status, 200); assert.equal(result.data.user.firstName, 'Updated'); created = result.data.user;
    assert.equal((await write(created.id, 'update', { expectedUpdatedAt: previous, lastName: 'Stale' })).data.error.code, 'USER_CONFLICT');
    assert.equal((await write(created.id, 'update', { role: 'IT_SECURITY_ADMIN' })).status, 400);
    assert.equal((await write(created.id, 'update', { id: admin.id })).status, 400);
    assert.equal((await write(created.id, 'update', { email: employee.email })).status, 409);
    assert.equal((await write(created.id, 'update', { departmentId: randomUUID() })).status, 400);
  });
  await t.test('profile aggregates real security and awareness records without exposing sensitive content', async () => {
    const now = new Date(), expiresAt = new Date(now.getTime() + 86400000);
    const tracked = { analyses: [], assignments: [], progresses: [], programs: [], monthlyAssignments: [], monthly: [], attempts: [], questions: [], quizzes: [] };
    const noMfaAdmin = await f.account('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
    try {
      const urlAnalysis = await db.urlAnalysis.create({ data: { userId: employee.id, hostname: 'private-hostname.invalid',
        urlSha256: 'a'.repeat(64), status: 'COMPLETED', evidence: { privateEvidence: 'PRIVATE_ANALYSIS_SENTINEL' },
        riskScore: 10, severity: 'LOW', riskRuleVersion: 'profile-test', analyzedAt: now, expiresAt } });
      const fileAnalysis = await db.fileAnalysis.create({ data: { userId: employee.id, sha256: 'b'.repeat(64), kind: 'HASH_LOOKUP',
        status: 'COMPLETED', evidence: { privateEvidence: 'PRIVATE_FILE_SENTINEL' }, riskScore: 80, severity: 'HIGH',
        riskRuleVersion: 'profile-test', analyzedAt: now, expiresAt } });
      tracked.analyses.push(urlAnalysis.id, fileAnalysis.id);
      const incident = await db.incident.create({ data: { reporterId: employee.id, title: 'Profile incident',
        description: 'PRIVATE_INCIDENT_DESCRIPTION', severity: 'HIGH', riskScore: 80, riskRuleVersion: 'profile-test',
        type: 'SUSPICIOUS_ACTIVITY', detectionSource: 'FILE_ANALYSIS' } });
      f.incidents.push(incident.id);
      const program = await db.trainingProgram.create({ data: { title: `Profile awareness ${randomUUID()}`,
        description: 'PRIVATE_TRAINING_CONTENT', topic: 'PHISHING', learningObjectives: ['Recognize threats'],
        content: { version: 1, sections: [{ key: 'one', title: 'One', body: 'PRIVATE_COURSE_BODY' }] }, status: 'PUBLISHED',
        requiresQuiz: false, createdById: admin.id, reviewedById: admin.id, reviewedAt: now, publishedAt: now } });
      tracked.programs.push(program.id);
      const assignment = await db.trainingAssignment.create({ data: { trainingId: program.id, employeeId: employee.id, assignedById: admin.id } });
      tracked.assignments.push(assignment.id);
      const progress = await db.trainingProgress.create({ data: { assignmentId: assignment.id, status: 'COMPLETED', progressPercent: 100,
        completedSectionKeys: ['one'], startedAt: now, lastActivityAt: now, materialCompletedAt: now, completedAt: now } });
      tracked.progresses.push(progress.id);
      await db.certificate.create({ data: { progressId: progress.id, employeeName: 'Lifecycle Fixture', trainingTitle: program.title, completedAt: now } });
      const quiz = await db.quiz.create({ data: { kind: 'MONTHLY', title: `Profile monthly ${randomUUID()}`,
        passingPercent: 80, createdById: admin.id } });
      tracked.quizzes.push(quiz.id);
      const question = await db.quizQuestion.create({ data: { quizId: quiz.id, text: 'Profile fixture question',
        type: 'TRUE_FALSE', topic: 'PHISHING', explanation: 'Profile fixture explanation', points: 1, position: 0,
        reviewedAt: now, reviewedById: admin.id,
        options: { create: [{ text: 'True', position: 0, isCorrect: true }, { text: 'False', position: 1, isCorrect: false }] } } });
      tracked.questions.push(question.id);
      await db.quiz.update({ where: { id: quiz.id }, data: { status: 'PUBLISHED', approvedById: admin.id, approvedAt: now, publishedAt: now } });
      const period = new Date(Date.UTC(2098, Math.floor(Math.random() * 11), 1));
      const monthly = await db.monthlyQuiz.create({ data: { quizId: quiz.id, period, opensAt: period,
        closesAt: new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1)) } });
      tracked.monthly.push(monthly.id);
      const monthlyAssignment = await db.monthlyQuizAssignment.create({ data: { monthlyQuizId: monthly.id, employeeId: employee.id, assignedById: admin.id } });
      tracked.monthlyAssignments.push(monthlyAssignment.id);
      const attempt = await db.quizAttempt.create({ data: { quizId: quiz.id, employeeId: employee.id, monthlyAssignmentId: monthlyAssignment.id,
        attemptNumber: 1, status: 'SUBMITTED', submittedAt: now, passingPercent: 80, earnedPoints: 1, possiblePoints: 1, scorePercent: 100, passed: true } });
      tracked.attempts.push(attempt.id);
      await db.auditLog.create({ data: { actorId: employee.id, action: 'LOGIN_SUCCEEDED', resourceType: 'AUTHENTICATION', resourceId: employee.id,
        outcome: 'SUCCESS', metadata: { system: false, privateMetadata: 'PRIVATE_AUDIT_SENTINEL' }, retentionUntil: expiresAt } });

      assert.equal((await request(`/api/admin/users/${employee.id}/profile`, { actor: null })).status, 401);
      assert.equal((await request(`/api/admin/users/${employee.id}/profile`, { actor: employee })).status, 403);
      assert.equal((await request(`/api/admin/users/${employee.id}/profile`, { actor: noMfaAdmin })).status, 401);
      assert.equal((await request('/api/admin/users/not-a-uuid/profile')).status, 400);
      assert.equal((await request(`/api/admin/users/${randomUUID()}/profile`)).status, 404);
      assert.equal((await request(`/api/admin/users/${employee.id}/profile?unexpected=1`)).status, 400);

      const response = await request(`/api/admin/users/${employee.id}/profile`);
      assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
      assert.deepEqual(response.data.profile.security.analyses, { total: 2, email: 0, url: 1, file: 1 });
      assert.equal(response.data.profile.security.incidents.total, 1);
      assert.equal(response.data.profile.security.incidents.recent[0].id, incident.id);
      assert.equal(response.data.profile.security.incidents.recent[0].reference.startsWith('INC-'), true);
      assert.deepEqual(response.data.profile.awareness.training, { assigned: 1, completed: 1, completionPercent: 100,
        recent: response.data.profile.awareness.training.recent });
      assert.equal(response.data.profile.awareness.training.recent[0].trainingId, program.id);
      assert.deepEqual(response.data.profile.awareness.monthlyQuizzes, { assigned: 1, participated: 1, participationPercent: 100 });
      assert.equal(response.data.profile.awareness.certificates.earned, 1);
      assert.equal(response.data.profile.accountSecurity.credentialStatus, 'CONFIGURED');
      assert.equal(response.data.profile.accountSecurity.mfaStatus, 'NOT_REQUIRED');
      assert.ok(response.data.profile.accountSecurity.events.some((event) => event.action === 'LOGIN_SUCCEEDED'));
      const serialized = JSON.stringify(response.data);
      for (const secret of ['passwordHash', 'mfaSecret', 'setupToken', 'PRIVATE_ANALYSIS_SENTINEL', 'PRIVATE_FILE_SENTINEL',
        'PRIVATE_INCIDENT_DESCRIPTION', 'PRIVATE_TRAINING_CONTENT', 'PRIVATE_COURSE_BODY', 'PRIVATE_AUDIT_SENTINEL', 'private-hostname.invalid', 'a'.repeat(64), 'b'.repeat(64)]) {
        assert.equal(serialized.includes(secret), false, secret);
      }
    } finally {
      await db.$transaction(async (tx) => {
        for (const [table, trigger] of [['quiz_attempts', 'submitted_history'], ['quiz_options', 'option_history'], ['quiz_questions', 'question_history']])
          await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
        await tx.quizAttempt.deleteMany({ where: { id: { in: tracked.attempts } } });
        await tx.monthlyQuizAssignment.deleteMany({ where: { id: { in: tracked.monthlyAssignments } } });
        await tx.monthlyQuiz.deleteMany({ where: { id: { in: tracked.monthly } } });
        await tx.quizOption.deleteMany({ where: { questionId: { in: tracked.questions } } });
        await tx.quizQuestion.deleteMany({ where: { id: { in: tracked.questions } } });
        await tx.quiz.deleteMany({ where: { id: { in: tracked.quizzes } } });
        await tx.certificate.deleteMany({ where: { progressId: { in: tracked.progresses } } });
        await tx.trainingProgress.deleteMany({ where: { id: { in: tracked.progresses } } });
        await tx.trainingAssignment.deleteMany({ where: { id: { in: tracked.assignments } } });
        await tx.trainingProgram.deleteMany({ where: { id: { in: tracked.programs } } });
        await tx.urlAnalysis.deleteMany({ where: { id: { in: tracked.analyses } } });
        await tx.fileAnalysis.deleteMany({ where: { id: { in: tracked.analyses } } });
        for (const [table, trigger] of [['quiz_attempts', 'submitted_history'], ['quiz_options', 'option_history'], ['quiz_questions', 'question_history']])
          await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
      }, { timeout: 20000 });
    }
  });
  await t.test('soft deletion preserves incident evidence and audit identity and cannot be reversed by activation', async () => {
    const incident = await db.incident.create({ data: { reporterId: created.id, title: 'Retained fixture', description: 'PRIVATE_DESCRIPTION', severity: 'LOW',
      riskScore: 0, riskRuleVersion: '1.0', type: 'SUSPICIOUS_ACTIVITY', detectionSource: 'EMAIL_ANALYSIS' } });
    f.incidents.push(incident.id);
    assert.equal((await write(created.id, 'delete', { confirmation: 'wrong' })).status, 400);
    assert.equal((await write(created.id, 'delete', { confirmation: created.employeeIdentifier })).status, 200);
    const row = await db.user.findUniqueOrThrow({ where: { id: created.id } });
    assert.ok(row.deletedAt); assert.equal(row.passwordHash, null); assert.equal(row.status, 'DEACTIVATED');
    assert.equal((await db.incident.findUniqueOrThrow({ where: { id: incident.id } })).reporterId, created.id);
    assert.equal((await request('/api/auth/me', { auth: employeeCookie })).status, 401);
    assert.equal((await write(created.id, 'status', { status: 'ACTIVE' })).status, 404);
    assert.equal((await request(`/api/admin/users?search=${created.id}`)).data.total, 0);
    assert.equal((await request(`/api/admin/users?search=${created.id}&status=DELETED`)).data.total, 1);
    const detail = await request(`/api/admin/users/${created.id}`);
    assert.equal(detail.status, 200); assert.doesNotMatch(JSON.stringify(detail.data), /PRIVATE_DESCRIPTION|password|mfaSecret/);
    assert.equal((await create({ ...f.input(), email: created.email })).status, 409);
    const audit = await db.auditLog.findMany({ where: { resourceType: 'USER', resourceId: created.id } });
    for (const action of ['USER_CREATED', 'USER_SETUP_ISSUED', 'USER_SETUP_COMPLETED', 'USER_UPDATED', 'USER_DEACTIVATED', 'USER_ACTIVATED', 'USER_DELETION_REQUESTED', 'USER_DELETED']) {
      assert.ok(audit.some((entry) => entry.action === action && entry.actorId && entry.outcome === 'SUCCESS'), action);
    }
    const serialized = JSON.stringify(audit);
    for (const secret of [f.password, setupToken, created.email, employeeCookie, 'PRIVATE_DESCRIPTION']) assert.equal(serialized.includes(secret), false);
  });
});

test('account mutations and public setup are rate limited with safe responses', async (t) => {
  const f = await fixture(t);
  for (let attempt = 0; attempt < 30; attempt++) assert.equal((await f.create({})).status, 400);
  const limited = await f.create({});
  assert.equal(limited.status, 429); assert.equal(limited.data.error.code, 'USER_WRITE_LIMIT');
  for (let attempt = 0; attempt < 20; attempt++) assert.equal((await f.request('/api/auth/setup', { actor: null, method: 'POST', body: {} })).status, 400);
  const setup = await f.request('/api/auth/setup', { actor: null, method: 'POST', body: {} });
  assert.equal(setup.status, 429); assert.equal(setup.data.error.code, 'SETUP_RATE_LIMIT');
});

test('user administration: authorization, privileged role changes and concurrent administrators', async (t) => {
  const f = await fixture(t), { request, write, employee, admin, db } = f;
  await t.test('anonymous, employee, missing MFA and untrusted origin cannot use the APIs', async () => {
    for (const path of ['/api/admin/users', '/api/admin/users/summary', '/api/admin/users/options', `/api/admin/users/${employee.id}`]) {
      assert.equal((await request(path, { actor: null })).status, 401);
      assert.equal((await request(path, { actor: employee })).status, 403);
      assert.equal((await request(path, { auth: `${authCookie(f.config).name}=${issueAccessToken(admin.id, f.config)}` })).status, 401);
    }
    assert.equal((await write(employee.id, 'status', { status: 'DEACTIVATED' }, { actor: employee })).status, 403);
    assert.equal((await write(employee.id, 'update', { firstName: 'Blocked' }, { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await f.create(f.input(), { actor: employee })).status, 403);
    assert.equal((await request('/api/auth/setup', { method: 'POST', origin: 'https://evil.invalid', body: {} })).status, 403);
  });
  await t.test('mutation requires recent MFA sign-in; malformed filters and bodies fail safely', async () => {
    const token = jwt.sign({ version: 0, mfa: admin.mfaEnabledAt.toISOString(), iat: Math.floor(Date.now() / 1000) - 360 }, f.config.jwtSecret,
      { algorithm: 'HS256', subject: admin.id, issuer: 'ewaguard-api', audience: 'ewaguard-web', jwtid: randomUUID(), expiresIn: 900 });
    assert.equal((await write(employee.id, 'update', { firstName: 'Blocked' }, { auth: `${authCookie(f.config).name}=${token}` })).data.error.code, 'USER_REAUTH_REQUIRED');
    for (const query of ['page=0', 'pageSize=101', 'role=OWNER', 'status=INVALID', 'search=a&search=b', 'sort=passwordHash', 'unknown=true']) assert.equal((await request(`/api/admin/users?${query}`)).status, 400);
    for (const body of [{}, { ...f.input(), employeeIdentifier: '../bad' }, { ...f.input(), email: 'invalid' }, { ...f.input(), passwordHash: 'bad' }]) assert.equal((await f.create(body)).status, 400);
  });
  await t.test('self role removal, disabling and deletion are blocked', async () => {
    for (const [operation, body] of [['role', { role: 'EMPLOYEE' }], ['status', { status: 'DEACTIVATED' }], ['delete', { confirmation: admin.employeeIdentifier }]]) {
      const result = await write(admin.id, operation, body);
      assert.equal(result.status, 409); assert.ok(['USER_SELF_PROTECTED', 'USER_LAST_ADMIN'].includes(result.data.error.code));
    }
  });
  await t.test('role promotion revokes employee tokens and requires real MFA enrollment', async () => {
    const oldCookie = f.cookie(employee);
    assert.equal((await write(employee.id, 'role', { role: 'IT_SECURITY_ADMIN' })).status, 200);
    assert.equal((await request('/api/auth/me', { auth: oldCookie })).status, 401);
    const promoted = await db.user.findUniqueOrThrow({ where: { id: employee.id } });
    assert.equal(promoted.mfaEnabledAt, null);
    assert.equal((await request('/api/admin/users', { auth: f.cookie(promoted) })).status, 401);
    assert.equal((await write(employee.id, 'role', { role: 'EMPLOYEE' })).status, 200);
    assert.ok(await db.auditLog.findFirst({ where: { resourceId: employee.id, action: 'USER_ROLE_CHANGED', actorId: admin.id } }));
  });
  await t.test('concurrent administrators cannot disable each other using stale authority', async () => {
    const other = await f.account('IT_SECURITY_ADMIN');
    const results = await Promise.all([
      write(other.id, 'status', { status: 'DEACTIVATED' }),
      write(admin.id, 'status', { status: 'DEACTIVATED' }, { actor: other }),
    ]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.ok(results.some((r) => [401, 403].includes(r.status)));
    const survivors = await db.user.count({ where: { id: { in: [admin.id, other.id] }, status: 'ACTIVE' } });
    assert.equal(survivors, 1);
  });
});

test('demo setup disclosure is disabled by default and prohibited in production', async (t) => {
  const env = { NODE_ENV: 'production', FRONTEND_URL: 'https://demo.example.invalid', JWT_SECRET: 'demo-config-fixture-secret-at-least-32-chars' };
  assert.equal(parseConfig(env).demoAccountSetupEnabled, false);
  assert.throws(() => parseConfig({ ...env, DEMO_ACCOUNT_SETUP_ENABLED: 'true' }), /prohibited in production/);
  assert.throws(() => parseConfig({ ...env, DEMO_ACCOUNT_SETUP_ENABLED: 'yes' }), /must be true or false/);
  const f = await fixture(t, false), created = await f.create();
  assert.equal(created.status, 201); assert.equal(created.data.setup, undefined);
  assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: created.data.user.id } })).setupTokenHash, null);
  assert.equal((await f.request('/api/admin/users/options')).data.manualSetupEnabled, false);
  assert.equal((await f.write(created.data.user.id, 'setup', {})).data.error.code, 'SETUP_DEMO_DISABLED');
});

test('demo issuance authorization, validation, confirmation and ineligible targets', async (t) => {
  const capturedLogs = [], originals = {};
  for (const method of ['log', 'warn', 'error', 'info']) { originals[method] = console[method]; console[method] = (...args) => capturedLogs.push(args.join(' ')); }
  t.after(() => { for (const method of Object.keys(originals)) console[method] = originals[method]; });
  const f = await fixture(t), created = await f.create(), id = created.data.user.id, token = created.data.setup.token;
  const validate = (value) => f.request('/api/auth/setup/validate', { actor: null, method: 'POST', body: { token: value } });
  const redeem = (value, extra = {}) => f.request('/api/auth/setup', { actor: null, method: 'POST', body: { token: value, password: f.password, confirmPassword: f.password, ...extra } });
  assert.equal((await f.request('/api/admin/users/options')).data.manualSetupEnabled, true);
  for (const options of [{ actor: null }, { actor: f.employee }, { auth: `${authCookie(f.config).name}=${issueAccessToken(f.admin.id, f.config)}` }]) {
    assert.ok([401, 403].includes((await f.write(id, 'setup', {}, options)).status));
  }
  const oldAuth = jwt.sign({ version: 0, mfa: f.admin.mfaEnabledAt.toISOString(), iat: Math.floor(Date.now() / 1000) - 360 }, f.config.jwtSecret,
    { algorithm: 'HS256', subject: f.admin.id, issuer: 'ewaguard-api', audience: 'ewaguard-web', jwtid: randomUUID(), expiresIn: 900 });
  assert.equal((await f.write(id, 'setup', {}, { auth: `${authCookie(f.config).name}=${oldAuth}` })).data.error.code, 'USER_REAUTH_REQUIRED');
  const validated = await validate(token);
  assert.deepEqual(validated.data, { valid: true }); assert.equal(validated.headers.get('cache-control'), 'no-store');
  assert.equal(validated.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await redeem(token, { password: 'short', confirmPassword: 'short' })).status, 400);
  assert.equal((await redeem(token, { password: 'passwordpassword', confirmPassword: 'passwordpassword' })).data.error.code, 'SETUP_PASSWORD_WEAK');
  assert.equal((await redeem(token, { confirmPassword: 'different-password' })).data.error.code, 'SETUP_PASSWORD_MISMATCH');
  assert.equal((await validate(token)).status, 200, 'Validation must not consume a token.');
  for (const path of ['/api/admin/users', `/api/admin/users/${id}`, `/api/admin/users/${id}/profile`]) {
    const value = JSON.stringify((await f.request(path)).data);
    assert.equal(value.includes(token), false); assert.doesNotMatch(value, /setupTokenHash|passwordHash/);
  }
  assert.equal((await redeem(token)).status, 200);
  assert.equal((await validate(token)).data.error.code, 'SETUP_INVALID');
  assert.equal((await redeem(token)).data.error.code, 'SETUP_INVALID');
  assert.equal((await f.write(id, 'setup', {})).status, 409);
  const login = await f.request('/api/auth/login', { actor: null, method: 'POST', body: { email: created.data.user.email, password: f.password } });
  assert.equal(login.status, 200);
  for (const operation of ['SUSPENDED', 'DEACTIVATED', 'DELETED']) {
    const target = await f.create(), targetId = target.data.user.id;
    if (operation === 'DELETED') await f.write(targetId, 'delete', { confirmation: target.data.user.employeeIdentifier });
    else await f.write(targetId, 'status', { status: operation });
    assert.equal((await validate(target.data.setup.token)).data.error.code, 'SETUP_INVALID');
    assert.equal((await redeem(target.data.setup.token)).data.error.code, 'SETUP_INVALID');
    assert.ok([404, 409].includes((await f.write(targetId, 'setup', {})).status));
  }
  const audits = JSON.stringify(await f.db.auditLog.findMany({ where: { resourceId: { in: f.ids } } }));
  assert.equal(audits.includes(token), false); assert.equal(audits.includes(f.password), false);
  assert.equal(capturedLogs.join(' ').includes(token), false); assert.equal(capturedLogs.join(' ').includes(f.password), false);
});

test('setup token renewal, expiration, inactive accounts and audit rollback', async (t) => {
  const f = await fixture(t), { db, request, write } = f;
  const first = await f.create(); assert.equal(first.status, 201);
  const id = first.data.user.id;
  await t.test('reissue invalidates earlier token and an expired token cannot be consumed', async () => {
    const replacement = await write(id, 'setup', {}); assert.equal(replacement.status, 200);
    assert.equal((await request('/api/auth/setup', { method: 'POST', body: { token: first.data.setup.token, password: f.password } })).status, 400);
    await db.user.update({ where: { id }, data: { setupTokenExpiresAt: new Date(Date.now() - 1) } });
    assert.equal((await request('/api/auth/setup', { method: 'POST', body: { token: replacement.data.setup.token, password: f.password } })).status, 400);
    assert.equal((await request('/api/auth/setup', { method: 'POST', body: { token: replacement.data.setup.token, password: 'short' } })).status, 400);
  });
  await t.test('deactivation and identity change invalidate outstanding setup tokens', async () => {
    const replacement = await write(id, 'setup', {});
    assert.equal((await write(id, 'status', { status: 'DEACTIVATED' })).status, 200);
    assert.equal((await request('/api/auth/setup', { method: 'POST', body: { token: replacement.data.setup.token, password: f.password } })).status, 400);
    const activated = await write(id, 'status', { status: 'ACTIVE' });
    assert.equal(activated.data.user.status, 'INVITED'); assert.equal(activated.data.setupRequired, true);
    const next = await write(id, 'setup', {});
    assert.equal((await write(id, 'update', { email: `${randomUUID()}@example.invalid` })).status, 200);
    assert.equal((await request('/api/auth/setup', { method: 'POST', body: { token: next.data.setup.token, password: f.password } })).status, 400);
    const inactive = await f.create({ ...f.input(), status: 'DEACTIVATED' });
    assert.equal(inactive.status, 201); assert.equal(inactive.data.setup, undefined);
    assert.equal((await write(inactive.data.user.id, 'setup', {})).status, 409);
  });
  await t.test('required audit failure rolls back account edits', async () => {
    const original = db.$transaction.bind(db);
    const before = await db.user.findUniqueOrThrow({ where: { id } });
    db.$transaction = (fn, options) => original((tx) => fn(new Proxy(tx, { get(target, key) {
      if (key === 'auditLog') return { create: async () => { throw new Error('synthetic audit unavailable'); } };
      return target[key];
    } })), options);
    try { assert.equal((await write(id, 'update', { firstName: 'Must roll back' })).status, 500); }
    finally { db.$transaction = original; }
    const after = await db.user.findUniqueOrThrow({ where: { id } });
    assert.equal(after.firstName, before.firstName); assert.equal(after.updatedAt.toISOString(), before.updatedAt.toISOString());
  });
});
