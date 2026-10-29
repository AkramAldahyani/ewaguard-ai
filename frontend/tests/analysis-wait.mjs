import assert from 'node:assert/strict';
export async function waitForSubmission(condition) {
  const deadline = Date.now() + 2000;
  while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(condition(), 'Submission should start after its digest is computed');
}
