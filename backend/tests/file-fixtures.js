import { crc32 } from 'node:zlib';

export const benignText = () => Buffer.from('Harmless synthetic file content.\n');
export const pdfFixture = () => Buffer.from('%PDF-1.4\n% Harmless signature fixture, not a complete PDF.\n%%EOF');
export function executableFixture() {
  const buffer = Buffer.alloc(128);
  buffer.write('MZ');
  buffer.writeUInt32LE(64, 60);
  buffer.write('PE\0\0', 64);
  return buffer; // No executable program or payload; header bytes only.
}
export function zipFixture(entries = [{ name: 'readme.txt', content: benignText() }]) {
  const locals = [];
  const directory = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = entry.content ?? Buffer.from('synthetic');
    const stored = entry.encrypted ? Buffer.concat([Buffer.alloc(12), content]) : content;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.encrypted ? 1 : 0, 6);
    local.writeUInt32LE(crc32(content), 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(entry.expandedSize ?? content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.encrypted ? 1 : 0, 8);
    central.writeUInt32LE(crc32(content), 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(entry.expandedSize ?? content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, stored);
    directory.push(central, name);
    offset += local.length + name.length + stored.length;
  }
  const c = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(c.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, c, end]);
}
