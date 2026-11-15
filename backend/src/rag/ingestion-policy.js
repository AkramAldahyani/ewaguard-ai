export const INGESTION_VERSION = 'rag-ingestion-v1';
export const LIMITS = Object.freeze({
  bytes: 10 * 1024 * 1024,
  text: 2_000_000,
  pages: 500,
  entries: 200,
  expandedBytes: 50 * 1024 * 1024,
  xmlBytes: 8 * 1024 * 1024,
  timeoutMs: 30_000,
  chunks: 5000,
  chunkChars: 1600,
  overlapChars: 200,
});

export class IngestionError extends Error {
  constructor(code) {
    super('Knowledge document ingestion could not be completed.');
    this.code = code;
  }
}

export function normalizeText(text) {
  return (
    text
      .normalize('NFC')
      .replace(/\r\n?/g, '\n')
      // Remove non-text control bytes while retaining line breaks and tabs.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim()
  );
}
