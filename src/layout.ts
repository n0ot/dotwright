export const CELLS_PER_LINE = 40;
export const LINES_PER_PAGE = 25;
/** Cells left on a line when the margin bell rings, as on a braillewriter. */
export const BELL_CELLS_LEFT = 6;

/**
 * The document is a braille file: lines separated by "\n", each at most 40
 * cells. Lines never reflow; a break is added only where a line grows past 40
 * cells, and it stays when the line later gets shorter.
 *
 * With `atWords`, an overlong line breaks at its last space within 40 cells,
 * which becomes the line break. Otherwise, or when there is no such space, a
 * line break is inserted after cell 40.
 *
 * Returns the wrapped text and the offsets in the original text where a line
 * break was inserted (replaced spaces don't change offsets).
 */
export function hardWrap(text: string, atWords: boolean): { text: string; inserted: number[] } {
  const inserted: number[] = [];
  const out: string[] = [];
  let base = 0;
  for (let line of text.split('\n')) {
    let consumed = 0;
    while (line.length > CELLS_PER_LINE) {
      const space = atWords ? line.lastIndexOf(' ', CELLS_PER_LINE) : -1;
      if (space > 0 && line.slice(0, space).trim()) {
        out.push(line.slice(0, space));
        line = line.slice(space + 1);
        consumed += space + 1;
      } else {
        out.push(line.slice(0, CELLS_PER_LINE));
        line = line.slice(CELLS_PER_LINE);
        consumed += CELLS_PER_LINE;
        inserted.push(base + consumed);
      }
    }
    out.push(line);
    base += consumed + line.length + 1;
  }
  return { text: out.join('\n'), inserted };
}

export interface Position {
  page: number;
  line: number; // line on the page, 1-based
  cell: number; // 1-based
}

/** Page, line and cell for a caret offset. */
export function positionOf(text: string, offset: number): Position {
  const before = text.slice(0, offset);
  const lineIndex = before.split('\n').length - 1;
  const lineStart = before.lastIndexOf('\n') + 1;
  return {
    page: Math.floor(lineIndex / LINES_PER_PAGE) + 1,
    line: (lineIndex % LINES_PER_PAGE) + 1,
    cell: offset - lineStart + 1,
  };
}

export interface Word {
  start: number;
  end: number;
  text: string;
}

export function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  for (const m of text.matchAll(/[^\s]+/g)) {
    words.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return words;
}

/** The word touching the offset (inside it, or immediately before or after it). */
export function wordAt(words: Word[], offset: number): Word | null {
  return words.find((w) => w.start <= offset && offset <= w.end) ?? null;
}

/** The 1-based line number of an offset, counting from the start of the document. */
export function lineNumberOf(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length;
}

/**
 * The offset for a line (counted from the start of the document) and cell. A
 * cell past the end of the line goes to the end of the line, and `cell` in the
 * result says where that is.
 */
export function offsetOf(text: string, line: number, cell: number): { offset: number; cell: number } | { error: string } {
  const lines = text.split('\n');
  if (!Number.isInteger(line) || line < 1 || line > lines.length) {
    return { error: `Enter a line from 1 to ${lines.length}.` };
  }
  if (!Number.isInteger(cell) || cell < 1) return { error: 'Enter a cell of 1 or more.' };
  const lineStart = lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0);
  const actual = Math.min(cell, lines[line - 1].length + 1);
  return { offset: lineStart + actual - 1, cell: actual };
}
