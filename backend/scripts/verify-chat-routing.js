import { randomUUID } from 'node:crypto';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig, databaseUrl } from '../src/config/env.js';
import { createOpenAIAdapter } from '../src/ai/openai-adapter.js';
import { createChatService } from '../src/ai/chat-service.js';
import { PRIVACY_NOTICE } from '../src/ai/chat-policy.js';

// Explicit, bounded live evaluation. Public fixed questions and fictional policy
// sources only. Normal tests never call OpenAI. Preserve real usage/audit records.
const cases = [
  ['What is phishing?', 'GENERAL', 'How can I recognize it?', 'GENERAL'],
  ['Explain ransomware.', 'GENERAL'],
  ['What is two-factor authentication?', 'GENERAL'],
  ['How does a firewall work?', 'GENERAL'],
  ['What is artificial intelligence?', 'GENERAL'],
  ['Explain cloud computing.', 'GENERAL'],
  ['What makes a strong password?', 'GENERAL'],
  ['Tell me about yourself.', 'GENERAL'],
  ['What is our password policy?', 'COMPANY_POLICY', 'What about MFA?', 'COMPANY_POLICY'],
  ['What password requirements must employees follow?', 'COMPANY_POLICY'],
  ['Can I use my personal laptop for work?', 'COMPANY_POLICY'],
  ['Am I allowed to install software on my work computer?', 'COMPANY_POLICY'],
  ['Can I share company documents through Google Drive?', 'COMPANY_POLICY'],
  ['What should I do before leaving my desk?', 'COMPANY_POLICY'],
  ['Does EWA allow employees to use public AI tools?', 'COMPANY_POLICY'],
  ['Can I work from a coffee shop?', 'COMPANY_POLICY'],
  ['Am I allowed to upload work documents to ChatGPT?', 'COMPANY_POLICY'],
  ['What does Bahrain PDPL say about personal data?', 'PDPL'],
  ['Can companies collect customer information without consent?', 'PDPL'],
  ['What rights do individuals have under Bahrain PDPL?', 'PDPL'],
  ['Can personal data be transferred outside Bahrain?', 'PDPL'],
  [
    'What does our company policy say about protecting personal data, and how does this relate to Bahrain PDPL?',
    'BOTH',
  ],
  ['Our policy requires MFA. Why is MFA important?', 'COMPANY_POLICY'],
  ['Can I upload company documents to an AI chatbot, and what are the privacy concerns?', 'COMPANY_POLICY'],
  ['Is it allowed?', 'CLARIFY'],
];
const runName = process.argv[3] ?? 'evaluation';
const selectedCases = process.argv[4]
  ? cases.filter(([question]) => question.toLowerCase().includes(process.argv[4].toLowerCase()))
  : cases;
const report = [];
let reportPath;
let database;
const users = [];
let calls = 0;
let responses = [];
try {
  if (process.argv[2] !== '--run' || !/^[a-z][a-z0-9-]{0,39}$/.test(runName) || !selectedCases.length)
    throw new Error('EXPLICIT_RUN_REQUIRED');
  const url = new URL(databaseUrl());
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/ewaguard_ai')
    throw new Error('LOCAL_DATABASE_REQUIRED');
  const runtime = new URL('../../.runtime/', import.meta.url);
  await mkdir(runtime, { recursive: true });
  await (await open(new URL(`chat-routing-v7-${runName}`, runtime), 'wx')).close();
  reportPath = new URL(`chat-routing-v7-${runName}.json`, runtime);
  database = createDatabaseClient();
  const config = parseConfig();
  const adapter = createOpenAIAdapter({ apiKey: config.openaiApiKey, model: config.openaiModel });
  const provider = {
    ...adapter,
    respond: async (...args) => {
      if (++calls > 60) throw new Error('EVALUATION_CALL_LIMIT');
      const response = await adapter.respond(...args);
      responses.push({
        status: response.status,
        incomplete: response.incomplete_details,
        output: response.output.filter((item) => item.type !== 'reasoning'),
        tokens: response.usage?.output_tokens,
      });
      return response;
    },
  };
  const service = createChatService({ database, config, provider });
  for (const [question, expected, followup, followupExpected] of selectedCases) {
    const user = await database.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        firstName: 'Synthetic',
        lastName: 'Routing Validation',
        role: { connect: { name: 'EMPLOYEE' } },
        status: 'ACTIVE',
        passwordHash: 'synthetic-non-login-hash',
      },
    });
    users.push(user.id);
    const auth = {
      userId: user.id,
      sessionId: randomUUID(),
      sessionVersion: user.sessionVersion,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    };
    const session = await database.chatSession.create({
      data: { ownerId: user.id, expiresAt: new Date(Date.now() + 900000) },
    });
    for (const [content, wanted] of [[question, expected], ...(followup ? [[followup, followupExpected]] : [])]) {
      const before = calls;
      responses = [];
      try {
        const result = await service.send({
          userId: user.id,
          auth,
          sessionId: session.id,
          requestId: randomUUID(),
          content,
          privacyNoticeVersion: PRIVACY_NOTICE.version,
        });
        const actual = result.toolMetadata.routing?.source;
        const answer = result.messages.at(-1).content;
        const limited = /does not support a reliable answer|retrieval is disabled/.test(answer);
        const sources =
          result.verifiedResults?.map((r) => ({
            kind: r.data.kind,
            status: r.data.status,
            titles: r.data.matches.map((m) => m.source.title),
          })) ?? [];
        const passed =
          !limited &&
          actual === wanted &&
          (['GENERAL', 'CLARIFY'].includes(wanted) ? !sources.length : sources.length === (wanted === 'BOTH' ? 2 : 1));
        const entry = { question: content, expected: wanted, actual, passed, limited, calls: calls - before, sources };
        report.push({ ...entry, answer, responses, evidence: result.verifiedResults?.map((r) => r.data.matches) });
        console.info(JSON.stringify(entry));
        if (!passed) process.exitCode = 1;
      } catch (error) {
        const entry = { question: content, passed: false, code: error.code ?? 'EVALUATION_FAILED' };
        report.push({ ...entry, responses });
        console.info(JSON.stringify(entry));
        process.exitCode = 1;
      }
    }
  }
  const usage = await database.aiUsage.aggregate({ where: { userId: { in: users } }, _sum: { chargedMicros: true } });
  console.info(JSON.stringify({ calls, estimatedChatUsd: (usage._sum.chargedMicros ?? 0) / 1000000 }));
} catch (error) {
  console.error(JSON.stringify({ code: error.code === 'EEXIST' ? 'EVALUATION_ALREADY_RUN' : 'EVALUATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2));
  if (users.length) {
    await database.disclaimerAcknowledgement.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
  }
  await database?.$disconnect();
}
