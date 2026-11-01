// Structures plain-text lesson bodies for display. The output is plain data rendered as React
// text nodes; nothing is interpreted as HTML or Markdown. Text without these conventions
// renders as ordinary paragraphs, so existing courses keep working unchanged.
const calloutPattern = /^(Key takeaway|Example|Watch out|Tip):\s*(.*)$/;
const calloutTypes = { 'Key takeaway': 'takeaway', Example: 'example', 'Watch out': 'warning', Tip: 'tip' };
const bullet = /^[-•]\s+(.*)$/;
const step = /^\d{1,2}[.)]\s+(.*)$/;

function lineBlocks(lines) {
  const blocks = [];
  for (const line of lines) {
    const kind = bullet.test(line) ? 'list' : step.test(line) ? 'steps' : 'line';
    const text = kind === 'list' ? line.match(bullet)[1] : kind === 'steps' ? line.match(step)[1] : line;
    const last = blocks.at(-1);
    if (kind !== 'line' && last?.type === kind) last.items.push(text);
    else if (kind !== 'line') {
      // A short line ending in a colon directly above a list becomes that list's heading.
      const lead = last?.type === 'paragraph' && last.lines.length === 1 && last.lines[0].endsWith(':') ? blocks.pop().lines[0] : null;
      blocks.push({ type: kind, lead, items: [text] });
    } else if (last?.type === 'paragraph') last.lines.push(text);
    else blocks.push({ type: 'paragraph', lines: [text] });
  }
  return blocks;
}

export function lessonBlocks(body) {
  if (typeof body !== 'string') return [];
  return body.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((chunk) => chunk.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0).flatMap((lines) => {
      const callout = lines[0].match(calloutPattern);
      if (!callout) return lineBlocks(lines);
      const rest = lines.slice(1);
      // "Key takeaway: text" keeps its text as the body; "Example: Title" followed by lines uses it as a title.
      const title = rest.length > 0 && callout[2] ? callout[2] : null;
      const content = title || !callout[2] ? rest : [callout[2], ...rest];
      return [{ type: 'callout', variant: calloutTypes[callout[1]], label: callout[1], title, blocks: lineBlocks(content) }];
    });
}
