export const DEMO_POLICY_NOTICE = 'DEMONSTRATION / NOT OFFICIALLY APPROVED. These fictional example policies are not official EWA requirements.';

export function isDemoPolicy(source) {
  return source.kind === 'COMPANY_POLICY' && source.classification === 'DEMONSTRATION' &&
    source.sourceUse === 'DEMONSTRATION' && source.filename.endsWith('.docx');
}

export function prepareCompanyExtraction(source, extraction) {
  if (!isDemoPolicy(source)) return { blocks: extraction.blocks };
  const text = extraction.blocks.map(b => b.text);
  const valueAfter = label => {
    const index = text.indexOf(label);
    return index >= 0 && text[index + 1]?.length <= 240 ? text[index + 1] : null;
  };
  const marked = text.includes('DEMONSTRATION POLICY - NOT ISSUED OR APPROVED BY EWA') &&
    valueAfter('Document status') === 'SAMPLE / NOT APPROVED';
  const policySource = { pipeline: 'demo-policy-sections-v1', policyId: valueAfter('Document ID'),
    sourceTitle: text[0] === 'EWAGUARD AI' && text[1]?.length <= 240 ? text[1] : null,
    sourceVersionDate: valueAfter('Version / date'), sourceStatus: valueAfter('Document status'),
    organization: valueAfter('Organization'), ownerReview: valueAfter('Owner / review'),
    demonstrationNoticePresent: marked, authority: 'NOT_OFFICIALLY_APPROVED', notice: DEMO_POLICY_NOTICE };
  let section = null;
  const blocks = extraction.blocks.map(block => {
    // Only this explicitly marked demo layout uses numbered plain paragraphs as headings.
    if (marked && /^\d{1,2}(?:\.\d{1,2})*\.\s+[A-Z][^\n]{1,150}$/.test(block.text)) section = block.text;
    return marked ? { ...block, section, type: section === block.text ? 'heading' : block.type } : block;
  });
  return { blocks, policySource };
}
