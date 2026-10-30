import { canonicalChar } from './brailleAscii';
import { LINES_PER_PAGE, hardWrap } from './layout';

/** Formats document text as a BRF: its lines in 25-line pages, CRLF line endings, form feeds between pages. */
export function formatBrf(text: string): string {
  const lines = text.toUpperCase().split('\n');
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE).join('\r\n'));
  }
  return pages.join('\r\n\f') + '\r\n';
}

export interface ParsedBrf {
  text: string;
  /** Characters that are not Braille ASCII and were left out. */
  skipped: number;
}

/**
 * Reads a BRF line for line, as it is in the file. A form feed that ends a
 * page early is kept as blank lines to the end of that page, and a line
 * longer than 40 cells is broken after cell 40.
 */
export function parseBrf(data: string): ParsedBrf {
  let skipped = 0;
  const lines: string[] = [];
  const pages = data.replace(/\r\n?/g, '\n').split('\f');
  pages.forEach((page, i) => {
    // Accept both "...\n\f" and "...\f\n" between pages.
    if (i > 0 && page.startsWith('\n') && !pages[i - 1].endsWith('\n')) page = page.slice(1);
    const pageLines = page.split('\n');
    if (pageLines.at(-1) === '') pageLines.pop();
    for (const raw of pageLines) {
      let line = '';
      for (const ch of raw) {
        const c = ch === '\t' ? ' ' : canonicalChar(ch);
        if (c === null) skipped++;
        else line += c;
      }
      lines.push(line);
    }
    if (i < pages.length - 1) while (lines.length % LINES_PER_PAGE) lines.push('');
  });
  return { text: hardWrap(lines.join('\n'), false).text, skipped };
}
