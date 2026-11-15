import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;
export function createMediaStore(root) {
  const absolute = path.resolve(root);
  const target = (key) => {
    if (!keyPattern.test(key)) throw new Error('Invalid media key');
    return path.join(absolute, key);
  };
  async function prepare() {
    await fs.mkdir(absolute, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(absolute);
    const compare = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
    if (!stat.isDirectory() || stat.isSymbolicLink() || compare(await fs.realpath(absolute)) !== compare(absolute))
      throw new Error('Invalid media store');
    if (process.platform !== 'win32') {
      if (stat.uid !== process.getuid()) throw new Error('Invalid media owner');
      await fs.chmod(absolute, 0o700);
    }
  }
  return {
    async write(buffer) {
      await prepare();
      const key = `${randomUUID()}.png`;
      try {
        await fs.writeFile(target(key), buffer, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        await fs.unlink(target(key)).catch(() => {});
        throw error;
      }
      return key;
    },
    async read(key, digest, expectedSize) {
      await prepare();
      const name = target(key);
      const stat = await fs.lstat(name);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024 || stat.size !== Number(expectedSize))
        throw new Error('Invalid media object');
      const handle = await fs.open(name, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const buffer = await handle.readFile();
        if (buffer.length !== Number(expectedSize) || createHash('sha256').update(buffer).digest('hex') !== digest)
          throw new Error('Media integrity failure');
        return buffer;
      } finally {
        await handle.close();
      }
    },
    async remove(key) {
      await prepare();
      const name = target(key);
      try {
        const stat = await fs.lstat(name);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid media object');
        await fs.unlink(name);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
    async *stale(now) {
      await prepare();
      const directory = await fs.opendir(absolute);
      for await (const entry of directory) {
        if (!entry.isFile() || !keyPattern.test(entry.name)) continue;
        const stat = await fs.lstat(target(entry.name));
        if (stat.mtimeMs < now.getTime() - 86400000) yield entry.name;
      }
    },
  };
}
