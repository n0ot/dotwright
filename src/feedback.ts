import { wordsOf } from './layout';
import { toBraille, toPrint, type Grade } from './louis';

export type WordStatus =
  /** The entry matches the reference form. */
  | 'matches'
  /** The entry could be read but differs from the reference form. */
  | 'differs'
  /** Some of the entry could not be interpreted as print. */
  | 'unreadable'
  /** The entry was read, but no reference form could be produced. */
  | 'no-reference';

export interface WordFeedback {
  braille: string;
  /** liblouis's reading of the learner's braille, with "?" for cells it could not interpret. */
  print: string;
  reference: string | null;
  status: WordStatus;
  /** Set for words in a capitalized or grade 1 passage. */
  passage?: 'capitalized' | 'grade 1';
}

// liblouis writes cells it cannot back-translate as an escape like "\456/".
const UNREADABLE = /\\\d+\//g;

const cache = new Map<string, WordFeedback>();

/**
 * Checks one space-delimited braille word against fully contracted UEB, or
 * against uncontracted UEB with `grade` 1 (inside a grade 1 passage).
 */
export function checkWord(braille: string, grade: Grade = 2): WordFeedback {
  const key = `${grade}:${braille.toLowerCase()}`;
  let result = cache.get(key);
  if (result) return result;
  const learner = braille.toLowerCase();
  const raw = toPrint(learner, grade);
  if (raw === null || raw === '') {
    result = { braille: learner, print: '?', reference: null, status: 'unreadable' };
  } else if (UNREADABLE.test(raw)) {
    result = { braille: learner, print: raw.replace(UNREADABLE, '?'), reference: null, status: 'unreadable' };
  } else {
    const reference = toBraille(raw, grade)?.toLowerCase() ?? null;
    const status = reference === null ? 'no-reference' : reference === learner ? 'matches' : 'differs';
    result = { braille: learner, print: raw, reference, status };
  }
  UNREADABLE.lastIndex = 0;
  cache.set(key, result);
  return result;
}

const CAPS_OPEN = ',,,';
const CAPS_CLOSE = ",'";
const G1_OPEN = ';;;';
const G1_CLOSE = ";'";

/**
 * Checks every word of a document. Words are checked one at a time, except
 * that capitalized and grade 1 passages, which span words, are tracked from
 * their opening indicator to their terminator. liblouis can't read passages
 * itself, so inside one each word is checked without the passage indicators:
 * capitalized passages are shown in capitals, and grade 1 passages are read
 * and checked as uncontracted braille. The indicators themselves are trusted,
 * not checked. Returns feedback keyed by each word's start offset.
 */
export function checkDocument(text: string): Map<number, WordFeedback> {
  if (lastDocument?.text === text) return lastDocument.result;
  const result = new Map<number, WordFeedback>();
  let caps = false;
  let grade1 = false;
  for (const word of wordsOf(text)) {
    const lower = word.text.toLowerCase();
    const inCaps: boolean = caps || lower.includes(CAPS_OPEN);
    const inGrade1: boolean = grade1 || lower.includes(G1_OPEN);
    if (!inCaps && !inGrade1) {
      result.set(word.start, checkWord(lower));
      continue;
    }
    const indicators = [...(inCaps ? [CAPS_OPEN, CAPS_CLOSE] : []), ...(inGrade1 ? [G1_OPEN, G1_CLOSE] : [])];
    // Remove the indicators, remembering where they go back in the reference:
    // openers at the same offset from the start, terminators from the end.
    let core = lower;
    const removed: { indicator: string; fromStart: number | null; fromEnd: number | null }[] = [];
    for (const indicator of indicators) {
      const at = core.indexOf(indicator);
      if (at < 0) continue;
      core = core.slice(0, at) + core.slice(at + indicator.length);
      const opener = indicator === CAPS_OPEN || indicator === G1_OPEN;
      removed.push({ indicator, fromStart: opener ? at : null, fromEnd: opener ? null : core.length - at });
    }
    const restore = (reference: string) =>
      removed.reduceRight((ref, { indicator, fromStart, fromEnd }) => {
        const at = fromStart !== null ? Math.min(fromStart, ref.length) : Math.max(0, ref.length - fromEnd!);
        return ref.slice(0, at) + indicator + ref.slice(at);
      }, reference);
    const passage = inGrade1 ? 'grade 1' : 'capitalized';
    if (!core) {
      result.set(word.start, { braille: lower, print: '', reference: lower, status: 'matches', passage });
    } else {
      const f = checkWord(core, inGrade1 ? 1 : 2);
      result.set(word.start, {
        ...f,
        braille: lower,
        print: inCaps ? f.print.toUpperCase() : f.print,
        reference: f.reference === null ? null : restore(f.reference),
        passage,
      });
    }
    caps = inCaps && !lower.includes(CAPS_CLOSE);
    grade1 = inGrade1 && !lower.includes(G1_CLOSE);
  }
  lastDocument = { text, result };
  return result;
}

let lastDocument: { text: string; result: Map<number, WordFeedback> } | null = null;
