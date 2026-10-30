// North American Braille ASCII, indexed by dot mask (dot 1 = bit 0 ... dot 6 = bit 5).
const ASCII_BY_MASK = " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=";

const LOWER_ALIASES: Record<string, string> = { '`': '@', '{': '[', '|': '\\', '}': ']', '~': '^' };

/**
 * The editor stores braille as Braille ASCII with lowercase letters, so screen
 * readers announce "a" rather than "cap a" during character navigation.
 */
export function maskToChar(mask: number): string {
  return ASCII_BY_MASK[mask].toLowerCase();
}

/** Dot mask for a Braille ASCII character in either case, or -1 if it isn't one. */
export function charToMask(ch: string): number {
  const upper = LOWER_ALIASES[ch] ?? ch.toUpperCase();
  return upper.length === 1 ? ASCII_BY_MASK.indexOf(upper) : -1;
}

/** Normalizes any Braille ASCII text to the editor's canonical form. Unknown characters become null. */
export function canonicalChar(ch: string): string | null {
  const mask = charToMask(ch);
  return mask < 0 ? null : maskToChar(mask);
}

export function asciiToUnicode(text: string): string {
  let out = '';
  for (const ch of text) {
    const mask = charToMask(ch);
    out += mask < 0 ? ch : String.fromCharCode(0x2800 + mask);
  }
  return out;
}

export function unicodeToAscii(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out += code >= 0x2800 && code < 0x2840 ? maskToChar(code - 0x2800) : ch;
  }
  return out;
}

export function dotsOf(mask: number): string {
  const dots = [1, 2, 3, 4, 5, 6].filter((d) => mask & (1 << (d - 1)));
  return dots.length ? dots.join('') : 'blank';
}

const SPOKEN: Record<string, string> = {
  ' ': 'space', '!': 'exclamation', '"': 'quote', '#': 'number', $: 'dollar', '%': 'percent',
  '&': 'ampersand', "'": 'apostrophe', '(': 'left paren', ')': 'right paren', '*': 'star',
  '+': 'plus', ',': 'comma', '-': 'dash', '.': 'dot', '/': 'slash', ':': 'colon',
  ';': 'semicolon', '<': 'less', '=': 'equals', '>': 'greater', '?': 'question', '@': 'at',
  '[': 'left bracket', '\\': 'backslash', ']': 'right bracket', '^': 'caret', _: 'underline',
};

/**
 * Speakable name for a Braille ASCII character. Live-region text is read with
 * the screen reader's punctuation settings, which often skip symbols, so
 * symbols are given as words.
 */
export function spokenName(ch: string): string {
  return SPOKEN[ch] ?? ch;
}

export function spell(braille: string): string {
  return [...braille].map(spokenName).join(' ');
}
