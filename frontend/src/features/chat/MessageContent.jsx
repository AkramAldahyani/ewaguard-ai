// Render Markdown structure as React text nodes, never HTML. Only explicitly
// trusted reference sites become links; analysis/example destinations stay inert.
function trustedReference(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search &&
      ['www.pdp.gov.bh', 'pdp.gov.bh', 'www.legalaffairs.gov.bh', 'www.cisa.gov', 'cisa.gov'].includes(url.hostname);
  } catch { return false; }
}
function inline(text) {
  return text.split(/(\\[\\`*_{}[\]<>!#|]|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\)|\[(?:PDPL[1-5]|POLICY[1-3])\])/g).map((part, index) => {
    if (/^\\./.test(part)) return part.slice(1);
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) return <strong key={index}>{inline(part.slice(2, -2))}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    if (/^\[(?:PDPL[1-5]|POLICY[1-3])\]$/.test(part)) return <span className="chat-citation" key={index}>{part}</span>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) return trustedReference(link[2])
      ? <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer" className="chat-reference">{link[1]}</a>
      : <span key={index} className="chat-reference">{link[1]} <span className="chat-reference-url">({link[2]})</span></span>;
    return part;
  });
}
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
const tableDivider = (line) => line.includes('|') && cells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
const startsBlock = (line) => /^(?:```|#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|>\s)/.test(line);

function blocksFrom(lines) {
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
        const itemKey = i; const body = [item[3]]; const indent = lines[i].search(/\S/); i++;
        while (i < lines.length) {
          if (!lines[i].trim()) {
            let next = i + 1; while (next < lines.length && !lines[next].trim()) next++;
            if (next < lines.length && lines[next].search(/\S/) > indent) { body.push(''); i = next; continue; }
            if (next < lines.length && /^\s*(?:[-*+]|\d+[.)])\s/.test(lines[next]) && lines[next].search(/\S/) === indent) { i = next; }
            break;
          }
          if (lines[i].search(/\S/) <= indent) break;
          body.push(lines[i++].slice(indent + (item[2] ? item[2].length + 2 : 2)));
        }
        items.push(<li key={itemKey}>{body.length === 1 ? inline(body[0]) : blocksFrom(body)}</li>);
      }
      blocks.push(ordered ? <ol key={key} start={Number(list[2])}>{items}</ol> : <ul key={key}>{items}</ul>); continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = []; while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={key}>{inline(quote.join(' '))}</blockquote>); continue;
    }
    const paragraph = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) && !(i + 1 < lines.length && tableDivider(lines[i + 1]))) paragraph.push(lines[i++]);
    blocks.push(<p key={key}>{inline(paragraph.join(' '))}</p>);
  }
  return blocks;
}

export function MessageContent({ content }) {
  return <div className="chat-prose">{blocksFrom(content.replace(/\r\n?/g, '\n').split('\n'))}</div>;
}
