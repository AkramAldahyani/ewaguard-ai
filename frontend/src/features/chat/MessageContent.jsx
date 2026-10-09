// Render Markdown structure as React text nodes, never HTML. URLs remain inert
// because cybersecurity replies can contain hostile example destinations.
function inline(text) {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) return <span key={index} className="chat-reference">{link[1]} <span className="chat-reference-url">({link[2]})</span></span>;
    return part;
  });
}
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
const tableDivider = (line) => line.includes('|') && cells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
const startsBlock = (line) => /^(?:```|#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|>\s)/.test(line);

export function MessageContent({ content }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks = []; let i = 0;
  while (i < lines.length) {
    const key = i; const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim(); const code = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<div key={key} className="chat-code-block">{language && <div className="chat-code-label">{language}</div>}<pre><code>{code.join('\n')}</code></pre></div>); continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { const Heading = `h${Math.min(heading[1].length + 2, 6)}`; blocks.push(<Heading key={key}>{inline(heading[2])}</Heading>); i++; continue; }
    if (i + 1 < lines.length && line.includes('|') && tableDivider(lines[i + 1])) {
      const headers = cells(line); const rows = []; i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push(<div key={key} className="chat-table-wrap"><table><thead><tr>{headers.map((cell, col) => <th key={col} scope="col">{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, col) => <td key={col}>{inline(row[col] ?? '')}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    const list = /^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/.exec(line);
    if (list) {
      const ordered = Boolean(list[2]); const items = [];
      while (i < lines.length) {
        const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/.exec(lines[i]);
        if (!item || Boolean(item[2]) !== ordered) break;
        items.push(<li key={i++}>{inline(item[3])}</li>);
      }
      blocks.push(ordered ? <ol key={key} start={Number(list[2])}>{items}</ol> : <ul key={key}>{items}</ul>); continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = []; while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={key}>{inline(quote.join('\n'))}</blockquote>); continue;
    }
    const paragraph = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) && !(i + 1 < lines.length && tableDivider(lines[i + 1]))) paragraph.push(lines[i++]);
    blocks.push(<p key={key}>{inline(paragraph.join('\n'))}</p>);
  }
  return <div className="chat-prose">{blocks}</div>;
}
