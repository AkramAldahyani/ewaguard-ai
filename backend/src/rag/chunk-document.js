import { LIMITS, IngestionError } from './ingestion-policy.js';

// Never cross a known page or heading boundary. Offsets refer to extracted text,
// not byte positions in the original file. Chunk sizes are characters, not tokens.
export function chunkDocument(blocks, { maxChars = LIMITS.chunkChars, overlap = LIMITS.overlapChars } = {}) {
  if (!Number.isInteger(maxChars) || maxChars < 100 || maxChars > 4000 ||
    !Number.isInteger(overlap) || overlap < 0 || overlap >= maxChars / 2) throw new IngestionError('INVALID_CHUNK_OPTIONS');
  const groups = [];
  for (const [index, block] of blocks.entries()) {
    const previous = groups.at(-1);
    if (previous && block.type !== 'heading' && previous.page === block.page && previous.section === block.section) {
      previous.text += '\n\n' + block.text; previous.lastBlock = index;
    } else groups.push({ ...block, firstBlock: index, lastBlock: index });
  }
  const chunks = [];
  for (const group of groups) {
    let start = 0;
    while (start < group.text.length) {
      let end = Math.min(start + maxChars, group.text.length);
      if (end < group.text.length) {
        const candidate = group.text.slice(start, end);
        const paragraph = candidate.lastIndexOf('\n\n');
        const space = candidate.lastIndexOf(' ');
        const boundary = paragraph >= maxChars / 2 ? paragraph : space;
        if (boundary >= maxChars / 2) end = start + boundary;
        if (/[\uD800-\uDBFF]/.test(group.text[end - 1])) end--;
      }
      const content = group.text.slice(start, end).trim();
      if (content) chunks.push({ position: chunks.length, content,
        metadata: { page: group.page, section: group.section, firstBlock: group.firstBlock,
          lastBlock: group.lastBlock, startOffset: start, endOffset: end, referenceTrust: 'UNTRUSTED' } });
      if (chunks.length > LIMITS.chunks) throw new IngestionError('CHUNK_LIMIT');
      if (end === group.text.length) break;
      start = end - overlap;
      // Start overlap on a word boundary, without skipping any non-overlap text.
      while (start < end && !/\s/.test(group.text[start])) start++;
      if (start === end) start = end - overlap;
      if (/[\uDC00-\uDFFF]/.test(group.text[start])) start++;
    }
  }
  return chunks;
}
