import { IngestionError } from './ingestion-policy.js';

// Reviewed local artifact, not a claim that this is the latest consolidated law.
// Translation classification is supplied by the project owner, not PDF extraction.
export const PDPL_SHA256 = '576cccf74a8f2561b6f25f536c6444684424abd3478420873607df5d183354c1';
export const PDPL_PROFILE = Object.freeze({
  pipeline: 'bahrain-pdpl-articles-v1',
  language: 'en',
  translationStatus: 'UNOFFICIAL',
  authoritativeLanguage: 'ar',
  classificationBasis: 'PROJECT_OWNER_DECLARATION',
  pageNumbering: 'PDF_PHYSICAL_1_BASED',
  notice:
    'Unofficial English translation of Bahrain Law No. (30) of 2018. The authoritative legislation is Arabic. This reference is not legal advice; consult the DPO or legal counsel. Later amendments and implementing decisions are not verified by this corpus.',
});

export function isPdplSource(source) {
  return source.kind === 'PDPL' && source.documentKey === 'bahrain-pdpl' && source.filename === 'pdpl/bahrain_pdpl.pdf';
}

// Exact heading lines only: a sentence such as "Article (39) of this Law."
// is a cross-reference, not the beginning of Article 39. The one inline title
// below is verified against the fingerprint-bound English PDF.
export function pdplBlocks(blocks) {
  let section = null;
  let previousPage = null;
  const result = [];
  for (const block of blocks) {
    if (!Number.isInteger(block.page) || (previousPage !== null && block.page !== previousPage + 1)) section = null;
    previousPage = block.page;
    let lines = [];
    const flush = () => {
      if (lines.length) result.push({ ...block, text: lines.join('\n'), section });
      lines = [];
    };
    for (const line of block.text.split('\n')) {
      const heading = line.trim();
      const article =
        /^Article \(([1-9]\d?)\)$/.exec(heading) ??
        /^Article \((22)\) Right to object to Decisions based on Automated Processing$/.exec(heading);
      const promulgation = /^(First|Second|Third|Fourth) Article$/.test(heading);
      const boundary =
        heading === 'King of the Kingdom of Bahrain' ||
        /^(?:Part (?:\(\d+\)|[IVX]+|\d+)|Section (?:One|Two|Three|Four|Five|one|two|three)(?:[: ].*)?)$/.test(heading);
      if (article || promulgation || boundary) {
        flush();
        section = article ? `PDPL Article (${article[1]})` : promulgation ? `Promulgation: ${heading}` : null;
      }
      lines.push(line);
    }
    flush();
  }
  return result;
}

export function preparePdplExtraction(source, contentSha256, extraction) {
  if (!isPdplSource(source)) return { blocks: extraction.blocks, legalSource: null };
  if (contentSha256 !== PDPL_SHA256) throw new IngestionError('PDPL_SOURCE_REVIEW_REQUIRED');
  return { blocks: pdplBlocks(extraction.blocks), legalSource: PDPL_PROFILE };
}
