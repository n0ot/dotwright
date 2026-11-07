import { beforeAll, describe, expect, it } from 'vitest';
import { checkWord } from './feedback';
import { initLouis, toBraille } from './louis';
import { brailleOffsetFor, compare, sourceOffsetFor, tally, tokenAtCaret, tokenizeSource, type Written } from './source';
import { wordsOf } from './layout';

beforeAll(initLouis);

/** Writes braille words, all finished, as the page would check them. */
function written(braille: string, unfinished: number[] = []): Written[] {
  return braille.split(' ').map((b, i) => {
    const f = checkWord(b);
    return {
      braille: b,
      print: unfinished.includes(i) || f.status === 'unreadable' ? null : f.print,
      checked: !unfinished.includes(i),
    };
  });
}

function run(text: string, braille: string, unfinished: number[] = []) {
  return compare(tokenizeSource(text), written(braille, unfinished), toBraille);
}

describe('compare', () => {
  it('matches a faithful transcription', () => {
    const cmp = run('The cat sat.', ',! cat sat4');
    expect(cmp.words.map((w) => w.differences)).toEqual([[], [], []]);
    expect(cmp.finished).toBe(true);
  });

  it('names a missing capital and missing punctuation', () => {
    const cmp = run('The cat sat.', '! cat sat');
    expect(cmp.words[0].differences).toEqual(['capitals']);
    expect(cmp.words[2].differences).toEqual(['punctuation']);
    expect(tally(cmp)).toMatchObject({ capitals: 1, punctuation: 1, spelling: 0 });
  });

  it('a contraction error is not a difference from the text', () => {
    // "and" written out reads as "and", which is what the text says.
    expect(run('cats and dogs', 'cats and dogs').words[1].differences).toEqual([]);
  });

  it('finds a skipped word without blaming the words after it', () => {
    const cmp = run('the big red dog', '! r$ dog');
    expect(cmp.words.map((w) => w.differences)).toEqual([[], [], []]);
    expect(cmp.words[1].skipped).toEqual([1, 2]);
    expect(tally(cmp).skipped).toBe(1);
  });

  it('finds an extra word', () => {
    const cmp = run('the red dog', '! big r$ dog');
    expect(cmp.words[1].differences).toEqual(['extra']);
    expect(cmp.words[2].differences).toEqual([]);
  });

  it('pairs a misspelt word with its word in the text', () => {
    const cmp = run('the red dog', '! rad dog');
    expect(cmp.words[1]).toMatchObject({ from: 1, to: 2, differences: ['spelling'] });
  });

  it('treats curly and straight quotes, and dashes, as the same', () => {
    expect(run('“Hello,” she said.', '8,hello10 %e sd4').words.every((w) => w.differences.length === 0)).toBe(true);
    expect(run('a – b', 'a ,- ;b').words.every((w) => w.differences.length === 0)).toBe(true);
  });

  it('trusts correct braille that liblouis reads back wrongly', () => {
    // liblouis reads "e4g4" back as "e.go.".
    expect(run('e.g. this', 'e4g4 ?').words[0].differences).toEqual([]);
  });

  it('follows the text past a word being written, without judging it', () => {
    const cmp = run('one two three', '"o tw', [1]);
    expect(cmp.words[1].differences).toEqual([]);
    expect(cmp.reached).toBe(2);
    expect(cmp.finished).toBe(false);
  });

  it('does not report a skip until the word after it is finished', () => {
    // Writing "red" after skipping "big": the unfinished word takes "big"'s place for now.
    expect(run('the big red dog', '! r$', [1]).words[1].skipped).toBeNull();
  });

  it('is not finished until the end of the text is written', () => {
    expect(run('the red dog', '! r$').finished).toBe(false);
    expect(run('the red dog', '! r$ dog').finished).toBe(true);
  });

  it('copes with far more writing than the text', () => {
    const cmp = run('a', Array(400).fill('a').join(' '));
    expect(cmp.words[0].differences).toEqual([]);
    expect(cmp.words.at(-1)!.differences).toEqual(['extra']);
  });
});

describe('places', () => {
  const text = 'the big red dog';
  const braille = '! r$ dog';
  const tokens = tokenizeSource(text);
  const spans = wordsOf(braille);
  let cmp: ReturnType<typeof compare>;
  beforeAll(() => {
    cmp = compare(tokens, written(braille), toBraille);
  });

  it('highlights the word written for at the caret, or the next to write', () => {
    expect(tokenAtCaret(spans, cmp, 0)).toBe(0);
    expect(tokenAtCaret(spans, cmp, 3)).toBe(2);
    expect(tokenAtCaret(spans, cmp, braille.length)).toBe(3);
    expect(tokenAtCaret(wordsOf(braille + ' '), cmp, braille.length + 1)).toBe(4);
  });

  it('maps the braille caret into the text', () => {
    expect(sourceOffsetFor(spans, cmp, tokens, 3, text.length)).toBe(8);
    expect(sourceOffsetFor(spans, cmp, tokens, braille.length, text.length)).toBe(text.length);
  });

  it('maps the text back to the braille, with a skipped word at the next word', () => {
    expect(brailleOffsetFor(spans, cmp, tokens, 8, braille.length)).toBe(2);
    expect(brailleOffsetFor(spans, cmp, tokens, 4, braille.length)).toBe(2);
    expect(brailleOffsetFor(spans, cmp, tokens, 15, braille.length)).toBe(braille.length);
  });
});
