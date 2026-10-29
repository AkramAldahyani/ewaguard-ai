import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPdplDefinitionQuestion } from '../src/rag/retrieval-store.js';

test('PDPL definition routing recognizes the reported wording and preserves specific topic searches', () => {
  for (const question of ['What does the Bahrain PDPL say about personal data?',
    'What does Bahrain law say about sensitive personal data?', 'What is personal data?',
    'What does Bahrain PDPL mean by personal data?']) {
    assert.equal(isPdplDefinitionQuestion(question), true, question);
  }
  for (const question of ['What does Bahrain PDPL say about personal data transfers?',
    'Explain Article 22.', 'What does the PDPL say about penalties?', 'Tell me about yourself']) {
    assert.equal(isPdplDefinitionQuestion(question), false, question);
  }
});
