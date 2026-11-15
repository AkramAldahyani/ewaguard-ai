import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('security tip bank is curated and shuffle cycles contain every tip once', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  t.after(() => server.close());
  const { securityTips, shuffleSecurityTips } = await server.ssrLoadModule('/src/data/security-tips.js');

  assert.ok(securityTips.length >= 60);
  assert.equal(new Set(securityTips.map((tip) => tip.id)).size, securityTips.length);
  assert.equal(new Set(securityTips.map((tip) => tip.text)).size, securityTips.length);
  for (const tip of securityTips) {
    assert.match(tip.id, /^security-tip-\d{3}$/);
    assert.ok(tip.category.trim());
    assert.ok(tip.text.trim());
  }

  const cycle = shuffleSecurityTips(() => 0.5);
  assert.equal(cycle.length, securityTips.length);
  assert.equal(new Set(cycle.map((tip) => tip.id)).size, securityTips.length);

  const nextCycle = shuffleSecurityTips(() => 0.5, cycle[cycle.length - 1].id);
  assert.notEqual(nextCycle[0].id, cycle[cycle.length - 1].id);
});

test('typewriter types, holds for reading, erases and then advances to the next tip', async () => {
  const { typewriterStep, typewriterHoldMs, TYPEWRITER_TIMING } =
    await import('../src/components/employee/typewriter.js');
  const text = 'Lock it, then go.';
  let state = { phase: 'typing', length: 0 };
  const typed = [];
  let step;
  while (state.phase === 'typing') {
    step = typewriterStep(state, text);
    typed.push(step.delay);
    state = step.next;
  }
  assert.equal(typed.length, text.length + 1);
  assert.equal(typed.at(-1), typewriterHoldMs(text), 'the completed sentence is held for its reading time');
  assert.ok(typed.slice(0, -1).every((delay) => delay >= TYPEWRITER_TIMING.typeMs));
  assert.equal(
    typed[8],
    TYPEWRITER_TIMING.typeMs + TYPEWRITER_TIMING.punctuationPauseMs,
    'a short pause follows punctuation',
  );
  assert.deepEqual(state, { phase: 'erasing', length: text.length });
  let erased = 0;
  while (state.length > 0) {
    step = typewriterStep(state, text);
    assert.equal(step.delay, TYPEWRITER_TIMING.eraseMs);
    state = step.next;
    erased++;
  }
  assert.equal(erased, text.length);
  step = typewriterStep(state, text);
  assert.equal(step.advance, true);
  assert.deepEqual(step.next, { phase: 'typing', length: 0 });
  assert.equal(typewriterHoldMs('Short.'), TYPEWRITER_TIMING.minHoldMs);
  assert.equal(typewriterHoldMs('word '.repeat(60)), TYPEWRITER_TIMING.maxHoldMs);
});
