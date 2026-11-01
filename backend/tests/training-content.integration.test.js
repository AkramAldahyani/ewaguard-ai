import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { authCookie, issueAccessToken } from '../src/auth/auth-token.js';
import { courseInput } from '../src/training/training-policy.js';
import { validateQuizDraft } from '../src/training/course-quiz-service.js';
import { provisionCourse, ProvisioningError } from '../src/training/course-provisioning.js';
import { trainingContent } from '../src/training/content/index.js';

// Training content phases TC1 (phishing-awareness) and TC2 (safe-browsing, data-privacy).
const expected = {
  'phishing-awareness': { title: 'Phishing Awareness', topic: 'PHISHING',
    keys: ['what-is-phishing', 'warning-signs', 'real-world-scenario', 'protect-yourself', 'what-to-do'] },
  'safe-browsing': { title: 'Safe Browsing', topic: 'SAFE_BROWSING',
    keys: ['browsing-safely', 'dangerous-websites', 'downloads-attachments', 'qr-codes-online-tricks', 'safe-browsing-habits'] },
  'data-privacy': { title: 'Data Privacy', topic: 'INFORMATION_HANDLING',
    keys: ['what-is-data-privacy', 'recognizing-sensitive-information', 'handling-information-safely', 'data-privacy-in-bahrain', 'everyday-privacy-decisions'] },
  'physical-security': { title: 'Physical Security', topic: 'PHYSICAL_SECURITY',
    keys: ['why-physical-security-matters', 'lock-screen-protect-desk', 'badges-visitors-tailgating', 'devices-and-documents', 'when-something-looks-suspicious'] },
  'reporting-security-incidents': { title: 'Reporting Security Incidents', topic: 'INCIDENT_REPORTING',
    keys: ['what-is-a-security-incident', 'why-reporting-quickly-matters', 'what-to-do-first', 'making-a-useful-report', 'after-you-report'] },
  'secure-remote-work': { title: 'Secure Remote Work', topic: 'OTHER',
    keys: ['why-remote-security-matters', 'protecting-work-devices', 'wifi-and-networks', 'protecting-information-remotely', 'remote-work-checklist'] },
  'responsible-ai': { title: 'Responsible AI', topic: 'OTHER',
    keys: ['what-is-ai', 'protecting-data-with-ai', 'ai-not-always-correct', 'ai-powered-scams', 'using-ewaguard-ai-responsibly'] },
};

test('training content satisfies the existing course and quiz contracts', () => {
  assert.deepEqual(Object.keys(trainingContent), Object.keys(expected));
  let checkedHosts = 0;
  for (const [slug, { course: source, quiz: quizSource }] of Object.entries(trainingContent)) {
    const course = courseInput(source), want = expected[slug];
    assert.deepEqual([course.title, course.topic, course.requiresQuiz], [want.title, want.topic, true], slug);
    assert.ok(course.estimatedMinutes >= 7 && course.estimatedMinutes <= 10, slug);
    assert.equal(course.learningObjectives.length, 5, slug);
    assert.deepEqual(course.content.sections.map((section) => section.key), want.keys, slug);
    for (const [index, section] of course.content.sections.entries()) {
      assert.ok(section.title.startsWith(`Lesson ${index + 1}: `), section.title);
      assert.match(section.body, /^Key takeaway: /m, `${slug}/${section.key} needs a key takeaway`);
      assert.ok(section.body.length > 600 && section.body.length < 4500, `${slug}/${section.key} length ${section.body.length}`);
    }
    const quiz = validateQuizDraft(quizSource);
    assert.deepEqual([quiz.passingPercent, quiz.maxAttempts, quiz.questions.length], [80, 3, 5], slug);
    assert.deepEqual(quiz.questions.map((q) => q.type).sort(), ['MULTIPLE_CHOICE', 'MULTIPLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'TRUE_FALSE'], slug);
    for (const q of quiz.questions) assert.ok(q.explanation.length > 20 && q.points === 1, q.text);
    // Only reserved example domains (RFC 2606) appear as addresses, links or bare host names.
    const text = JSON.stringify([source, quizSource]);
    const hosts = [...text.matchAll(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|bh|io|co|ly|info|biz|example))\b/gi)].map((match) => match[1].toLowerCase());
    checkedHosts += hosts.length;
    // The phishing scenario quotes the genuine Microsoft sign-in host only to show how a lookalike link imitates it.
    for (const host of hosts.filter((item) => item !== 'login.microsoftonline.com')) assert.match(host, /(^|\.)(example\.(com|net|org)|example)$/, `${slug}: ${host}`);
  }
  assert.ok(checkedHosts >= 10);
});

test('Data Privacy PDPL lesson stays high-level and invents no obligations', () => {
  const lesson = trainingContent['data-privacy'].course.content.sections[3].body;
  assert.match(lesson, /not legal advice/); assert.match(lesson, /Data Protection Officer/);
  assert.doesNotMatch(lesson, /\b(Article|Law No|fine|penalt|days|hours|BHD|dinar|consent)\b/i);
});

test('TC3 courses invent no contacts, response times or disruptive containment steps', () => {
  for (const slug of ['physical-security', 'reporting-security-incidents']) {
    const { course, quiz } = trainingContent[slug];
    const text = JSON.stringify([course, quiz]);
    assert.doesNotMatch(text, /@|\+973|\bext\.|\b\d{3,}[- ]?\d{3,}\b|within \d+ (minutes|hours|days)/i, slug);
    assert.match(text, /approved (security |reporting |IT or security )?channel/, slug);
  }
  const reporting = JSON.stringify(trainingContent['reporting-security-incidents']);
  assert.doesNotMatch(reporting, /disconnect (the|your) (device|computer) from the network/i);
  assert.match(reporting, /do not replace official incident reporting/);
});

test('TC4 courses name no products or approved tools and make no AI privacy or safety guarantees', () => {
  for (const slug of ['secure-remote-work', 'responsible-ai']) {
    const text = JSON.stringify(trainingContent[slug]);
    assert.doesNotMatch(text, /AnyConnect|GlobalProtect|FortiClient|Zscaler|Intune|Zero Trust|Copilot|ChatGPT|Gemini|@|\+973/i, slug);
    assert.match(text, /approved/, slug);
  }
  const remote = JSON.stringify(trainingContent['secure-remote-work']);
  assert.match(remote, /does not make a harmful website safe/);
  assert.match(remote, /Other devices have their own lock/);
  // Quiz statements and Responsible AI lesson 3 quote deliberately false "is safe" claims, so this check covers
  // the Secure Remote Work lessons and the Responsible AI lesson that describes EWAGuard AI itself.
  const claims = /(EWAGuard AI|OpenAI|the provider|VPN|connection|network|your (data|information|messages|conversations?)) (is|are|keeps? (it|them)) (always |completely |fully )?(safe|secure|confidential|private)\b/i;
  assert.doesNotMatch(JSON.stringify(trainingContent['secure-remote-work'].course), claims);
  assert.doesNotMatch(trainingContent['responsible-ai'].course.content.sections[4].body, claims);
  const ai = JSON.stringify(trainingContent['responsible-ai']);
  // Lesson 5 must match the implemented notices: external processing and retention, no confidentiality promise,
  // and no claim of PDPL or company-policy document retrieval.
  assert.match(ai, /external AI provider \(OpenAI\)/); assert.match(ai, /may retain data for abuse prevention/);
  assert.match(ai, /does not guarantee that something is safe/); assert.match(ai, /does not replace it/);
  assert.doesNotMatch(ai, /PDPL|company[- ]polic|knowledge base|retriev/i);
  assert.doesNotMatch(trainingContent['responsible-ai'].course.content.sections[4].body, /never (stored|retained|shared)|fully confidential|guaranteed (private|confidential|safe)/i);
});

test('training content provisioning and employee lifecycle', async (t) => {
  const url = new URL(databaseUrl());
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/ewaguard_ai');
  const db = createDatabaseClient(), users = [], titles = [];
  const config = parseConfig({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-training-content-secret-at-least-32-characters', FRONTEND_URL: 'http://127.0.0.1:5173' });
  const server = createApp(config, { database: db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    // Delete only the synthetic programs created here; history triggers are disabled inside this local-test transaction only.
    try { await db.$transaction(async (tx) => {
      const programs = (await tx.trainingProgram.findMany({ where: { title: { in: titles } }, select: { id: true } })).map((p) => p.id);
      const quizIds = (await tx.trainingQuiz.findMany({ where: { trainingId: { in: programs } }, select: { quizId: true } })).map((q) => q.quizId);
      await tx.$executeRawUnsafe('ALTER TABLE quiz_answers DISABLE TRIGGER answer_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_attempts DISABLE TRIGGER submitted_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_options DISABLE TRIGGER option_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_questions DISABLE TRIGGER question_history');
      await tx.auditLog.deleteMany({ where: { actorId: { in: users } } });
      await tx.certificate.deleteMany({ where: { progress: { assignment: { trainingId: { in: programs } } } } });
      await tx.trainingProgress.deleteMany({ where: { assignment: { trainingId: { in: programs } } } });
      await tx.quizAnswer.deleteMany({ where: { attempt: { quizId: { in: quizIds } } } });
      await tx.quizAttempt.deleteMany({ where: { quizId: { in: quizIds } } });
      await tx.quizOption.deleteMany({ where: { question: { quizId: { in: quizIds } } } });
      await tx.quizQuestion.deleteMany({ where: { quizId: { in: quizIds } } });
      await tx.trainingQuiz.deleteMany({ where: { quizId: { in: quizIds } } });
      await tx.quiz.deleteMany({ where: { id: { in: quizIds } } });
      await tx.trainingAssignment.deleteMany({ where: { trainingId: { in: programs } } });
      await tx.trainingProgram.deleteMany({ where: { id: { in: programs } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
      await tx.$executeRawUnsafe('ALTER TABLE quiz_questions ENABLE TRIGGER question_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_options ENABLE TRIGGER option_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_attempts ENABLE TRIGGER submitted_history');
      await tx.$executeRawUnsafe('ALTER TABLE quiz_answers ENABLE TRIGGER answer_history');
    }, { timeout: 20000 }); } finally { await db.$disconnect(); }
  });
  async function user(role = 'EMPLOYEE', extra = {}) {
    const row = await db.user.create({ data: { firstName: 'Synthetic', lastName: 'Learner', email: `${randomUUID()}@example.invalid`,
      status: 'ACTIVE', passwordHash: 'synthetic-not-a-login-hash', role: { connect: { name: role } },
      ...(role === 'IT_SECURITY_ADMIN' ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: 'synthetic', mfaLastCounter: 0n } : {}), ...extra } });
    users.push(row.id); return row;
  }
  const noMfa = await user('IT_SECURITY_ADMIN', { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastCounter: null });
  // Fresh synthetic actors per course keep each flow within the existing per-user training rate limits.
  let admin, employee, other;
  async function request(path, { actor = admin, body } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: config.frontendUrl, Cookie: `${authCookie(config).name}=${issueAccessToken(actor.id, config, actor.mfaEnabledAt)}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }

  for (const [slug, content] of Object.entries(trainingContent)) {
    admin = await user('IT_SECURITY_ADMIN'); employee = await user(); other = await user();
    const title = `${content.course.title} synthetic ${randomUUID()}`; titles.push(title);
    const course = { ...content.course, title }, keys = expected[slug].keys;
    const provision = (adminEmail, override = course) => provisionCourse(db, { adminEmail, course: override, quiz: content.quiz });
    let programId;

    await t.test(`${slug}: provisioning requires an MFA-enrolled administrator and is idempotent`, async () => {
      for (const email of [employee.email, noMfa.email, 'missing@example.invalid', '']) await assert.rejects(provision(email), ProvisioningError);
      assert.equal(await db.trainingProgram.count({ where: { title } }), 0);
      const first = await provision(admin.email.toUpperCase());
      assert.deepEqual([first.outcome, first.quizCreated], ['CREATED', true]); programId = first.programId;
      // A case-insensitive title match under another topic is still treated as the existing course.
      const again = await provision(admin.email, { ...course, title: title.toUpperCase(), topic: 'OTHER' });
      assert.deepEqual([again.outcome, again.courseCreated, again.quizCreated, again.programId], ['ALREADY_EXISTS', false, false, programId]);
      assert.equal(await db.trainingProgram.count({ where: { title: { equals: title, mode: 'insensitive' } } }), 1);
      const program = await db.trainingProgram.findUnique({ where: { id: programId }, include: { quiz: { include: { quiz: true } }, assignments: true } });
      assert.deepEqual([program.status, program.origin, program.reviewedAt, program.createdById, program.assignments.length], ['DRAFT', 'HUMAN', null, admin.id, 0]);
      assert.deepEqual([program.quiz.quiz.status, program.quiz.quiz.passingPercent, program.quiz.quiz.maxAttempts], ['DRAFT', 80, 3]);
      assert.equal(await db.quizQuestion.count({ where: { quizId: program.quiz.quizId } }), 5);
      const actions = await db.auditLog.findMany({ where: { resourceId: programId }, select: { action: true, actorId: true } });
      assert.deepEqual(actions.map((a) => a.action).sort(), ['COURSE_QUIZ_CREATED', 'TRAINING_CREATED']);
      assert.ok(actions.every((a) => a.actorId === admin.id));
    });

    const adminPath = () => `/api/admin/training/${programId}`;
    await t.test(`${slug}: publication and assignment remain deliberate administrator actions`, async () => {
      assert.equal((await request('/api/admin/training', { actor: employee })).status, 403);
      assert.equal((await request(`${adminPath()}/assignments`, { body: { employeeId: employee.id } })).status, 409);
      const draft = (await request(adminPath())).data.program;
      assert.equal(draft.content.sections.length, 5);
      assert.equal((await request(`${adminPath()}/publish`, { body: { expectedUpdatedAt: draft.updatedAt } })).status, 409);
      assert.equal((await request(`${adminPath()}/review`, { actor: employee, body: { expectedUpdatedAt: draft.updatedAt } })).status, 403);
      assert.equal((await request(`${adminPath()}/review`, { body: { expectedUpdatedAt: draft.updatedAt } })).status, 200);
      const reviewed = (await request(adminPath())).data.program;
      assert.equal((await request(`${adminPath()}/publish`, { body: { expectedUpdatedAt: reviewed.updatedAt } })).status, 200);
      const quiz = (await request(`${adminPath()}/quiz`)).data.quiz;
      const approved = await request(`${adminPath()}/quiz/approve`, { body: { expectedUpdatedAt: quiz.updatedAt } });
      assert.equal((await request(`${adminPath()}/quiz/publish`, { body: { expectedUpdatedAt: approved.data.quiz.updatedAt } })).status, 200);
      assert.equal((await request(`${adminPath()}/assignments`, { body: { employeeId: employee.id } })).status, 200);
    });

    await t.test(`${slug}: employees read five lessons in order, resume, and complete only through the server-scored quiz`, async () => {
      const mine = await request('/api/training?pageSize=50', { actor: employee });
      const assignmentId = mine.data.items.find((item) => item.training.title === title).id;
      assert.equal((await request(`/api/training/${assignmentId}`, { actor: other })).status, 404);
      assert.equal((await request('/api/training', { actor: other })).data.items.some((item) => item.training.title === title), false);
      const own = `/api/training/${assignmentId}`;
      const detail = (await request(own, { actor: employee })).data;
      assert.deepEqual(detail.assignment.training.content.sections.map((s) => s.key), keys);
      assert.equal(detail.completionRequirement, 'MATERIAL_AND_QUIZ');
      const before = (await request(`${own}/quiz`, { actor: employee })).data;
      assert.deepEqual([before.reason, before.quiz], ['READING_INCOMPLETE', null]);
      assert.equal((await request(`${own}/start`, { actor: employee, body: {} })).status, 200);
      assert.equal((await request(`${own}/sections`, { actor: employee, body: { sectionKey: keys[1], acknowledged: true } })).status, 409);
      for (const sectionKey of keys.slice(0, 2)) assert.equal((await request(`${own}/sections`, { actor: employee, body: { sectionKey, acknowledged: true } })).status, 200);
      const resumed = (await request(own, { actor: employee })).data.assignment.progress;
      assert.deepEqual([resumed.status, resumed.progressPercent, resumed.completedSectionKeys], ['IN_PROGRESS', 40, keys.slice(0, 2)]);
      for (const sectionKey of keys.slice(2)) assert.equal((await request(`${own}/sections`, { actor: employee, body: { sectionKey, acknowledged: true } })).status, 200);
      const material = (await request(own, { actor: employee })).data.assignment.progress;
      assert.deepEqual([material.status, material.progressPercent, material.completedAt], ['IN_PROGRESS', 100, null]);
      assert.equal(await db.certificate.count({ where: { progress: { assignmentId } } }), 0);

      const ready = (await request(`${own}/quiz`, { actor: employee })).data;
      assert.deepEqual([ready.quiz.questions.length, ready.passingPercent, ready.attemptsRemaining], [5, 80, 3]);
      assert.doesNotMatch(JSON.stringify(ready), /isCorrect|correctOption|explanation/i);
      // Answer key read directly from the database: the employee API never exposes it before submission.
      const key = new Map((await db.quizOption.findMany({ where: { isCorrect: true, question: { quiz: { trainingQuiz: { trainingId: programId } } } } }))
        .map((o) => [o.questionId, o.id]));
      const answers = (questions, wrongCount) => questions.map((q, index) => ({ questionId: q.id,
        selectedOptionId: index < wrongCount ? q.options.find((o) => o.id !== key.get(q.id)).id : key.get(q.id) }));
      const first = (await request(`${own}/quiz/attempts`, { actor: employee, body: {} })).data;
      const failed = await request(`${own}/quiz/attempts/${first.attempt.id}/submit`, { actor: employee, body: { answers: answers(first.quiz.questions, 2) } });
      assert.deepEqual([failed.data.attempt.passed, Number(failed.data.attempt.scorePercent)], [false, 60]);
      assert.equal((await request(own, { actor: employee })).data.assignment.progress.status, 'IN_PROGRESS');
      assert.equal(await db.certificate.count({ where: { progress: { assignmentId } } }), 0);
      const second = (await request(`${own}/quiz/attempts`, { actor: employee, body: {} })).data;
      const passed = await request(`${own}/quiz/attempts/${second.attempt.id}/submit`, { actor: employee, body: { answers: answers(second.quiz.questions, 1) } });
      assert.deepEqual([passed.data.attempt.passed, Number(passed.data.attempt.scorePercent)], [true, 80]);
      const done = (await request(own, { actor: employee })).data.assignment.progress;
      assert.equal(done.status, 'COMPLETED'); assert.ok(done.completedAt);
      assert.equal(await db.certificate.count({ where: { progress: { assignmentId } } }), 1);
      // Listing certificates runs historical reconciliation; it must not issue a second certificate.
      const certificates = (await request('/api/certificates?pageSize=50', { actor: employee })).data.items;
      assert.equal(certificates.filter((item) => item.trainingTitle === title).length, 1);
      assert.equal(await db.certificate.count({ where: { progress: { assignmentId } } }), 1);
      const analytics = (await request(`/api/admin/analytics/awareness?programId=${programId}`)).data;
      assert.deepEqual([analytics.training.assignments, analytics.training.completed, analytics.courseQuizzes.submittedAttempts,
        analytics.courseQuizzes.passedAttempts, analytics.certificates.totalIssued], [1, 1, 2, 1, 1]);
    });
  }
});
