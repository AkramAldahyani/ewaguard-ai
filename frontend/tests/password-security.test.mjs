import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { analyzePassword, evaluatePolicy, PASSWORD_POLICY } from '../src/features/password/password-policy.js';
import { generatePassword } from '../src/features/password/password-generator.js';

const deterministicCrypto = { calls: 0, next: 0, getRandomValues(array) { this.calls += 1; for (let index = 0; index < array.length; index += 1) array[index] = this.next++ % 251; return array; } };

test('zxcvbn distinguishes weak and stronger passwords without absolute claims', () => {
  const weak = analyzePassword('password');
  const strong = analyzePassword('Violet!Orbit7-Cedar#Glass92');
  assert.ok(weak.score <= 1);
  assert.ok(strong.score > weak.score);
  assert.match(strong.strength.label, /Strong|Very strong/);
});

test('policy requirements and changed policy are evaluated centrally', () => {
  const failed = evaluatePolicy('short');
  assert.equal(failed.compliant, false);
  assert.ok(failed.failedRequirements.includes(`At least ${PASSWORD_POLICY.minLength} characters`));
  const custom = { minLength: 6, maxLength: 20, requireUppercase: false, requireLowercase: true, requireNumber: false, requireSymbol: false };
  assert.equal(evaluatePolicy('abcdef', custom).compliant, true);
  assert.equal(evaluatePolicy('abc', custom).compliant, false);
});

test('generated passwords meet length and enabled organization requirements', () => {
  deterministicCrypto.calls = 0; deterministicCrypto.next = 0;
  const password = generatePassword({ length: 32, uppercase: true, lowercase: true, numbers: true, symbols: true }, PASSWORD_POLICY, deterministicCrypto);
  assert.equal(password.length, 32);
  assert.match(password, /[A-Z]/); assert.match(password, /[a-z]/); assert.match(password, /[0-9]/); assert.match(password, /[^A-Za-z0-9\s]/);
  assert.equal(evaluatePolicy(password).compliant, true);
  assert.ok(deterministicCrypto.calls > 0);
});

test('generator rejects insecure providers and options that violate policy', () => {
  assert.throws(() => generatePassword(undefined, PASSWORD_POLICY, {}), /Secure password generation/);
  assert.throws(() => generatePassword({ length: 20, uppercase: true, lowercase: true, numbers: true, symbols: false }, PASSWORD_POLICY, deterministicCrypto), /organization-required/);
});

test('analysis and generation have no network, storage, or logging side effects', () => {
  const original = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, log: console.log, info: console.info, warn: console.warn, error: console.error };
  const calls = [];
  globalThis.fetch = (...args) => calls.push(['fetch', args]);
  globalThis.localStorage = { setItem: (...args) => calls.push(['localStorage', args]) };
  globalThis.sessionStorage = { setItem: (...args) => calls.push(['sessionStorage', args]) };
  for (const method of ['log', 'info', 'warn', 'error']) console[method] = (...args) => calls.push([method, args]);
  try {
    analyzePassword('Sensitive-Test-Value!42');
    generatePassword(undefined, PASSWORD_POLICY, deterministicCrypto);
    assert.deepEqual(calls, []);
  } finally {
    globalThis.fetch = original.fetch; globalThis.localStorage = original.localStorage; globalThis.sessionStorage = original.sessionStorage;
    console.log = original.log; console.info = original.info; console.warn = original.warn; console.error = original.error;
  }
});

test('password module source excludes persistence, transport, logging, and weak randomness', async () => {
  const sources = await Promise.all(['password-policy.js', 'password-generator.js', 'PasswordSecurityPage.jsx'].map((name) => readFile(new URL(`../src/features/password/${name}`, import.meta.url), 'utf8')));
  const implementation = sources.join('\n');
  for (const forbidden of ['Math' + '.random', 'local' + 'Storage', 'session' + 'Storage', 'fetch' + '(', 'console' + '.log', 'console' + '.info', 'console' + '.warn', 'console' + '.error']) assert.equal(implementation.includes(forbidden), false, forbidden);
});
