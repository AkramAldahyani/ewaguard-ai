import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { LIMITS, INGESTION_VERSION, IngestionError } from './ingestion-policy.js';
import { extractDocument } from './extract-document.js';
import { chunkDocument } from './chunk-document.js';
import { preparePdplExtraction } from './pdpl-source.js';
import { prepareCompanyExtraction } from './company-source.js';

export const KNOWLEDGE_ROOT = fileURLToPath(new URL('../../data/knowledge-base/', import.meta.url));
const fields = ['documentKey', 'title', 'filename', 'kind', 'version', 'classification', 'sourceUse'];
export function validateManifest(manifest) {
  if (
    !manifest ||
    Object.keys(manifest).join() !== 'documents' ||
    !Array.isArray(manifest.documents) ||
    !manifest.documents.length ||
    manifest.documents.length > 100
  )
    throw new IngestionError('INVALID_MANIFEST');
  const identities = new Set();
  const filenames = new Set();
  return manifest.documents.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      fields.some((key) => !Object.hasOwn(entry, key)) ||
      Object.keys(entry).some((key) => !fields.includes(key)) ||
      typeof entry.documentKey !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{0,99}$/.test(entry.documentKey) ||
      typeof entry.title !== 'string' ||
      !entry.title.trim() ||
      entry.title.length > 240 ||
      /[\p{Cc}\p{Cf}]/u.test(entry.title) ||
      typeof entry.filename !== 'string' ||
      !/^(?:pdpl|company-policies)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(pdf|docx)$/.test(entry.filename) ||
      !['PDPL', 'COMPANY_POLICY'].includes(entry.kind) ||
      !Number.isSafeInteger(entry.version) ||
      entry.version < 1 ||
      entry.version > 2147483647 ||
      !['DEMONSTRATION', 'PRODUCTION'].includes(entry.classification) ||
      !(entry.kind === 'PDPL'
        ? entry.filename.startsWith('pdpl/') &&
          entry.sourceUse === 'PUBLIC_LEGISLATION' &&
          entry.classification === 'PRODUCTION'
        : entry.filename.startsWith('company-policies/') &&
          entry.sourceUse === 'DEMONSTRATION' &&
          entry.classification === 'DEMONSTRATION')
    )
      throw new IngestionError('INVALID_MANIFEST');
    const identity = `${entry.kind}:${entry.documentKey}:${entry.version}`;
    if (identities.has(identity) || filenames.has(entry.filename.toLowerCase()))
      throw new IngestionError('DUPLICATE_SOURCE');
    identities.add(identity);
    filenames.add(entry.filename.toLowerCase());
    return Object.fromEntries(fields.map((key) => [key, entry[key]]));
  });
}

export async function readLocalFile(root, relative, maxBytes = LIMITS.bytes) {
  const canonicalRoot = await realpath(root);
  const resolved = await realpath(path.resolve(canonicalRoot, relative));
  const within = path.relative(canonicalRoot, resolved);
  if (!within || within.startsWith('..') || path.isAbsolute(within)) throw new IngestionError('SOURCE_OUTSIDE_ROOT');
  const handle = await open(resolved, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) throw new IngestionError('INVALID_FILE_SIZE');
    // Bound the actual read too, in case a local operator changes the file concurrently.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, maxBytes + 1));
    let size = 0;
    while (size < buffer.length) {
      const read = await handle.read(buffer, size, buffer.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size !== stat.size) throw new IngestionError('SOURCE_CHANGED_DURING_READ');
    return buffer.subarray(0, size);
  } finally {
    await handle.close();
  }
}

export async function loadLocalManifest(root = KNOWLEDGE_ROOT) {
  const bytes = await readLocalFile(root, 'manifest.json', 128 * 1024);
  try {
    return validateManifest(JSON.parse(bytes.toString('utf8')));
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    throw new IngestionError('INVALID_MANIFEST');
  }
}

export async function prepareSource(entry, root = KNOWLEDGE_ROOT) {
  const source = validateManifest({ documents: [entry] })[0];
  const bytes = await readLocalFile(root, source.filename);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const format = path.extname(source.filename).slice(1);
  const extraction = await extractDocument(bytes, format);
  const legal = preparePdplExtraction(source, contentSha256, extraction);
  const { blocks, policySource } = prepareCompanyExtraction(source, { ...extraction, blocks: legal.blocks });
  const legalSource = legal.legalSource;
  const chunks = chunkDocument(blocks);
  const legalMetadata = { ...(legalSource ? { legalSource } : {}), ...(policySource ? { policySource } : {}) };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ source, contentSha256, pipeline: INGESTION_VERSION, ...legalMetadata }))
    .digest('hex');
  return {
    source,
    contentSha256,
    chunks,
    ingestionMetadata: {
      fingerprint,
      pipeline: INGESTION_VERSION,
      format,
      sourceUse: source.sourceUse,
      pageCount: extraction.pageCount,
      warnings: extraction.warnings,
      emptyPages: extraction.emptyPages ?? [],
      blockCount: blocks.length,
      chunkCount: chunks.length,
      ...legalMetadata,
      externalProcessingPerformed: false,
      referenceTrust: 'UNTRUSTED',
    },
  };
}
