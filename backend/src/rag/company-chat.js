import { createHash } from 'node:crypto';
import { createRetrievalService, requireRetrievalAccess } from './retrieval-service.js';
import { readReferenceChunks } from './retrieval-store.js';
import { RETRIEVAL_PRIVACY, RetrievalError } from './retrieval-policy.js';
import { acknowledgeDisclaimer } from '../disclaimers/disclaimer-service.js';
import { authorizeToolContext } from '../ai/tools/tool-access.js';
import { PRIVACY_NOTICE, UUID } from '../ai/chat-policy.js';
import { ToolError } from '../ai/tools/tool-registry.js';
import { DEMO_POLICY_NOTICE } from './company-source.js';
import { pdplQuotes as sourceQuotes } from './pdpl-quotes.js';

const filters = Object.freeze({ category: 'COMPANY_POLICY', classification: 'DEMONSTRATION', approvalStatus: 'NOT_OFFICIALLY_APPROVED' });
const restriction = Object.freeze({ companyContext: true });
const enabled = config => ['development', 'test'].includes(config?.nodeEnv) && config.ragDemonstrationEnabled === true;
function result(matches, status = matches.length ? 'MATCHES' : 'NO_MATCHES', ids = matches.map(m => m.chunkId)) {
  return { key: 'company-policy', trust: 'UNTRUSTED_DATA', data: { kind: 'COMPANY_POLICY', status, notice: DEMO_POLICY_NOTICE,
    matches: matches.map(m => ({ ...m, citationId: `POLICY${ids.indexOf(m.chunkId) + 1}`, quotes: sourceQuotes(m.excerpt) })) } };
}
export function companyReceipt(value) {
  return { name: 'search_company_policy', status: value.data.status, chunkIds: value.data.matches.map(m => m.chunkId) };
}
// Stable category-specific ID: mixed questions reserve each search once, never
// collide with the PDPL reservation and never mint a fresh ID for an automatic retry.
export function companyRequestId(requestId) {
  if (!UUID.test(requestId ?? '')) throw new ToolError(400, 'POLICY_INVALID_REQUEST', 'Invalid policy request.');
  const hash = createHash('sha256').update(`company-policy:${requestId}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function createCompanyChat({ database, config = {}, embeddingProvider }) {
  const retrieval = createRetrievalService({ database, config, provider: embeddingProvider, sourceRestriction: restriction });
  const model = config.openaiEmbeddingModel ?? 'text-embedding-3-small';
  async function access(auth, conversationId) {
    await requireRetrievalAccess(database, auth);
    await authorizeToolContext(database, auth, conversationId);
  }
  return {
    async search({ auth, conversationId, question, requestId, privacyNoticeVersion, signal }) {
      await access(auth, conversationId);
      if (privacyNoticeVersion !== PRIVACY_NOTICE.version)
        throw new ToolError(400, 'POLICY_CONSENT_REQUIRED', 'Acknowledge the current chat privacy notice before policy retrieval.');
      if (!enabled(config)) return result([], 'DISABLED');
      const { acknowledgement } = await acknowledgeDisclaimer(database, { userId: auth.userId, context: 'CHAT' });
      try {
        const found = await retrieval.retrieve({ auth, signal, body: { ...filters, question, requestId: companyRequestId(requestId), limit: 3,
          acknowledgementId: acknowledgement.id, privacyNoticeVersion: RETRIEVAL_PRIVACY.version } });
        await access(auth, conversationId);
        return result(found.matches);
      } catch (error) {
        if (error instanceof RetrievalError && [429, 503].includes(error.status)) return result([], 'UNAVAILABLE');
        throw error;
      }
    },
    async recover({ auth, conversationId, receipt }) {
      await access(auth, conversationId);
      const ids = receipt?.chunkIds;
      if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length || ids.some(id => !UUID.test(id)))
        throw new ToolError(400, 'POLICY_INVALID_RECEIPT', 'The saved policy references are invalid.');
      if (!enabled(config)) return result([], 'DISABLED');
      const matches = await readReferenceChunks(database, { ...filters, ...restriction, demoEligible: true }, model, ids);
      await access(auth, conversationId);
      return result(matches, matches.length !== ids.length ? 'SOURCES_UNAVAILABLE' : matches.length ? 'MATCHES' : receipt.status, ids);
    },
  };
}
