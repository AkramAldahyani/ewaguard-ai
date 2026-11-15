import { PASSWORD_POLICY, evaluatePolicy } from './password-policy.js';

export const CHARACTER_SETS = Object.freeze({
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lowercase: 'abcdefghijkmnopqrstuvwxyz',
  numbers: '23456789',
  symbols: '!@#$%^&*()-_=+[]{}:,.?',
});

export const DEFAULT_GENERATOR_OPTIONS = Object.freeze({
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
});

function secureIndex(max, cryptoProvider) {
  if (!cryptoProvider?.getRandomValues) throw new Error('Secure password generation is unavailable in this browser.');
  const limit = 256 - (256 % max);
  const bytes = new Uint8Array(1);
  do cryptoProvider.getRandomValues(bytes);
  while (bytes[0] >= limit);
  return bytes[0] % max;
}

function secureShuffle(characters, cryptoProvider) {
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = secureIndex(index + 1, cryptoProvider);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters;
}

export function generatePassword(
  options = DEFAULT_GENERATOR_OPTIONS,
  policy = PASSWORD_POLICY,
  cryptoProvider = globalThis.crypto,
) {
  const length = Number(options.length);
  if (!Number.isInteger(length) || length < policy.minLength || length > policy.maxLength) {
    throw new Error(`Choose a length from ${policy.minLength} to ${policy.maxLength} characters.`);
  }
  const enabled = Object.entries(CHARACTER_SETS).filter(([name]) => options[name]);
  if (!enabled.length) throw new Error('Select at least one character type.');
  const required = [
    ['uppercase', policy.requireUppercase],
    ['lowercase', policy.requireLowercase],
    ['numbers', policy.requireNumber],
    ['symbols', policy.requireSymbol],
  ];
  if (required.some(([name, isRequired]) => isRequired && !options[name])) {
    throw new Error('Selected options must include every organization-required character type.');
  }
  if (length < enabled.length) throw new Error('Length is too short for the selected character types.');

  const pool = enabled.map(([, characters]) => characters).join('');
  const characters = enabled.map(([, set]) => set[secureIndex(set.length, cryptoProvider)]);
  while (characters.length < length) characters.push(pool[secureIndex(pool.length, cryptoProvider)]);
  const password = secureShuffle(characters, cryptoProvider).join('');
  if (!evaluatePolicy(password, policy).compliant)
    throw new Error('Secure generation could not satisfy the configured policy.');
  return password;
}
