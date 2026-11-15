// Explicit harmless local-tool verification. No provider calls, no database writes.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseConfig } from '../src/config/env.js';
import { createFileScanners } from '../src/analyzers/file/file-scanners.js';
import { createFileTempStore } from '../src/analyzers/file/file-temp.js';
import { createFileAnalyzer } from '../src/analyzers/file/file-analyzer.js';
import { createThreatIntelligence } from '../src/services/threat-intelligence.js';

const config = parseConfig();
const scanners = createFileScanners(config);
const tempStore = createFileTempStore();
const analyzer = createFileAnalyzer({ scanners, tempStore, threatIntelligence: createThreatIntelligence() });
const result = await analyzer({
  originalname: 'harmless.txt',
  mimetype: 'text/plain',
  buffer: Buffer.from('EWAGuard harmless file analyzer verification.\n'),
});
assert.equal(result.clamav.status, 'CLEAN');
assert.equal(result.yara.status, 'NO_MATCH');
const demo = await tempStore.withFile(Buffer.from('EWAGUARD_YARA_DEMO_6C HARMLESS_STATIC_TEST'), (file) =>
  scanners.yara(file),
);
assert.equal(demo.status, 'MATCH');
assert.ok(demo.matches.some((match) => match.name === 'EWAGuard_Harmless_Demo'));
const invalid = await tempStore.withFile(Buffer.from('Harmless syntax-validation target'), async (file) => {
  const rules = path.join(file.directory, 'invalid.yar');
  await writeFile(rules, 'rule invalid { condition: }', { flag: 'wx', mode: 0o600 });
  return createFileScanners({ ...config, yaraRulesPath: rules }).yara(file);
});
assert.equal(invalid.status, 'ERROR');
console.info(
  JSON.stringify({
    clamav: result.clamav.status,
    yaraBenign: result.yara.status,
    yaraHarmlessDemo: demo.status,
    invalidRules: invalid.status,
    temporaryCleanup: 'COMPLETED',
  }),
);
