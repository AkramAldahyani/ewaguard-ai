import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { createFileScanners } from '../analyzers/file/file-scanners.js';
import { createFileTempStore } from '../analyzers/file/file-temp.js';
import { CommunityMediaError, IMAGE_PIPELINE } from './media-policy.js';

const invalid = () => {
  throw new CommunityMediaError(
    400,
    'COMMUNITY_IMAGE_INVALID',
    'Choose a valid, non-animated JPG, PNG, or WebP image within the upload limits.',
  );
};
const formats = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp' };
export function createImageProcessor(
  config,
  policy,
  { scanners = createFileScanners(config), tempStore = createFileTempStore() } = {},
) {
  async function scan(buffer) {
    const results = await tempStore.withFile(buffer, async (file) => ({
      clamav: await scanners.clamav(file),
      yara: await scanners.yara(file),
    }));
    if (results.clamav.status === 'DETECTED' || results.yara.status === 'MATCH')
      throw new CommunityMediaError(
        422,
        'COMMUNITY_IMAGE_DETECTED',
        'An image triggered a security check. It cannot be uploaded. Contact IT/security through the approved reporting process.',
      );
    if (results.clamav.status !== 'CLEAN' || results.clamav.coverageLimited || results.yara.status !== 'NO_MATCH')
      throw new CommunityMediaError(
        503,
        'COMMUNITY_IMAGE_SCANNERS_UNAVAILABLE',
        'Required image security checks could not complete. Try again later or submit without images.',
      );
  }
  return async (upload) => {
    let normalized;
    try {
      if (
        !Buffer.isBuffer(upload.buffer) ||
        !upload.buffer.length ||
        upload.buffer.length > policy.maxBytes ||
        typeof upload.originalname !== 'string' ||
        upload.originalname.length > 200 ||
        /[\\/\p{Cc}\p{Cf}]/u.test(upload.originalname)
      )
        invalid();
      const extension = upload.originalname.match(/\.([a-z]+)$/i)?.[1].toLowerCase();
      const format = formats[extension];
      if (!format || upload.mimetype !== `image/${format}`) invalid();
      // Restrict magic bytes before a decoder is invoked: no SVG or document input.
      const magic = upload.buffer.subarray(0, 12);
      if (!(
        (format === 'jpeg' && magic.subarray(0, 3).toString('hex') === 'ffd8ff') ||
        (format === 'png' && magic.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') ||
        (format === 'webp' && magic.subarray(0, 4).toString() === 'RIFF' && magic.subarray(8, 12).toString() === 'WEBP')
      ))
        invalid();
      await scan(upload.buffer);
      try {
        const image = sharp(upload.buffer, {
          failOn: 'warning',
          limitInputPixels: policy.maxPixels,
          sequentialRead: true,
        });
        const metadata = await image.metadata();
        if (
          metadata.format !== format ||
          (metadata.pages ?? 1) !== 1 ||
          !metadata.width ||
          !metadata.height ||
          metadata.width * metadata.height > policy.maxPixels
        )
          invalid();
        // Re-encoding strips metadata and trailing content; originals are never served.
        normalized = await image
          .rotate()
          .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
          .png({ compressionLevel: 6 })
          .timeout({ seconds: 15 })
          .toBuffer({ resolveWithObject: true });
      } catch {
        invalid();
      }
      if (normalized.data.length > policy.maxOutputBytes) invalid();
      await scan(normalized.data);
      return {
        buffer: normalized.data,
        sha256: createHash('sha256').update(normalized.data).digest('hex'),
        sizeBytes: BigInt(normalized.data.length),
        evidence: {
          pipeline: IMAGE_PIPELINE,
          originalScanned: true,
          normalizedScanned: true,
          width: normalized.info.width,
          height: normalized.info.height,
        },
      };
    } catch (error) {
      normalized?.data.fill(0);
      throw error;
    } finally {
      upload.buffer?.fill(0);
    }
  };
}
