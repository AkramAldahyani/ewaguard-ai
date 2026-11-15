import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createImageProcessor } from '../src/community/image-processing.js';
import { mediaPolicy } from '../src/community/media-policy.js';
import { createMediaStore } from '../src/community/media-store.js';

const policy = mediaPolicy({});
const clean = { clamav: async () => ({ status: 'CLEAN' }), yara: async () => ({ status: 'NO_MATCH' }) };
const make = (format = 'png') =>
  sharp({ create: { width: 40, height: 30, channels: 3, background: '#1488aa' } })
    .toFormat(format)
    .toBuffer();
const upload = (buffer, format = 'png') => ({
  originalname: `photo.${format}`,
  mimetype: `image/${format === 'jpg' ? 'jpeg' : format}`,
  buffer,
});

test('image pipeline fully decodes JPG/PNG/WebP, strips metadata, scans original and output', async () => {
  for (const format of ['jpeg', 'png', 'webp']) {
    const calls = [];
    const processor = createImageProcessor({}, policy, {
      scanners: {
        clamav: async () => {
          calls.push('clam');
          return { status: 'CLEAN' };
        },
        yara: async () => {
          calls.push('yara');
          return { status: 'NO_MATCH' };
        },
      },
    });
    const original = await make(format);
    const result = await processor(upload(original, format));
    assert.deepEqual(calls, ['clam', 'yara', 'clam', 'yara']);
    assert.ok(original.every((byte) => byte === 0));
    const info = await sharp(result.buffer).metadata();
    assert.equal(info.format, 'png');
    assert.equal(info.width, 40);
    assert.equal(info.height, 30);
    assert.equal(info.exif, undefined);
    assert.equal(info.icc, undefined);
    assert.equal(result.evidence.originalScanned, true);
    assert.equal(result.evidence.normalizedScanned, true);
  }
});

test('scanner findings, unavailable coverage, malformed files, paths, MIME and pixel limits fail closed', async () => {
  for (const status of ['UNAVAILABLE', 'ERROR', 'TIMEOUT', 'DETECTED']) {
    const processor = createImageProcessor({}, policy, { scanners: { ...clean, clamav: async () => ({ status }) } });
    await assert.rejects(processor(upload(await make())), {
      code: status === 'DETECTED' ? 'COMMUNITY_IMAGE_DETECTED' : 'COMMUNITY_IMAGE_SCANNERS_UNAVAILABLE',
    });
  }
  const yaraMatch = createImageProcessor({}, policy, {
    scanners: { ...clean, yara: async () => ({ status: 'MATCH' }) },
  });
  await assert.rejects(yaraMatch(upload(await make())), { code: 'COMMUNITY_IMAGE_DETECTED' });
  const processor = createImageProcessor({}, policy, { scanners: clean });
  for (const value of [
    { ...upload(await make()), originalname: '../image.png' },
    { ...upload(await make()), mimetype: 'image/jpeg' },
    upload(Buffer.from('<svg onload="evil()"/>')),
    upload(Buffer.from('89504e470d0a1a0a', 'hex')),
    { ...upload(await make()), originalname: 'video.mp4', mimetype: 'video/mp4' },
    upload(Buffer.alloc(policy.maxBytes + 1)),
  ])
    await assert.rejects(processor(value), { code: 'COMMUNITY_IMAGE_INVALID' });
  await assert.rejects(
    createImageProcessor({}, { ...policy, maxPixels: 10 }, { scanners: clean })(upload(await make())),
    { code: 'COMMUNITY_IMAGE_INVALID' },
  );
});

test('private store uses opaque keys, rejects traversal and detects tampering', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ewaguard-media-unit-'));
  try {
    const store = createMediaStore(root);
    const image = await createImageProcessor({}, policy, { scanners: clean })(upload(await make()));
    const key = await store.write(image.buffer);
    assert.match(key, /^[a-f0-9-]+\.png$/);
    assert.deepEqual(await store.read(key, image.sha256, image.sizeBytes), image.buffer);
    await assert.rejects(store.read('../escape', image.sha256, image.sizeBytes));
    await writeFile(path.join(root, key), Buffer.alloc(Number(image.sizeBytes), 1));
    await assert.rejects(store.read(key, image.sha256, image.sizeBytes));
    await store.remove(key);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
