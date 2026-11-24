import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChatFlow } from '../src/features/chat/chat-flow.js';
import { generatePassword, CHARACTER_SETS } from '../src/features/password/password-generator.js';
import { evaluatePolicy, PASSWORD_POLICY } from '../src/features/password/password-policy.js';
import { blankQuestion, blankQuiz, quizBody, validateQuizDraft } from '../src/features/training/quiz-model.js';
import { emptyDraft, courseBody, topics, validateDraft, nextSection } from '../src/features/training/training-model.js';
import { accountBody, accountDraft, directoryQuery, validateAccount } from '../src/features/users/users-model.js';
import { validateUrlInput } from '../src/features/url/url-state.js';
import { displayLabel } from '../src/lib/labels.js';
import { validateQuizDraft as serverQuiz } from '../../backend/src/training/course-quiz-service.js';
import { courseInput, topics as serverTopics } from '../../backend/src/training/training-policy.js';
import { profileInput, listInput } from '../../backend/src/users/user-policy.js';
import { STATUSES } from '../../backend/src/incidents/management-policy.js';

// Logic shared by the browser and the API: what the interface accepts must be what the server accepts.
const accepts = (operation) => {
  try {
    operation();
    return true;
  } catch {
    return false;
  }
};

test('generated passwords always satisfy the policy, every selected set and the requested length', () => {
  for (let length = PASSWORD_POLICY.minLength; length <= PASSWORD_POLICY.maxLength; length++)
    for (let round = 0; round < 25; round++) {
      const password = generatePassword({ length, uppercase: true, lowercase: true, numbers: true, symbols: true });
      assert.equal(password.length, length);
      assert.equal(evaluatePolicy(password).compliant, true);
      for (const set of Object.values(CHARACTER_SETS))
        assert.ok([...password].some((character) => set.includes(character)));
    }
  const unique = new Set(Array.from({ length: 200 }, () => generatePassword()));
  assert.equal(unique.size, 200);
});

test('password generation refuses missing randomness, bad lengths and policy-breaking options', () => {
  const options = { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true };
  assert.throws(() => generatePassword(options, PASSWORD_POLICY, {}), /unavailable/);
  for (const length of [0, 7, 21, 12.5, 'x'])
    assert.throws(() => generatePassword({ ...options, length }), /Choose a length/);
  for (const name of ['uppercase', 'lowercase', 'numbers', 'symbols'])
    assert.throws(() => generatePassword({ ...options, [name]: false }), /organization-required/);
});

test('password randomness is rejection-sampled: biased bytes are discarded', () => {
  // Bytes at or above the largest multiple of the set size would favour the first characters.
  let served = 0;
  const provider = {
    getRandomValues(array) {
      array[0] = served++ % 2 ? 1 : 255;
      return array;
    },
  };
  assert.equal(generatePassword(undefined, PASSWORD_POLICY, provider).length, 20);
  assert.ok(served > 60, 'discarded bytes are replaced');
});

test('quiz drafts: browser and server agree on every boundary', () => {
  const valid = () => ({
    ...blankQuiz(),
    title: 'Quiz',
    questions: [
      {
        ...blankQuestion(),
        text: 'Question?',
        explanation: 'Because.',
        options: [
          { text: 'Yes', isCorrect: true },
          { text: 'No', isCorrect: false },
        ],
      },
    ],
  });
  const change = (edit) => {
    const draft = valid();
    edit(draft);
    return draft;
  };
  for (const draft of [
    valid(),
    change((d) => (d.title = '   ')),
    change((d) => (d.title = '<b>')),
    change((d) => (d.title = 'x'.repeat(201))),
    change((d) => (d.passingPercent = 0)),
    change((d) => (d.passingPercent = 100)),
    change((d) => (d.passingPercent = 101)),
    change((d) => (d.passingPercent = 50.5)),
    change((d) => (d.maxAttempts = 10)),
    change((d) => (d.maxAttempts = 11)),
    change((d) => (d.questions = [])),
    change((d) => (d.questions = Array(31).fill(d.questions[0]))),
    change((d) => (d.questions[0].points = 21)),
    change((d) => (d.questions[0].explanation = '')),
    change((d) => (d.questions[0].options[1].isCorrect = true)),
    change((d) => (d.questions[0].options[0].isCorrect = false)),
    change((d) => (d.questions[0].options[1].text = ' yes ')),
    change((d) => d.questions[0].options.pop()),
  ])
    assert.equal(
      validateQuizDraft(draft) === '',
      accepts(() => serverQuiz(quizBody(draft))),
      JSON.stringify(draft).slice(0, 200),
    );
});

test('course drafts and topics: browser and server agree', () => {
  assert.deepEqual(topics, serverTopics);
  const valid = () => {
    const draft = emptyDraft();
    Object.assign(draft, { title: 'Course', description: 'About.', learningObjectives: ['Learn.'] });
    draft.content.sections.forEach((section) => (section.body = 'Text.'));
    return draft;
  };
  const change = (edit) => {
    const draft = valid();
    edit(draft);
    return draft;
  };
  for (const draft of [
    valid(),
    change((d) => (d.title = '')),
    change((d) => (d.topic = 'UNKNOWN')),
    change((d) => (d.estimatedMinutes = 0)),
    change((d) => (d.estimatedMinutes = 61)),
    change((d) => (d.learningObjectives = [])),
    change((d) => (d.learningObjectives = Array(9).fill('x'))),
    change((d) => d.content.sections.pop()),
    change((d) => (d.content.sections[1].key = d.content.sections[0].key)),
    change((d) => (d.content.sections[0].key = 'Bad Key')),
    change((d) => (d.content.sections[0].body = '<script>')),
    change((d) => (d.content.sections[0].body = 'x'.repeat(6001))),
  ])
    assert.equal(
      validateDraft(draft) === '',
      accepts(() => courseInput(courseBody(draft))),
      JSON.stringify(draft).slice(0, 200),
    );
});

test('account forms and directory filters produce requests the server accepts', () => {
  const department = '11111111-1111-4111-8111-111111111111';
  const base = { ...accountDraft(), firstName: 'A', lastName: 'B', email: 'a@example.com', departmentId: department };
  for (const draft of [
    base,
    { ...base, firstName: '  ' },
    { ...base, lastName: 'x'.repeat(101) },
    { ...base, email: 'invalid' },
    { ...base, email: 'a@b' },
    { ...base, employeeIdentifier: 'E-1.2_3' },
    { ...base, employeeIdentifier: '-bad' },
    { ...base, employeeIdentifier: 'has space' },
  ])
    assert.equal(
      Object.keys(validateAccount(draft)).length === 0,
      accepts(() => profileInput(accountBody(draft), true)),
      JSON.stringify(draft),
    );
  const query = directoryQuery({
    search: 'ann lee',
    role: '',
    status: 'ACTIVE',
    sort: 'name',
    direction: 'asc',
    page: 2,
  });
  assert.equal(listInput(Object.fromEntries(new URLSearchParams(query))).skip, 20);
});

test('course reading always resumes at the first unread section', () => {
  const assignment = (done) => ({
    training: { content: { sections: [{ key: 'a' }, { key: 'b' }, { key: 'c' }] } },
    progress: { completedSectionKeys: done },
  });
  assert.equal(nextSection(assignment([])), 0);
  assert.equal(nextSection(assignment(['a', 'b'])), 2);
  assert.equal(nextSection(assignment(['a', 'b', 'c'])), -1);
  assert.equal(nextSection({ training: {}, progress: null }), -1);
});

test('URL input and status labels are checked before anything is sent or shown', () => {
  for (const value of ['', '   ', 'example.com', 'ftp://example.com', `https://${'x'.repeat(4100)}`])
    assert.notEqual(validateUrlInput(value), '', value.slice(0, 40));
  assert.equal(validateUrlInput(' HTTPS://example.com '), '');
  for (const status of STATUSES) assert.match(displayLabel(status), /^[A-Z][a-z ]+$/);
  for (const value of [null, undefined, '', 5]) assert.equal(displayLabel(value), '');
});

test('a message refused before storage returns to the composer; an unconfirmed one keeps a receipt', async () => {
  const notice = { version: 'v1', text: 'notice' };
  const attempt = async (code) => {
    const flow = createChatFlow(
      {
        privacy: async () => ({ privacyNotice: notice }),
        list: async () => ({ conversations: [], nextBefore: null }),
        create: async () => ({
          conversation: { id: 'c1', updatedAt: new Date().toISOString() },
          privacyNotice: notice,
        }),
        send: async () => {
          throw Object.assign(new Error('refused'), { status: 400, code });
        },
      },
      () => 'request-1',
    );
    await flow.init();
    flow.acknowledge(true);
    await flow.create();
    flow.edit('What is phishing?');
    await flow.send();
    return flow.getSnapshot();
  };
  for (const code of ['CHAT_SENSITIVE_HISTORY', 'CHAT_SENSITIVE_INPUT', 'CHAT_DAILY_LIMIT']) {
    const state = await attempt(code);
    assert.equal(state.draft, 'What is phishing?', code);
    assert.equal(state.requests.length, 0, code);
    assert.equal(state.status, 'error');
  }
  const unconfirmed = await attempt('AI_TIMEOUT');
  assert.equal(unconfirmed.draft, '');
  assert.equal(unconfirmed.requests[0].status, 'UNCONFIRMED');
});
