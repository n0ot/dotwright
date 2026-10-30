import createLouis, { type LouisModule } from './louis.mjs';
import { asciiToUnicode, unicodeToAscii } from '../brailleAscii';

/** Fully contracted UEB, and uncontracted UEB for grade 1 passages. */
export type Grade = 1 | 2;
const TABLES: Record<Grade, string> = { 1: 'en-ueb-g1.ctb', 2: 'en-ueb-g2.ctb' };
const DOTS_IO = 4;
const UC_BRL = 64;

let louis: LouisModule | null = null;

export async function initLouis(): Promise<void> {
  louis ??= await createLouis();
}

function run(fn: 'lou_translate' | 'lou_backTranslate', input: string, grade: Grade): string | null {
  const m = louis;
  if (!m) throw new Error('liblouis is not initialized');
  const capacity = input.length * 8 + 32;
  const tableName = TABLES[grade];
  const table = m._malloc(tableName.length + 1);
  const inBuf = m._malloc(input.length * 2 + 2);
  const outBuf = m._malloc(capacity * 2);
  const inLen = m._malloc(4);
  const outLen = m._malloc(4);
  try {
    m.stringToUTF8(tableName, table, tableName.length + 1);
    for (let i = 0; i < input.length; i++) m.HEAPU16[(inBuf >> 1) + i] = input.charCodeAt(i);
    m.HEAP32[inLen >> 2] = input.length;
    m.HEAP32[outLen >> 2] = capacity;
    const call = fn === 'lou_translate' ? m._lou_translate : m._lou_backTranslate;
    if (!call(table, inBuf, inLen, outBuf, outLen, 0, 0, 0, 0, 0, DOTS_IO | UC_BRL)) return null;
    // Read the heap view only after the call, which may have grown memory.
    const n = m.HEAP32[outLen >> 2];
    return String.fromCharCode(...m.HEAPU16.subarray(outBuf >> 1, (outBuf >> 1) + n));
  } finally {
    for (const p of [table, inBuf, outBuf, inLen, outLen]) m._free(p);
  }
}

/** Print to UEB (fully contracted unless grade 1), as Braille ASCII. */
export function toBraille(print: string, grade: Grade = 2): string | null {
  const out = run('lou_translate', print, grade);
  return out === null ? null : unicodeToAscii(out);
}

/** Braille ASCII to print, as liblouis interprets it. */
export function toPrint(braille: string, grade: Grade = 2): string | null {
  return run('lou_backTranslate', asciiToUnicode(braille), grade);
}
