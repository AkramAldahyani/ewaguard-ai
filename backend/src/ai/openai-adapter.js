import OpenAI from 'openai';
import { CHAT_LIMITS, ChatError, SYSTEM_INSTRUCTIONS, modelPricing, containsSecret } from './chat-policy.js';

export function providerError(error) {
  if (error instanceof ChatError) return error;
  if (error?.code === 'insufficient_quota') return new ChatError(503, 'AI_CREDITS_UNAVAILABLE', 'AI credits are unavailable. Contact the application administrator.');
  if (error?.status === 401 || error?.status === 403) return new ChatError(503, 'AI_AUTHENTICATION_FAILED', 'AI provider access is unavailable.');
  if (error?.status === 404 || error?.status === 400) return new ChatError(503, 'AI_MODEL_UNAVAILABLE', 'The configured AI model or request configuration is unavailable.');
  if (error?.status === 429) return new ChatError(429, 'AI_RATE_LIMITED', 'The AI provider is busy. Try again later.');
  if (['AbortError', 'TimeoutError', 'APIConnectionTimeoutError', 'APIUserAbortError'].includes(error?.name)) return new ChatError(504, 'AI_TIMEOUT', 'The AI request timed out. Its billing status may require review.');
  return new ChatError(502, 'AI_PROVIDER_UNAVAILABLE', 'The AI provider could not complete this request.');
}

export function createOpenAIAdapter({ apiKey, model = 'gpt-6-luna', client, timeoutMs = CHAT_LIMITS.timeoutMs } = {}) {
  let sdk = client;
  let verifiedAt = 0;
  function configured() {
    if (!apiKey) throw new ChatError(503, 'AI_NOT_CONFIGURED', 'AI chat is not configured.');
    const pricing = modelPricing(model);
    sdk ??= new OpenAI({ apiKey, baseURL: 'https://api.openai.com/v1', maxRetries: 0,
      timeout: timeoutMs, logLevel: 'off' });
    return pricing;
  }
  return {
    model,
    async verify() {
      const pricing = configured();
      if (Date.now() - verifiedAt > 300_000) {
        try { await sdk.models.retrieve(model, { signal: AbortSignal.timeout(timeoutMs), maxRetries: 0 }); verifiedAt = Date.now(); }
        catch (error) { throw providerError(error); }
      }
      return pricing;
    },
    async respond(messages, { signal, maxOutputTokens = CHAT_LIMITS.outputTokens } = {}) {
      const pricing = configured();
      try {
        return await sdk.responses.create({ model, instructions: SYSTEM_INSTRUCTIONS,
          input: messages, reasoning: { effort: pricing.reasoning }, max_output_tokens: Math.min(maxOutputTokens, CHAT_LIMITS.outputTokens),
          store: false, service_tier: 'default', tools: [], tool_choice: 'none',
        }, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs), maxRetries: 0 });
      } catch (error) { throw providerError(error); }
    },
  };
}

export function responseText(response) {
  if (response?.status !== 'completed' || !Array.isArray(response.output) || response.output.some((item) => !['message', 'reasoning'].includes(item.type))) {
    throw new ChatError(502, 'AI_INVALID_RESPONSE', 'The AI response was incomplete or invalid.');
  }
  const parts = [];
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    if (item.role !== 'assistant' || !Array.isArray(item.content)) throw new ChatError(502, 'AI_INVALID_RESPONSE', 'The AI response was invalid.');
    for (const part of item.content) {
      const value = part.type === 'output_text' ? part.text : part.type === 'refusal' ? part.refusal : null;
      if (typeof value !== 'string') throw new ChatError(502, 'AI_INVALID_RESPONSE', 'The AI response was invalid.');
      parts.push(value);
    }
  }
  const text = parts.join('\n').trim();
  if (!text || text.length > 8000 || containsSecret(text) || text.includes(SYSTEM_INSTRUCTIONS)) throw new ChatError(502, 'AI_INVALID_RESPONSE', 'The AI response could not be displayed safely.');
  return text;
}
