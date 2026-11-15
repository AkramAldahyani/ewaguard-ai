import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runToolTurns, validateGroundedText } from '../src/ai/tool-orchestration.js';
import { createOpenAIAdapter } from '../src/ai/openai-adapter.js';
import { groundedResponseFormat } from '../src/rag/pdpl-response-format.js';
import { COMPANY_RESPONSE_FORMAT } from '../src/rag/company-answer.js';
import { inputBound } from '../src/ai/tool-round-budget.js';

const decision = (source, question = '', answer = '', generalGuidance = 'OMIT') => ({
  status: 'completed',
  output: [
    {
      type: 'function_call',
      name: 'route_question',
      call_id: 'route',
      arguments: JSON.stringify({ source, question, answer, generalGuidance }),
    },
  ],
});
const message = (text) => ({
  status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
});
const evidence = (kind) => ({
  key: kind,
  data: {
    kind,
    status: 'MATCHES',
    matches: [
      {
        citationId: kind === 'PDPL' ? 'PDPL1' : 'POLICY1',
        chunkId: 'fixture',
        excerpt: 'The demonstration example uses MFA for remote access.',
        source: { title: 'Authentication', section: 'Access', version: 1 },
      },
    ],
  },
});

test('initial SDK turn requires a structured route or existing analysis tool, no legacy search shortcuts', async () => {
  const adapter = createOpenAIAdapter({
    apiKey: 'synthetic',
    client: {
      responses: {
        create: async (body) => {
          assert.equal(body.tool_choice, 'required');
          assert.equal(body.parallel_tool_calls, false);
          assert.ok(body.tools.some((t) => t.name === 'route_question'));
          assert.ok(body.tools.some((t) => t.name === 'analyze_email'));
          assert.ok(!body.tools.some((t) => t.name === 'search_pdpl'));
          return decision('GENERAL', '', 'Hello.');
        },
      },
    },
  });
  await adapter.respond([{ role: 'user', content: 'Hello' }], { enableTools: true, routeTurn: true });
});

test('general cyber and non-cyber replies cost one round with no retrieval or invented citation notice', async () => {
  for (const question of [
    'What is phishing?',
    'Explain ransomware.',
    'What makes a strong password?',
    'What is artificial intelligence?',
    'Explain cloud computing.',
  ]) {
    let calls = 0;
    const outcome = await runToolTurns({
      input: [],
      auth: {},
      question,
      pdpl: { search: () => assert.fail() },
      company: { search: () => assert.fail() },
      callModel: async () => {
        calls++;
        return decision('GENERAL', '', 'A concise general explanation.');
      },
    });
    assert.equal(calls, 1);
    assert.equal(outcome.metadata.routing.source, 'GENERAL');
    assert.deepEqual(outcome.results, []);
  }
});

test('implicit policy, legal and mixed decisions retrieve exact categories and contextual questions', async () => {
  for (const [source, question, expected] of [
    ['COMPANY_POLICY', 'What password requirements must employees follow?', ['COMPANY_POLICY']],
    ['COMPANY_POLICY', 'Am I allowed to upload work documents to ChatGPT?', ['COMPANY_POLICY']],
    ['PDPL', 'Can companies collect customer information without consent?', ['PDPL']],
    ['BOTH', 'How do company privacy rules relate to Bahrain PDPL?', ['PDPL', 'COMPANY_POLICY']],
  ]) {
    const searched = [];
    let calls = 0;
    const service = (kind) => ({
      search: async (req) => {
        searched.push(kind);
        assert.equal(req.question, question);
        return evidence(kind);
      },
      recover: async () => evidence(kind),
    });
    const outcome = await runToolTurns({
      input: [],
      auth: {},
      question,
      saveMetadata: async () => {},
      company: service('COMPANY_POLICY'),
      pdpl: service('PDPL'),
      callModel: async (_input, enabled, round) => {
        calls++;
        if (!round) return decision(source, question);
        assert.equal(enabled, false);
        return message(JSON.stringify({ supported: false, explanation: '', citations: [], generalGuidance: '' }));
      },
    });
    assert.deepEqual(searched, expected);
    assert.equal(calls, 2);
    assert.match(outcome.text, /does not support/); // irrelevant evidence never becomes generic requirements
  }
});

test('follow-up uses recent context for classification but re-retrieves evidence instead of trusting prior answer', async () => {
  const input = [
    { role: 'user', content: 'What is our authentication policy?' },
    { role: 'assistant', content: 'Previous explanation is not legal or policy evidence.' },
    { role: 'user', content: 'What about MFA?' },
  ];
  let searched;
  const outcome = await runToolTurns({
    input,
    question: 'What about MFA?',
    auth: {},
    saveMetadata: async () => {},
    company: {
      search: async (request) => {
        searched = request.question;
        return { data: { kind: 'COMPANY_POLICY', status: 'NO_MATCHES', matches: [] } };
      },
    },
    callModel: async (messages) => {
      assert.deepEqual(messages, input);
      return decision('COMPANY_POLICY', 'What does the demonstration authentication policy require for MFA?');
    },
  });
  assert.match(searched, /authentication policy.*MFA/);
  assert.match(outcome.text, /does not support/);
});

test('mixed policy and general explanation stays separate and valid citations survive Markdown formatting', async () => {
  const result = evidence('COMPANY_POLICY');
  const outcome = await runToolTurns({
    input: [],
    question: 'Our policy requires MFA. Why is it important?',
    auth: {},
    saveMetadata: async () => {},
    company: { search: async () => result, recover: async () => result },
    callModel: async (_input, _enabled, round) =>
      !round
        ? decision('COMPANY_POLICY', 'What does the policy say about MFA?', '', 'INCLUDE')
        : message(
            JSON.stringify({
              supported: true,
              explanation: '**The demonstration example uses MFA.** [POLICY1]',
              citations: [{ id: 'POLICY1', quoteId: 'Q1' }],
              generalGuidance: 'MFA adds another identity check after credential theft.',
            }),
          ),
  });
  assert.match(outcome.text, /### General guidance/);
  assert.match(outcome.text, /### Sources/);
  assert.match(outcome.text, /NOT OFFICIALLY APPROVED/);
  assert.match(outcome.text, /\[POLICY1\]/);
});

test('clarification avoids retrieval; invalid decisions and secrets never reach a source service', async () => {
  const output = await runToolTurns({
    input: [],
    question: 'Is it allowed?',
    auth: {},
    callModel: async () => decision('CLARIFY', '', 'Which activity do you mean?'),
  });
  assert.equal(output.text, 'Which activity do you mean?');
  for (const response of [
    decision('ADMIN', 'anything'),
    decision('COMPANY_POLICY', 'password: forbidden'),
    decision('PDPL', '', 'invented law'),
    decision('GENERAL', '', 'Invented source [PDPL1]'),
  ]) {
    await assert.rejects(
      runToolTurns({
        input: [],
        auth: {},
        question: 'Help',
        callModel: async () => response,
        company: { search: () => assert.fail() },
        pdpl: { search: () => assert.fail() },
      }),
    );
  }
});

test('wrong-category service data cannot become legal evidence', async () => {
  await assert.rejects(
    runToolTurns({
      input: [],
      auth: {},
      question: 'A legal question',
      callModel: async () => decision('PDPL', 'A legal question'),
      pdpl: { search: async () => evidence('COMPANY_POLICY') },
      saveMetadata: () => assert.fail('Do not save invalid evidence'),
    }),
    { code: 'AI_INVALID_RESPONSE' },
  );
});

test('negative safety disclaimers pass while absolute assurances and fabricated incidents fail', () => {
  for (const text of [
    'I don’t make legal decisions or guarantee that something is safe.',
    'No detection does not guarantee that the file is safe.',
  ])
    assert.equal(validateGroundedText(text, []), text);
  for (const text of [
    'This file is safe.',
    'I cannot guarantee anything, but this site is safe.',
    'I created a security incident.',
  ])
    assert.throws(() => validateGroundedText(text, []), { code: 'AI_INVALID_RESPONSE' });
});

test('generated citation schema binds quote IDs to their actual source and reserves its full size', async () => {
  const result = evidence('COMPANY_POLICY');
  result.data.matches.push({
    ...result.data.matches[0],
    citationId: 'POLICY2',
    excerpt: `${'First passage. '.repeat(18)}\n\n${'Second passage. '.repeat(6)}`,
  });
  const answerFormat = groundedResponseFormat(COMPANY_RESPONSE_FORMAT, [result]);
  const choices = answerFormat.schema.properties.citations.items.anyOf;
  assert.deepEqual(
    choices.map((choice) => [choice.properties.id.enum, choice.properties.quoteId.enum]),
    [
      [['POLICY1'], ['Q1']],
      [['POLICY2'], ['Q1', 'Q2']],
    ],
  );
  assert.deepEqual(Object.keys(answerFormat.schema.properties), [
    'supported',
    'citations',
    'explanation',
    'generalGuidance',
  ]);
  const bound = inputBound([], false, false, true, answerFormat);
  assert.equal(
    bound - inputBound([], false, false, true),
    Buffer.byteLength(JSON.stringify(answerFormat)) - Buffer.byteLength(JSON.stringify(COMPANY_RESPONSE_FORMAT)),
  );
  const adapter = createOpenAIAdapter({
    apiKey: 'synthetic',
    client: {
      responses: {
        create: async (body) => {
          assert.deepEqual(body.text.format, answerFormat);
          return message('checked');
        },
      },
    },
  });
  await adapter.respond([], { companyResponse: true, answerFormat });
});
