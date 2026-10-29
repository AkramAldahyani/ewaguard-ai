// Deterministic source snippets: the model selects an ID, never rewrites a quote.
// Preserve punctuation/whitespace inside each substring, including PDF line breaks.
export function pdplQuotes(excerpt) {
  const quotes = [];
  let start = 0;
  while (start < excerpt.length) {
    let end = Math.min(start + 300, excerpt.length);
    if (end < excerpt.length) {
      const boundary = excerpt.lastIndexOf('\n', end);
      const space = excerpt.lastIndexOf(' ', end);
      if (boundary > start + 20) end = boundary;
      else if (space > start + 20) end = space;
    }
    const text = excerpt.slice(start, end).trim();
    if (text.length >= 20) quotes.push({ id: `Q${quotes.length + 1}`, text });
    start = end;
    while (/\s/.test(excerpt[start] ?? '') && start < excerpt.length) start++;
  }
  return quotes;
}
