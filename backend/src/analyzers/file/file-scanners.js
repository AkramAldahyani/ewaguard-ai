import { execFile } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { FILE_LIMITS } from './file-policy.js';

const ruleInfo = Object.freeze({
  EWAGuard_Encoded_PowerShell_Chain: ['WARNING', 'PowerShell encoding appears with execution-obscuring options.'],
  EWAGuard_Credential_Collection_Chain: ['STRONG', 'Credential-store access, decryption, and transfer markers occur together.'],
  EWAGuard_Macro_Launch_Chain: ['WARNING', 'Automatic macro and scripting-shell launch markers occur together.'],
  EWAGuard_Archive_Launch_Chain: ['WARNING', 'Archive expansion, process launch, and temporary-directory markers occur together.'],
  EWAGuard_Harmless_Demo: ['DEMO', 'Harmless EWAGuard test markers matched; this rule is not a malware signature.'],
});

export function runScanner(executable, args, { timeoutMs, directory }, execute = execFile) {
  if (!executable || !path.isAbsolute(executable) || /\.(?:cmd|bat|ps1|sh|js|py)$/i.test(executable)) return Promise.resolve({ status: 'UNAVAILABLE' });
  return new Promise((resolve) => {
    execute(executable, args, { shell: false, windowsHide: true, timeout: timeoutMs, killSignal: 'SIGKILL',
      maxBuffer: FILE_LIMITS.scannerOutputBytes, encoding: 'utf8', cwd: directory,
      // Scanner children never inherit API keys, JWT secrets or database credentials.
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: directory, TMP: directory, TMPDIR: directory },
    }, (error, stdout, stderr) => {
      if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return resolve({ status: 'ERROR' });
      if (error?.killed || error?.signal === 'SIGKILL') return resolve({ status: 'TIMEOUT' });
      if (error && ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code)) return resolve({ status: 'UNAVAILABLE' });
      if (error && typeof error.code !== 'number') return resolve({ status: 'ERROR' });
      resolve({ status: 'COMPLETED', exitCode: error?.code ?? 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

export function normalizeClamav(run, filename) {
  if (run.status !== 'COMPLETED') return { status: run.status, detections: [] };
  if (![0, 1].includes(run.exitCode)) return { status: 'ERROR', detections: [] };
  const names = run.stdout.split(/\r?\n/).filter((line) => line.startsWith(`${filename}: `) && line.endsWith(' FOUND'))
    .map((line) => line.slice(filename.length + 2, -6));
  const limited = names.some((name) => /^Heuristics\.(?:Limits\.Exceeded|Encrypted)/.test(name));
  const detections = [...new Set(names.filter((name) => !/^Heuristics\.(?:Limits\.Exceeded|Encrypted)/.test(name)))]
    .slice(0, 10).map((name) => /^[a-z0-9][a-z0-9_.:+-]{0,119}$/i.test(name) ? name : 'Unspecified detection');
  if (run.exitCode === 1 && detections.length) return { status: 'DETECTED', detections, coverageLimited: limited };
  if (limited) return { status: 'ERROR', detections: [], reason: 'SCAN_COVERAGE_LIMIT' };
  if (run.exitCode === 1 || /\bERROR\b/.test(run.stderr + run.stdout)) return { status: 'ERROR', detections: [] };
  return { status: 'CLEAN', detections: [] };
}

export function normalizeYara(run, filename) {
  if (run.status !== 'COMPLETED') return { status: run.status, matches: [] };
  if (run.exitCode !== 0) return { status: /timeout|timed out/i.test(run.stderr) ? 'TIMEOUT' : 'ERROR', matches: [] };
  const lines = run.stdout.split(/\r?\n/).filter(Boolean);
  const names = lines.map((line) => line.endsWith(` ${filename}`) ? line.slice(0, -filename.length - 1) : '');
  if (names.some((name) => !/^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/.test(name)) || names.length > 64) return { status: 'ERROR', matches: [] };
  const matches = [...new Set(names)].map((name) => {
    const [strength, description] = ruleInfo[name] ?? ['WARNING', 'A configured YARA rule matched. Review with IT/security.'];
    return { name, strength, description };
  });
  return { status: matches.length ? 'MATCH' : 'NO_MATCH', matches };
}

async function ruleFiles(rulesPath) {
  if (!rulesPath || !path.isAbsolute(rulesPath)) return [];
  const stat = await lstat(rulesPath);
  if (stat.isSymbolicLink()) return [];
  const candidates = stat.isDirectory() ? (await readdir(rulesPath)).filter((name) => /\.yar(?:a)?$/i.test(name)).sort().map((name) => path.join(rulesPath, name)) : [rulesPath];
  if (!candidates.length || candidates.length > 16) return [];
  let total = 0;
  for (const file of candidates) {
    const entry = await lstat(file);
    if (!entry.isFile() || entry.isSymbolicLink() || !/\.yar(?:a)?$/i.test(file) || entry.size > 128 * 1024) return [];
    total += entry.size;
  }
  return total <= 512 * 1024 ? candidates : [];
}

// At most one process and one waiter per scanner. Separate slots allow a YARA
// scan to run while another upload's ClamAV process loads its database.
function scannerSlot() {
  let tail = Promise.resolve(); let pending = 0;
  return async (operation, empty) => {
    if (pending >= 2) return { status: 'UNAVAILABLE', reason: 'BUSY', ...empty };
    pending++;
    const previous = tail;
    let release; tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { pending--; release(); }
  };
}

export function createFileScanners(config, runner = runScanner) {
  const clamSlot = scannerSlot(); const yaraSlot = scannerSlot();
  return {
    clamav: (file) => clamSlot(async () => normalizeClamav(await runner(config.clamavPath, [
      '--no-summary', '--stdout', '--infected', '--scan-archive=yes', '--alert-encrypted=yes', '--alert-exceeds-max=yes',
      '--max-filesize=10M', '--max-scansize=50M', '--max-files=200', '--max-recursion=8', '--max-scantime=30000',
      '--follow-dir-symlinks=0', '--follow-file-symlinks=0', `--tempdir=${file.directory}`, '--leave-temps=no', file.filename,
    ], { timeoutMs: FILE_LIMITS.clamavTimeoutMs, directory: file.directory }), file.filename), { detections: [] }),
    yara: (file) => yaraSlot(async () => {
      let rules;
      try { rules = await ruleFiles(config.yaraRulesPath); } catch { return { status: 'UNAVAILABLE', matches: [] }; }
      if (!rules.length) return { status: 'UNAVAILABLE', matches: [] };
      return normalizeYara(await runner(config.yaraPath, ['--timeout=10', '--no-follow-symlinks', '--max-strings-per-rule=1000',
        ...rules, file.filename], { timeoutMs: FILE_LIMITS.yaraTimeoutMs, directory: file.directory }), file.filename);
    }, { matches: [] }),
  };
}
