import { parentPort, workerData } from 'node:worker_threads';
import yauzl from 'yauzl';
import { SaxesParser } from 'saxes';
import { inspectFile } from '../analyzers/file/file-inspection.js';
import { LIMITS, IngestionError, normalizeText } from './ingestion-policy.js';

function readDocumentXml(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(new IngestionError('INVALID_DOCX'));
      let xml;
      let count = 0;
      let expanded = 0;
      let ended = false;
      const names = new Set();
      const fail = () => {
        if (ended) return;
        ended = true;
        zip.close();
        reject(new IngestionError('INVALID_DOCX'));
      };
      zip.on('error', fail);
      zip.on('end', () => {
        if (ended) return;
        ended = true;
        if (!xml || !names.has('[Content_Types].xml')) reject(new IngestionError('INVALID_DOCX'));
        else resolve(xml);
      });
      zip.on('entry', (entry) => {
        count++;
        expanded += entry.uncompressedSize;
        if (
          names.has(entry.fileName) ||
          count > LIMITS.entries ||
          expanded > LIMITS.expandedBytes ||
          entry.generalPurposeBitFlag & 1 ||
          /(?:^|\/)vbaProject\.bin$/i.test(entry.fileName)
        )
          return fail();
        names.add(entry.fileName);
        if (entry.fileName !== 'word/document.xml') return zip.readEntry();
        if (entry.uncompressedSize > LIMITS.xmlBytes) return fail();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return fail();
          const parts = [];
          let size = 0;
          stream.on('error', fail);
          stream.on('data', (part) => {
            size += part.length;
            if (size > LIMITS.xmlBytes) {
              stream.destroy();
              fail();
            } else parts.push(part);
          });
          stream.on('end', () => {
            if (ended) return;
            try {
              xml = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts));
            } catch {
              fail();
              return;
            }
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

async function docx(buffer) {
  const xml = await readDocumentXml(buffer);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new IngestionError('UNSUPPORTED_XML');
  const blocks = [];
  let paragraph = null;
  let inText = false;
  let section = null;
  let ignored = 0;
  const parser = new SaxesParser();
  parser.on('opentag', ({ name, attributes: attrs }) => {
    if (['w:del', 'w:moveFrom'].includes(name)) ignored++;
    if (ignored) return;
    if (name === 'w:p') paragraph = { text: '', heading: false };
    if (!paragraph) return;
    if (name === 'w:pStyle' && /^(?:heading[1-9]|title)$/i.test(attrs['w:val'] ?? '')) paragraph.heading = true;
    if (name === 'w:outlineLvl' && /^[0-8]$/.test(attrs['w:val'] ?? '')) paragraph.heading = true;
    if (name === 'w:t') inText = true;
    if (['w:tab', 'w:br', 'w:cr'].includes(name)) paragraph.text += '\n';
  });
  parser.on('text', (text) => {
    if (!ignored && inText && paragraph) paragraph.text += text;
  });
  parser.on('closetag', ({ name }) => {
    if (['w:del', 'w:moveFrom'].includes(name)) {
      ignored--;
      return;
    }
    if (ignored) return;
    if (name === 'w:t') inText = false;
    if (name === 'w:p' && paragraph) {
      const text = normalizeText(paragraph.text);
      if (text) {
        if (paragraph.heading) section = text;
        blocks.push({ text, page: null, section, type: paragraph.heading ? 'heading' : 'paragraph' });
      }
      paragraph = null;
    }
  });
  parser.write(xml).close();
  return { blocks, pageCount: null, warnings: ['DOCX_PAGE_NUMBERS_UNAVAILABLE', 'DOCX_BODY_TEXT_ONLY'] };
}

async function pdf(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  const passwordRejected = new Promise((_, reject) => {
    loading.onPassword = () => reject(new IngestionError('ENCRYPTED_PDF'));
  });
  let document;
  try {
    document = await Promise.race([loading.promise, passwordRejected]);
    if (document.numPages > LIMITS.pages) throw new IngestionError('PAGE_LIMIT');
    const blocks = [];
    const emptyPages = [];
    let total = 0;
    for (let page = 1; page <= document.numPages; page++) {
      const handle = await document.getPage(page);
      const content = await handle.getTextContent();
      let text = '';
      for (const item of content.items) if (typeof item.str === 'string') text += item.str + (item.hasEOL ? '\n' : ' ');
      text = normalizeText(text);
      total += text.length;
      if (total > LIMITS.text) throw new IngestionError('TEXT_LIMIT');
      if (text) blocks.push({ text, page, section: null, type: 'page' });
      else emptyPages.push(page);
      handle.cleanup();
    }
    return {
      blocks,
      pageCount: document.numPages,
      warnings: emptyPages.length ? ['PDF_PAGES_WITHOUT_TEXT'] : [],
      emptyPages,
    };
  } finally {
    await loading.destroy();
  }
}

try {
  const buffer = Buffer.from(workerData.bytes);
  const inspection = await inspectFile({ originalname: `source.${workerData.format}`, buffer });
  const archive = inspection.validation.archive;
  if (
    inspection.validation.extensionMismatch ||
    (archive && (archive.status !== 'INSPECTED' || archive.encrypted || archive.unsafePaths || archive.macroEntry))
  )
    throw new IngestionError('INVALID_DOCUMENT');
  const result = await (workerData.format === 'pdf' ? pdf(buffer) : docx(buffer));
  if (!result.blocks.length) throw new IngestionError('NO_EXTRACTABLE_TEXT');
  if (result.blocks.reduce((sum, block) => sum + block.text.length, 0) > LIMITS.text)
    throw new IngestionError('TEXT_LIMIT');
  parentPort.postMessage({ result });
} catch (error) {
  parentPort.postMessage({ error: error instanceof IngestionError ? error.code : 'EXTRACTION_FAILED' });
}
