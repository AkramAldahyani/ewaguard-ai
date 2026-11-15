// Render only server-verified source metadata and exact selected excerpts.
const literal = (value) =>
  String(value)
    .replace(/([\\`*_{}[\]<>!#|])/g, '\\$1')
    .replace(/\s+/g, ' ')
    .trim();

// Accept either a source label or a fully verified source/quote label. Never
// repair an unknown source or add a citation that the model did not select.
export function citationLabels(text, ids, selections) {
  let valid = true;
  const normalized = text.replace(/\[([^\]]+)\]/g, (label, value) => {
    if (ids.has(value)) return label;
    if (selections.has(value)) return `[${value.split(':')[0]}]`;
    valid = false;
    return label;
  });
  return valid ? normalized : null;
}
export function sourceReferences(cited) {
  const groups = new Map();
  for (const item of cited) {
    if (!groups.has(item.citationId)) groups.set(item.citationId, { ...item, quotes: [] });
    groups.get(item.citationId).quotes.push(item.quote);
  }
  return [...groups.values()]
    .map((item) => {
      const source = item.source;
      const title = source.sourceTitle ?? source.title;
      const category = item.kind === 'COMPANY_POLICY' ? 'Demonstration policy source' : 'Bahrain PDPL legal source';
      const location = [
        source.section,
        `version ${source.version}`,
        source.policyId,
        source.sourceVersionDate,
        source.page ? `PDF page ${source.page}` : 'page unavailable',
      ]
        .filter(Boolean)
        .join(' · ');
      return (
        `**[${item.citationId}] ${category}: ${literal(title)}**\n\n${literal(location || 'Location unavailable')}\n\n` +
        item.quotes.map((quote) => `> ${literal(quote)}`).join('\n\n')
      );
    })
    .join('\n\n');
}

export function generalGuidance(value, allowGeneral) {
  if (!allowGeneral || typeof value !== 'string' || !value.trim() || value.length > 1200) return '';
  // General advice cannot acquire citation/organizational/legal authority.
  if (
    /\[(?:PDPL|POLICY)\d+\]|\b(?:our policy|company requires|EWA requires|law requires|PDPL requires|fully compliant)\b/i.test(
      value,
    )
  )
    return '';
  return `\n\n### General guidance\n\n${value.trim()}`;
}
