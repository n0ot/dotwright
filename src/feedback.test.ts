import { beforeAll, describe, expect, it } from 'vitest';
import { checkDocument, checkWord } from './feedback';
import { initLouis, toBraille } from './louis';
import { formatBrf, parseBrf } from './brf';
import { hardWrap, lineNumberOf, offsetOf, positionOf } from './layout';
import { charToMask, maskToChar } from './brailleAscii';
import { parseDotKeys } from './keymap';

beforeAll(initLouis);

describe('Braille ASCII', () => {
  it('maps dots 2-5-6 to "4"', () => {
    expect(maskToChar(0b110010)).toBe('4');
    expect(charToMask('4')).toBe(0b110010);
    expect(charToMask('A')).toBe(charToMask('a'));
  });
});

describe('checkWord', () => {
  it('accepts the contracted form', () => {
    expect(checkWord('&')).toMatchObject({ print: 'and', status: 'matches' });
    expect(checkWord(',!')).toMatchObject({ print: 'The', status: 'matches' });
  });
  it('flags an uncontracted word and offers the reference', () => {
    expect(checkWord('and')).toMatchObject({ print: 'and', status: 'differs', reference: '&' });
    expect(checkWord('knowledge')).toMatchObject({ status: 'differs', reference: 'k' });
  });
  it('reports cells it cannot interpret instead of guessing', () => {
    expect(checkWord('@@')).toMatchObject({ print: '??', status: 'unreadable', reference: null });
  });
  it('shows the learner’s reading, not a corrected word', () => {
    expect(checkWord('sa9').print).toBe('sain');
  });
});

describe('passages', () => {
  const statuses = (text: string) => [...checkDocument(text).values()].map((f) => [f.print, f.status, f.reference]);
  it('reads a capitalized passage in capitals and checks contractions inside it', () => {
    expect(statuses(",,,! cat sat,' on ! mat4")).toEqual([
      ['THE', 'matches', ',,,!'],
      ['CAT', 'matches', 'cat'],
      ['SAT', 'matches', "sat,'"],
      ['on', 'matches', 'on'],
      ['the', 'matches', '!'],
      ['mat.', 'matches', 'mat4'],
    ]);
    expect(statuses(',,,and cat')[0]).toEqual(['AND', 'differs', ',,,&']);
  });
  it('keeps an opening indicator after punctuation in place', () => {
    expect(statuses('8,,,! cat')[0][2]).toBe('8,,,!');
  });
  it('reads a grade 1 passage uncontracted and flags contraction signs in it', () => {
    expect(statuses(";;;k ab;' ab")).toEqual([
      ['k', 'matches', ';;;k'],
      ['ab', 'matches', "ab;'"],
      ['about', 'matches', 'ab'],
    ]);
    expect(statuses(';;;& cat')[0][1]).toBe('unreadable');
  });
});

describe('layout', () => {
  const x40 = 'x'.repeat(40);
  it('moves the word that passes cell 40 to a new line, replacing its space', () => {
    expect(hardWrap(`${'a'.repeat(38)} b?cd`, true)).toEqual({ text: `${'a'.repeat(38)}\nb?cd`, inserted: [] });
  });
  it('breaks after cell 40 when there is no space, reporting the inserted break', () => {
    expect(hardWrap(`${x40}yz`, true)).toEqual({ text: `${x40}\nyz`, inserted: [40] });
    expect(hardWrap(`ab\n${x40} yz`, false)).toEqual({ text: `ab\n${x40}\n yz`, inserted: [43] });
  });
  it('leaves lines of 40 cells or fewer alone and never joins lines', () => {
    expect(hardWrap(`${x40}\nshort\n`, true).text).toBe(`${x40}\nshort\n`);
  });
  it('reports page, line and cell', () => {
    const text = 'x\n'.repeat(30);
    expect(positionOf(text, 27 * 2 + 1)).toEqual({ page: 2, line: 3, cell: 2 });
  });
});

describe('go to', () => {
  const text = 'abc\n' + 'x\n'.repeat(30);
  it('finds the offset of a line and cell, counting lines through the document', () => {
    expect(offsetOf(text, 1, 3)).toEqual({ offset: 2, cell: 3 });
    expect(offsetOf(text, 26, 1)).toEqual({ offset: 4 + 24 * 2, cell: 1 });
    expect(lineNumberOf(text, 4 + 24 * 2)).toBe(26);
  });
  it('goes to the end of a short line and refuses lines that do not exist', () => {
    expect(offsetOf(text, 1, 9)).toEqual({ offset: 3, cell: 4 });
    expect(offsetOf(text, 40, 1)).toEqual({ error: 'Enter a line from 1 to 32.' });
    expect(offsetOf(text, 1, 0)).toHaveProperty('error');
  });
});

describe('BRF', () => {
  it('opens a file line for line and saves it back the same', () => {
    const brf = ',CHAPTER #A\r\n\r\n  ,! D  WAS LONG4\r\n';
    expect(parseBrf(brf).text).toBe(',chapter #a\n\n  ,! d  was long4');
    expect(formatBrf(parseBrf(brf).text)).toBe(brf);
  });
  it('paginates at 25 lines', () => {
    expect(formatBrf('a\n'.repeat(30).trim()).split('\f').length).toBe(2);
  });
  it('keeps a short page by filling it with blank lines', () => {
    const { text } = parseBrf('A\r\nB\r\n\fC\r\n');
    expect(text.split('\n')).toEqual(['a', 'b', ...Array(23).fill(''), 'c']);
  });
  it('breaks lines longer than 40 cells after cell 40', () => {
    expect(parseBrf('X'.repeat(45)).text).toBe(`${'x'.repeat(40)}\nxxxxx`);
  });
  it('keeps uncorrected braille', () => {
    expect(formatBrf('and the')).toBe('AND THE\r\n');
  });
});

describe('liblouis', () => {
  it('forward-translates to fully contracted UEB', () => {
    expect(toBraille('The knowledge and the children.')).toBe(',! k & ! *n4');
  });
});

describe('dot keys', () => {
  it('accepts six different typable keys, with or without spaces', () => {
    expect(parseDotKeys('F D S J K L')).toEqual({ keys: 'fdsjkl' });
    expect(parseDotKeys('dcxh,.')).toEqual({ keys: 'dcxh,.' });
  });
  it('rejects the wrong number of keys or a repeated key', () => {
    expect(parseDotKeys('fds')).toHaveProperty('error');
    expect(parseDotKeys('fdsjkf')).toHaveProperty('error');
  });
});
