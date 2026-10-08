import { createHash } from 'node:crypto';
import yauzl from 'yauzl';
import { FILE_EXTENSIONS, FILE_MAX_BYTES, FILE_LIMITS, FileAnalysisError } from './file-policy.js';

const scripts = new Set(['ps1', 'js', 'vbs', 'bat', 'cmd', 'sh', 'py']);
const expected = { pdf: ['PDF'], doc: ['OLE'], xls: ['OLE'], ppt: ['OLE'], docx: ['DOCX'], xlsx: ['XLSX'], pptx: ['PPTX'],
  txt: ['TEXT'], csv: ['TEXT'], zip: ['ZIP', 'DOCX', 'XLSX', 'PPTX'], png: ['PNG'], jpg: ['JPEG'], jpeg: ['JPEG'], gif: ['GIF'], webp: ['WEBP'], bmp: ['BMP'], exe: ['PE'], dll: ['PE'] };
const mime = { PDF: 'application/pdf', OLE: 'application/x-ole-storage', DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ZIP: 'application/zip', TEXT: 'text/plain', PNG: 'image/png', JPEG: 'image/jpeg', GIF: 'image/gif', WEBP: 'image/webp', BMP: 'image/bmp', PE: 'application/vnd.microsoft.portable-executable' };
const mimeAliases = { OLE: ['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'], TEXT: ['text/csv', 'application/csv', 'application/javascript', 'text/javascript', 'application/x-powershell', 'application/x-sh', 'text/x-python'],
  PE: ['application/x-msdownload', 'application/x-dosexec'], ZIP: ['application/x-zip-compressed'] };

export function fileExtension(name) {
  if (typeof name !== 'string' || name.length > 255) throw new FileAnalysisError('UNSUPPORTED_FILE');
  const leaf = name.split(/[\\/]/).at(-1);
  const extension = leaf.match(/\.([a-z0-9]{1,12})$/i)?.[1].toLowerCase();
  if (!FILE_EXTENSIONS.includes(extension)) throw new FileAnalysisError('UNSUPPORTED_FILE');
  return extension;
}

function signature(buffer) {
  const hex = buffer.subarray(0, 8).toString('hex');
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'PDF';
  if (hex === 'd0cf11e0a1b11ae1') return 'OLE';
  if (hex.startsWith('504b0304') || hex.startsWith('504b0506') || hex.startsWith('504b0708')) return 'ZIP';
  if (hex === '89504e470d0a1a0a') return 'PNG';
  if (hex.startsWith('ffd8ff')) return 'JPEG';
  if (/^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('ascii'))) return 'GIF';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'WEBP';
  if (buffer.subarray(0, 2).toString('ascii') === 'BM' && buffer.length >= 26) return 'BMP';
  if (buffer.subarray(0, 2).toString('ascii') === 'MZ') return 'PE';
  // Validate bounded whole-file text, including BOM-marked UTF-16, without keeping
  // decoded content. A signature is evidence, not proof of a valid document.
  try {
    const encoding = hex.startsWith('fffe') ? 'utf-16le' : hex.startsWith('feff') ? 'utf-16be' : 'utf-8';
    const text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
    let binary = false;
    for (const character of text) {
      const code = character.charCodeAt(0);
      if (code < 32 && ![9, 10, 13].includes(code)) { binary = true; break; }
    }
    if (!binary) return 'TEXT';
  } catch { /* Unsupported binary or text encoding. */ }
  return 'UNKNOWN';
}

export async function inspectArchive(buffer) {
  return new Promise((resolve) => {
    let archive; let done = false;
    const evidence = { status: 'INSPECTED', entryCount: 0, declaredExpandedBytes: 0, encrypted: false, unsafePaths: false,
      executableEntries: false, nestedArchive: false, macroEntry: false, officeType: null };
    const office = new Set(); let contentTypes = false;
    const finish = (status) => { if (done) return; done = true; clearTimeout(timer); archive?.close(); resolve({ ...evidence, status }); };
    const timer = setTimeout(() => finish('LIMIT_EXCEEDED'), 1000);
    yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: false, validateEntrySizes: true }, (error, zip) => {
      if (done) { zip?.close(); return; }
      if (error) { finish('INVALID'); return; }
      archive = zip;
      zip.on('error', () => finish('INVALID'));
      zip.on('end', () => { evidence.officeType = contentTypes && office.size === 1 ? [...office][0] : null; finish('INSPECTED'); });
      zip.on('entry', (entry) => {
        if (done) return;
        evidence.entryCount++;
        evidence.declaredExpandedBytes += entry.uncompressedSize;
        if (evidence.entryCount > FILE_LIMITS.archiveEntries || evidence.declaredExpandedBytes > FILE_LIMITS.archiveExpandedBytes ||
            entry.uncompressedSize > Math.max(1, entry.compressedSize) * FILE_LIMITS.archiveRatio) { finish('LIMIT_EXCEEDED'); return; }
        const name = entry.fileName.toString('utf8').replaceAll('\\', '/');
        evidence.encrypted ||= Boolean(entry.generalPurposeBitFlag & 1);
        evidence.unsafePaths ||= name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..') || /\p{Cc}/u.test(name);
        evidence.executableEntries ||= /\.(?:exe|dll|ps1|js|vbs|bat|cmd|sh|py|lnk)$/i.test(name);
        evidence.nestedArchive ||= /\.(?:zip|rar|7z|gz|tar)$/i.test(name);
        evidence.macroEntry ||= /(?:^|\/)vbaProject\.bin$/i.test(name);
        contentTypes ||= name === '[Content_Types].xml';
        if (name === 'word/document.xml') office.add('DOCX');
        if (name === 'xl/workbook.xml') office.add('XLSX');
        if (name === 'ppt/presentation.xml') office.add('PPTX');
        zip.readEntry();
      });
      if (zip.entryCount > FILE_LIMITS.archiveEntries) finish('LIMIT_EXCEEDED'); else zip.readEntry();
    });
  });
}

export async function inspectFile({ originalname, mimetype, buffer }) {
  const extension = fileExtension(originalname);
  if (!Buffer.isBuffer(buffer)) throw new FileAnalysisError();
  if (!buffer.length) throw new FileAnalysisError('EMPTY_FILE');
  if (buffer.length > FILE_MAX_BYTES) throw new FileAnalysisError('FILE_TOO_LARGE');
  let detectedType = signature(buffer);
  if (detectedType === 'UNKNOWN') throw new FileAnalysisError('UNSUPPORTED_FILE');
  const archive = detectedType === 'ZIP' ? await inspectArchive(buffer) : null;
  if (archive?.officeType) detectedType = archive.officeType;
  const acceptedMimes = [mime[detectedType], ...(mimeAliases[detectedType] ?? []), 'application/octet-stream'];
  const validation = {
    signatureOnly: true, extensionMismatch: !(scripts.has(extension) ? detectedType === 'TEXT' : expected[extension]?.includes(detectedType)),
    mimeMismatch: Boolean(mimetype) && !acceptedMimes.includes(mimetype.toLowerCase()),
    doubleExtension: /\.(?:pdf|docx?|xlsx?|pptx?|txt|csv|jpe?g|png|zip)\.[^.]+$/i.test(originalname),
    suspiciousFilename: /[\\/\p{Cc}\p{Cf}]/u.test(originalname), scriptExtension: scripts.has(extension), archive,
  };
  return { file: { displayName: `Submitted file.${extension}`, extension, size: buffer.length, detectedType, mimeType: mime[detectedType],
    sha256: createHash('sha256').update(buffer).digest('hex') }, validation };
}
