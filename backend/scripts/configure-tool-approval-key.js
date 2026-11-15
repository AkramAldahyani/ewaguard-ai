import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

// Local setup only; deployment injects this secret through its secret manager.
// Never print, replace or rotate an existing nonempty key.
const file = new URL('../../.env', import.meta.url);
const contents = await readFile(file, 'utf8');
if (process.env.NODE_ENV === 'production' || /^NODE_ENV\s*=\s*production\s*$/m.test(contents)) {
  throw new Error('Use deployment secret management for production.');
}
const entries = [...contents.matchAll(/^TOOL_APPROVAL_ENCRYPTION_KEY=([^\r\n]*)/gm)];
if (entries.length > 1) throw new Error('Resolve duplicate approval-key settings before setup.');
if (entries[0]?.[1].trim()) {
  if (!/^[a-f0-9]{64}$/i.test(entries[0][1].trim()))
    throw new Error('Existing approval key is invalid; it has not been replaced.');
  console.info('Existing approval key retained.');
} else {
  const line = `TOOL_APPROVAL_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`;
  const updated = entries.length
    ? contents.replace(/^TOOL_APPROVAL_ENCRYPTION_KEY=[^\r\n]*/m, line)
    : `${contents.trimEnd()}\n\n${line}\n`;
  await writeFile(file, updated, { encoding: 'utf8', mode: 0o600 });
  console.info('Dedicated approval key configured in the local .env. Restart the backend to load it.');
}
