import { createRetrievalService, requireRetrievalAccess } from './retrieval-service.js';
import { readReferenceChunks } from './retrieval-store.js';
import { RETRIEVAL_PRIVACY, RETRIEVAL_LIMITS, RetrievalError } from './retrieval-policy.js';
import { acknowledgeDisclaimer } from '../disclaimers/disclaimer-service.js';
import { authorizeToolContext } from '../ai/tools/tool-access.js';
import { PRIVACY_NOTICE, UUID } from '../ai/chat-policy.js';
import { ToolError } from '../ai/tools/tool-registry.js';
import { PDPL_PROFILE, PDPL_SHA256 } from './pdpl-source.js';
import { pdplQuotes } from './pdpl-quotes.js';

const restriction = Object.freeze({ documentKey: 'bahrain-pdpl', contentSha256: PDPL_SHA256, pdplContext: true });
const filters = Object.freeze({ category: 'PDPL', classification: 'PRODUCTION', approvalStatus: 'APPROVED', ...restriction });
function result(matches, status = matches.length ? 'MATCHES' : 'NO_MATCHES', ids = matches.map(m => m.chunkId)) {
  return { key: 'pdpl', trust: 'UNTRUSTED_DATA', data: { kind: 'PDPL', status, notice: PDPL_PROFILE.notice,
    matches: matches.map(m => ({ ...m, citationId: `PDPL${ids.indexOf(m.chunkId) + 1}`, quotes: pdplQuotes(m.excerpt),
      source: { ...m.source, translationStatus: 'UNOFFICIAL', language: 'en', authoritativeLanguage: 'ar' } })) } };
}
export function pdplReceipt(value) {
  return { name: 'search_pdpl', status: value.data.status, chunkIds: value.data.matches.map(m => m.chunkId) };
}
export function createPdplChat({ database, config = {}, embeddingProvider }) {
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
        throw new ToolError(400, 'PDPL_CONSENT_REQUIRED', 'Acknowledge the current chat privacy notice before PDPL retrieval.');
      // The current chat notice includes the full sensitive-information notice.
      // The explicit version submitted with this turn records that acknowledgement.
      const { acknowledgement } = await acknowledgeDisclaimer(database, { userId: auth.userId, context: 'CHAT' });
      try {
        const found = await retrieval.retrieve({ auth, signal, body: { question, requestId,
          category: 'PDPL', classification: 'PRODUCTION', approvalStatus: 'APPROVED', limit: RETRIEVAL_LIMITS.results,
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
      if (!Array.isArray(ids) || ids.length > RETRIEVAL_LIMITS.results || new Set(ids).size !== ids.length || ids.some(id => !UUID.test(id)))
        throw new ToolError(400, 'PDPL_INVALID_RECEIPT', 'The saved PDPL source references are invalid.');
      const matches = await readReferenceChunks(database, filters, model, ids);
      await access(auth, conversationId);
      // Missing/withdrawn evidence never silently replaces a cited passage.
      return result(matches, matches.length !== ids.length ? 'SOURCES_UNAVAILABLE' : matches.length ? 'MATCHES' : receipt.status, ids);
    },
  };
}
