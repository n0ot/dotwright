/**
 * Comparing what the learner wrote with the text they're transcribing.
 *
 * The text is split into words at spaces, and so is the print reading of each
 * braille word. The two lists are lined up with an edit-distance alignment, so
 * a skipped or extra word doesn't make everything after it look wrong. The
 * text may run on past what's been written: words not reached yet cost
 * nothing.
 */

export interface SourceToken {
  start: number;
  end: number;
  text: string;
}

export function tokenizeSource(text: string): SourceToken[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
}

/** A braille word, as written. */
export interface Written {
  /** The braille, in lower-case Braille ASCII. */
  braille: string;
  /**
   * Its print reading, or null if it isn't compared with the text: it's
   * still being written, it can't be read, or feedback is hidden. It still
   * takes its place in the text, so the learner's place is followed.
   */
  print: string | null;
  /** Whether the word is finished, so its differences can be shown. */
  checked: boolean;
}

/** How a word differs from the text: its capitals, punctuation, spelling, or it isn't in the text at all. */
export type Difference = 'capitals' | 'punctuation' | 'spelling' | 'extra';

export interface WordMatch {
  /** The words of the text this word was written for, from and to (exclusive); empty for an extra word. */
  from: number;
  to: number;
  differences: Difference[];
  /** Words of the text left out just before this one, from and to (exclusive). */
  skipped: [number, number] | null;
}

export interface Comparison {
  words: WordMatch[];
  /** For each word of the text, the written word for it, or -1. */
  tokenWord: Int32Array;
  /** The word of the text after the last one written for. */
  reached: number;
  /** Every word of the text has been written for, and every written word is finished. */
  finished: boolean;
}

/**
 * Makes marks that braille can't tell apart the same: curly and straight
 * quotes, dashes, and an ellipsis.
 */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[“”„‟«»″]/g, '"')
    .replace(/[‘’‚‛′`]/g, "'")
    .replace(/[–―]/g, '—')
    .replace(/…/g, '...');
}

const letters = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '');
const punctuation = (s: string) => s.replace(/[\p{L}\p{N}\s]+/gu, '');

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * The cost of writing `written` for `wanted`, between 0 (the same) and 1.8.
 * It's always under 2, the cost of an extra word and a skipped one, so two
 * words in the same place are paired up as a misspelling.
 */
function substitution(written: string, wanted: string): number {
  if (written === wanted) return 0;
  const a = letters(written).toLowerCase();
  const b = letters(wanted).toLowerCase();
  if (a === b) return 0.3;
  return 0.6 + (1.2 * editDistance(a, b)) / Math.max(a.length, b.length, 1);
}

/** How far the alignment may drift from word for word: the most words that can be skipped or added in all. */
const BAND = 150;

/** One unit of the alignment: a print word of what's written, or a word of it that isn't compared (null). */
interface Unit {
  word: number;
  text: string | null;
}

/**
 * Lines up the written units with the text. Returns, for each unit, the word
 * of the text it was written for, or -1 if it's extra.
 */
function align(units: Unit[], tokens: string[]): Int32Array {
  const m = units.length;
  const n = tokens.length;
  const width = 2 * BAND + 1;
  const cost = new Float64Array((m + 1) * width).fill(Infinity);
  // 1: both, 2: a word of the text skipped, 3: an extra unit.
  const step = new Uint8Array((m + 1) * width);
  const at = (i: number, j: number) => i * width + (j - i + BAND);
  const inBand = (i: number, j: number) => j >= 0 && j <= n && Math.abs(j - i) <= BAND;
  for (let i = 0; i <= m; i++) {
    for (let j = Math.max(0, i - BAND); j <= Math.min(n, i + BAND); j++) {
      if (i === 0 && j === 0) {
        cost[at(0, 0)] = 0;
        continue;
      }
      let best = Infinity;
      let how = 0;
      // On a tie, the later unit is the extra one, so a repeated word is paired with the first.
      if (i > 0 && inBand(i - 1, j)) {
        const c = cost[at(i - 1, j)] + 1;
        if (c < best) [best, how] = [c, 3];
      }
      if (i > 0 && j > 0 && inBand(i - 1, j - 1)) {
        const unit = units[i - 1].text;
        const c = cost[at(i - 1, j - 1)] + (unit === null ? 0 : substitution(unit, tokens[j - 1]));
        if (c < best) [best, how] = [c, 1];
      }
      if (j > 0 && inBand(i, j - 1)) {
        const c = cost[at(i, j - 1)] + 1;
        if (c < best) [best, how] = [c, 2];
      }
      cost[at(i, j)] = best;
      step[at(i, j)] = how;
    }
  }
  // The text may run on past what's written: end wherever is cheapest, as early as possible.
  let j = Math.max(0, m - BAND);
  for (let k = j; k <= Math.min(n, m + BAND); k++) if (cost[at(m, k)] < cost[at(m, j)]) j = k;
  const result = new Int32Array(m).fill(-1);
  let i = m;
  while (i > 0 || j > 0) {
    const how = step[at(i, j)];
    if (how === 1) result[--i] = --j;
    else if (how === 2) j--;
    else i--;
  }
  return result;
}

/**
 * Compares the written words with the text. `toBraille` gives the correct
 * braille for some of the text: a word written exactly that way matches,
 * whatever its print reading, since liblouis sometimes reads correct braille
 * back as the wrong print.
 */
export function compare(
  tokens: SourceToken[],
  written: Written[],
  toBraille: (print: string) => string | null,
): Comparison {
  const units: Unit[] = [];
  written.forEach((w, word) => {
    if (w.print === null) units.push({ word, text: null });
    else for (const part of w.print.split(/\s+/)) if (part) units.push({ word, text: normalize(part) });
  });
  // Far more written than the text has: what's past the band is extra.
  const alignable = Math.min(units.length, tokens.length + BAND);
  const aligned = new Int32Array(units.length).fill(-1);
  aligned.set(align(units.slice(0, alignable), tokens.map((t) => normalize(t.text))));

  const tokenWord = new Int32Array(tokens.length).fill(-1);
  const words: WordMatch[] = written.map(() => ({ from: -1, to: -1, differences: [], skipped: null }));
  aligned.forEach((token, u) => {
    const match = words[units[u].word];
    if (token < 0) return;
    tokenWord[token] = units[u].word;
    if (match.from < 0) match.from = token;
    match.to = token + 1;
  });

  words.forEach((match, i) => {
    const w = written[i];
    const hasUnits = w.print === null || w.print.trim() !== '';
    if (match.from < 0) {
      // An extra word sits where the text it follows ends.
      match.from = match.to = 0;
      if (w.checked && w.print !== null && hasUnits) match.differences = ['extra'];
      return;
    }
    if (!w.checked || w.print === null) return;
    const wanted = tokens
      .slice(match.from, match.to)
      .map((t) => t.text)
      .join(' ');
    if (toBraille(wanted)?.toLowerCase() === w.braille) return;
    match.differences = differences(normalize(w.print.trim().split(/\s+/).join(' ')), normalize(wanted));
  });

  // Extra words go after the text of the word before them.
  let previousEnd = 0;
  for (const match of words) {
    if (match.from === match.to) match.from = match.to = previousEnd;
    else previousEnd = match.to;
  }

  // Words of the text left out, before the next word written for the text.
  let reached = 0;
  for (let t = 0; t < tokens.length; t++) if (tokenWord[t] >= 0) reached = t + 1;
  let runStart = -1;
  for (let t = 0; t < reached; t++) {
    if (tokenWord[t] < 0) {
      if (runStart < 0) runStart = t;
      continue;
    }
    if (runStart >= 0) {
      const word = tokenWord[t];
      if (written[word].checked && written[word].print !== null) words[word].skipped = [runStart, t];
      runStart = -1;
    }
  }

  const finished =
    tokens.length > 0 && tokenWord[tokens.length - 1] >= 0 && written.every((w) => w.checked);
  return { words, tokenWord, reached, finished };
}

function differences(written: string, wanted: string): Difference[] {
  if (written === wanted) return [];
  const a = letters(written);
  const b = letters(wanted);
  if (a.toLowerCase() !== b.toLowerCase()) return ['spelling'];
  const found: Difference[] = [];
  if (a !== b) found.push('capitals');
  if (punctuation(written) !== punctuation(wanted)) found.push('punctuation');
  return found;
}

// ---- Places ----------------------------------------------------------------

/** A braille word's place in the document. */
export interface Span {
  start: number;
  end: number;
}

/**
 * The word of the text at a braille caret: the one the word at the caret was
 * written for, or, between words, the next one to write. Null for an extra
 * word, which wasn't written for any.
 */
export function tokenAtCaret(spans: Span[], cmp: Comparison, caret: number): number | null {
  const i = spans.findIndex((s) => s.start <= caret && caret <= s.end);
  if (i >= 0) {
    const match = cmp.words[i];
    return match.from === match.to ? null : match.from;
  }
  // Between words: after the text of the words before the caret.
  let next = 0;
  spans.forEach((s, k) => {
    if (s.end < caret && cmp.words[k].to > next) next = cmp.words[k].to;
  });
  return next;
}

/** Where a braille caret is in the text, for the caret in the text to follow it. */
export function sourceOffsetFor(spans: Span[], cmp: Comparison, tokens: SourceToken[], caret: number, length: number): number {
  const i = spans.findIndex((s) => s.start <= caret && caret <= s.end);
  if (i >= 0) {
    const match = cmp.words[i];
    if (match.from === match.to) return tokens[match.from - 1]?.end ?? 0;
    const atEnd = caret === spans[i].end && caret > spans[i].start;
    return atEnd ? tokens[match.to - 1].end : tokens[match.from].start;
  }
  const token = tokenAtCaret(spans, cmp, caret)!;
  return tokens[token]?.start ?? length;
}

/**
 * Where the braille caret goes for a place in the text: at the word written
 * for it, or where the next word written for the text starts, which is where
 * a word left out goes. Past what's been written, at the end.
 */
export function brailleOffsetFor(
  spans: Span[],
  cmp: Comparison,
  tokens: SourceToken[],
  offset: number,
  documentLength: number,
): number {
  let t = tokens.findIndex((tok) => offset <= tok.end);
  if (t < 0) return documentLength;
  const word = cmp.tokenWord[t];
  if (word >= 0) {
    const atEnd = offset === tokens[t].end && offset > tokens[t].start && cmp.words[word].to === t + 1;
    return atEnd ? spans[word].end : spans[word].start;
  }
  for (; t < tokens.length; t++) if (cmp.tokenWord[t] >= 0) return spans[cmp.tokenWord[t]].start;
  return documentLength;
}

// ---- Summary ---------------------------------------------------------------

export interface Tally {
  capitals: number;
  punctuation: number;
  spelling: number;
  extra: number;
  skipped: number;
}

export function tally(cmp: Comparison): Tally {
  const t: Tally = { capitals: 0, punctuation: 0, spelling: 0, extra: 0, skipped: 0 };
  for (const match of cmp.words) {
    for (const d of match.differences) t[d]++;
    if (match.skipped) t.skipped += match.skipped[1] - match.skipped[0];
  }
  return t;
}
