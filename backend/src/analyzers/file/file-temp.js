import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FILE_TEMP_ROOT, FileAnalysisError } from './file-policy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function createFileTempStore(root = FILE_TEMP_ROOT, io = fs) {
  const absoluteRoot = path.resolve(root);
  const prepare = async () => {
    await io.mkdir(absoluteRoot, { recursive: true, mode: 0o700 });
    const stat = await io.lstat(absoluteRoot);
    const compare = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      compare(path.resolve(await io.realpath(absoluteRoot))) !== compare(absoluteRoot)
    )
      throw new Error('Invalid temporary directory');
    if (process.platform !== 'win32') {
      if (stat.uid !== process.getuid()) throw new Error('Invalid temporary directory owner');
      await io.chmod(absoluteRoot, 0o700);
    }
  };
  const remove = async (directory) => {
    // Only direct UUID children of this verified application root are removable.
    if (path.dirname(directory) !== absoluteRoot || !UUID.test(path.basename(directory)))
      throw new Error('Invalid cleanup target');
    try {
      const stat = await io.lstat(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Invalid cleanup target');
      await io.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
  return {
    withFile: async (buffer, operation) => {
      await prepare();
      const directory = path.join(absoluteRoot, randomUUID());
      await io.mkdir(directory, { mode: 0o700 });
      try {
        const filename = path.join(directory, `${randomUUID()}.upload`);
        await io.writeFile(filename, buffer, { flag: 'wx', mode: 0o600 });
        return await operation({ filename, directory });
      } finally {
        try {
          await remove(directory);
        } catch {
          console.error(JSON.stringify({ level: 'ERROR', event: 'file_temp_cleanup_failed' }));
          // Cleanup failure deliberately supersedes scan errors: no result may
          // be persisted while a temporary copy might still remain.
          // eslint-disable-next-line no-unsafe-finally
          throw new FileAnalysisError('FILE_CLEANUP_FAILED');
        }
      }
    },
    cleanupStale: async (now = Date.now()) => {
      try {
        await prepare();
        for (const entry of await io.readdir(absoluteRoot, { withFileTypes: true })) {
          if (!UUID.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
          const directory = path.join(absoluteRoot, entry.name);
          if ((await io.lstat(directory)).mtimeMs < now - 24 * 60 * 60_000) await remove(directory);
        }
        return true;
      } catch {
        console.error(JSON.stringify({ level: 'ERROR', event: 'file_stale_cleanup_failed' }));
        return false;
      }
    },
  };
}
