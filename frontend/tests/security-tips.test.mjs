import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('security tip bank is curated and shuffle cycles contain every tip once', async (t) => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
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
