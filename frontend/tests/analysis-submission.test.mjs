import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSubmissionKey } from '../src/features/analysis-submission.js';
import { createUrlFlow } from '../src/features/url/url-state.js';
import { createFileFlow } from '../src/features/file/file-state.js';
import { createEmailFlow } from '../src/features/email/email-state.js';

test('submission keys reuse identical retries and distinguish edits and deliberate rescans', async () => {
  const keys = createSubmissionKey();
  const first = await keys.forInput('example');
  assert.equal(await keys.forInput('example'), first);
  assert.notEqual(await keys.forInput('different'), first);
  keys.clear();
  assert.notEqual(await keys.forInput('example'), first);
  const file = await keys.forInput(new File(['data'], 'test.txt'));
  assert.equal(await keys.forInput(new File(['data'], 'test.txt')), file);
  assert.notEqual(await keys.forInput(new File(['other'], 'test.txt')), file);
});

for (const type of ['URL', 'EMAIL', 'FILE'])
  test(`${type} flow retries with same key, then resets for a deliberate new scan`, async () => {
    const keys = [];
    const submit = async (_input, _signal, key) => {
      keys.push(key);
      if (keys.length === 1) throw new Error('network');
      return { analysisId: 'saved' };
    };
    const file = new File(['test'], 'test.txt');
    const flow =
      type === 'URL'
        ? createUrlFlow(submit)
        : type === 'FILE'
          ? createFileFlow(submit)
          : createEmailFlow({ analyzePastedEmail: submit });
    const fill = () => {
      if (type === 'URL') flow.edit('https://example.com');
      else if (type === 'FILE') flow.selectFiles([file]);
      else {
        flow.acknowledge();
        flow.edit('body', 'Hello colleague');
      }
    };
    fill();
    await flow.submit();
    fill();
    await flow.submit();
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    flow.reset();
    fill();
    await flow.submit();
    assert.notEqual(keys[2], keys[1]);
  });
