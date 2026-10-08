import { randomUUID } from 'node:crypto';
import { open, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../src/config/database.js';
import { parseConfig } from '../src/config/env.js';
import { createOpenAIAdapter } from '../src/ai/openai-adapter.js';
import { createChatService } from '../src/ai/chat-service.js';

// Explicit opt-in only. Never part of npm test. A durable local marker prevents
// repeating the single authorized attempt, even after network/storage failure.
const config = parseConfig();
const database = createDatabaseClient();
let userId;
const requestId = '8a000000-0000-4000-8000-000000000001';
try {
  if (!config.openaiApiKey || !config.openaiModel) throw new Error('AI_NOT_CONFIGURED');
  const provider = createOpenAIAdapter({ apiKey: config.openaiApiKey, model: config.openaiModel });
  await provider.verify();
  if (await database.aiUsage.findFirst({ where: { requestId } })) throw new Error('LIVE_ATTEMPT_ALREADY_RECORDED');
  const dir = fileURLToPath(new URL('../../.runtime/', import.meta.url));
  await mkdir(dir, { recursive: true });
  const marker = await open(`${dir}/openai-phase8a-live-attempt`, 'wx');
  await marker.close();
  const user = await database.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'Synthetic', lastName: 'Verification',
    role: { connect: { name: 'EMPLOYEE' } }, status: 'ACTIVE', passwordHash: 'synthetic-non-login-hash' } });
  userId = user.id;
  const session = await database.chatSession.create({ data: { ownerId: userId, expiresAt: new Date(Date.now() + 60000) } });
  try {
    await createChatService({ database, provider }).send({ userId, sessionId: session.id, requestId,
      content: 'What is phishing? Answer in two sentences.', maxOutputTokens: 128 });
    console.log(JSON.stringify({ model: config.openaiModel, apiResponded: true, validResponse: true }));
  } catch (error) {
    console.log(JSON.stringify({ model: config.openaiModel, validResponse: false, errorCode: error.code?.startsWith('AI_') ? error.code : 'VERIFICATION_FAILED' }));
    process.exitCode = 1;
  }
  const entry = await database.aiUsage.findFirst({ where: { requestId } });
  console.log(JSON.stringify({ status: entry?.status, inputTokens: entry?.inputTokens, outputTokens: entry?.outputTokens,
    estimatedCostUsd: entry?.inputTokens != null ? entry.chargedMicros / 1_000_000 : null,
    reservedUsd: entry ? entry.reservedMicros / 1_000_000 : null }));
} catch (error) {
  console.log(JSON.stringify({ verification: 'not_run', code: error.code === 'EEXIST' ? 'LIVE_ATTEMPT_ALREADY_RECORDED' : 'PREFLIGHT_FAILED' }));
  process.exitCode = 1;
} finally {
  // SET NULL retains the charge/request record after synthetic history is removed.
  if (userId) await database.user.delete({ where: { id: userId } }).catch(() => { process.exitCode = 1; });
  await database.$disconnect();
}
