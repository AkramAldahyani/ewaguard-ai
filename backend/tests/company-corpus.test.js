import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadLocalManifest, prepareSource } from '../src/rag/local-sources.js';
import { isDemoPolicy, prepareCompanyExtraction, DEMO_POLICY_NOTICE } from '../src/rag/company-source.js';
import { parseConfig } from '../src/config/env.js';
import { requireDemoMode } from '../src/rag/company-activation.js';

test('all seven actual DOCX sources retain IDs, titles, versions, sample labels and numbered headings', async () => {
  const sources = (await loadLocalManifest()).filter(isDemoPolicy);
  assert.equal(sources.length, 7); const ids = [];
  for (const source of sources) {
    const prepared = await prepareSource(source); const policy = prepared.ingestionMetadata.policySource;
    ids.push(policy.policyId); assert.match(policy.policyId, /^DEMO-\d{2}$/);
    assert.equal(policy.sourceVersionDate, '1.0 | 21 October 2026');
    assert.equal(policy.sourceStatus, 'SAMPLE / NOT APPROVED'); assert.ok(policy.demonstrationNoticePresent);
    assert.ok(policy.sourceTitle); assert.equal(policy.notice, DEMO_POLICY_NOTICE);
    assert.ok(prepared.chunks.some(c => c.metadata.section?.startsWith('4.1.')));
    assert.ok(prepared.chunks.every(c => c.metadata.page === null && c.metadata.referenceTrust === 'UNTRUSTED'));
  }
  assert.equal(new Set(ids).size, 7);
});

test('source parsing never invents absent metadata or treats an unmarked document as a labelled sample', () => {
  const source = { kind: 'COMPANY_POLICY', classification: 'DEMONSTRATION', sourceUse: 'DEMONSTRATION', filename: 'company-policies/a.docx' };
  const extraction = { blocks: [{ text: '1. An arbitrary real policy', section: null, page: null, type: 'paragraph' }] };
  const result = prepareCompanyExtraction(source, extraction);
  assert.equal(result.policySource.policyId, null); assert.equal(result.policySource.demonstrationNoticePresent, false);
  assert.deepEqual(result.blocks, extraction.blocks);
});

test('demo mode is explicit, disabled by default, and cannot be enabled in production', () => {
  const env = { NODE_ENV: 'test', JWT_SECRET: 'synthetic-demo-test-secret-32-characters' };
  assert.equal(parseConfig(env).ragDemonstrationEnabled, false);
  const config = parseConfig({ ...env, RAG_DEMONSTRATION_ENABLED: 'true' });
  assert.equal(config.ragDemonstrationEnabled, true); requireDemoMode(config);
  for (const config of [{}, { nodeEnv: 'production', ragDemonstrationEnabled: true }, { nodeEnv: 'development', ragDemonstrationEnabled: false }])
    assert.throws(() => requireDemoMode(config), { code: 'DEMONSTRATION_MODE_REQUIRED' });
  assert.throws(() => parseConfig({ NODE_ENV: 'production', RAG_DEMONSTRATION_ENABLED: 'true' }));
  assert.throws(() => parseConfig({ NODE_ENV: 'test', RAG_DEMONSTRATION_ENABLED: 'yes' }));
});
