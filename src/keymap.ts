import { spokenName } from './brailleAscii';

/**
 * The keys that enter dots 1 to 6, in order. Keys are matched by the
 * character they type, so learners can pick keys that suit their keyboard
 * layout. The space bar always enters a space.
 */
export const DEFAULT_DOT_KEYS = 'fdsjkl';

const STORAGE_KEY = 'dotwright.dotkeys.v1';

/** The character a key event types, lowercased, or null if it types none (or a space). */
export function typedChar(e: KeyboardEvent): string | null {
  return Array.from(e.key).length === 1 && e.key !== ' ' ? e.key.toLowerCase() : null;
}

/** Normalizes typed dot keys; returns an error message if they can't be used. */
export function parseDotKeys(input: string): { keys: string } | { error: string } {
  // Spaces only separate keys; the space bar can't be a dot.
  const keys = Array.from(input.replace(/\s+/g, '').toLowerCase());
  if (keys.length !== 6) return { error: `Enter 6 keys, one for each dot. You entered ${keys.length}.` };
  const repeated = keys.find((ch, i) => keys.indexOf(ch) !== i);
  if (repeated) return { error: `Each dot needs a different key; ${repeated} is used more than once.` };
  return { keys: keys.join('') };
}

/** Names symbol keys, since screen readers may skip punctuation in announcements. */
export function describeDotKeys(keys: string): string {
  const name = (ch: string) => (ch === '.' ? 'period' : spokenName(ch));
  return `Dots 1 to 6: ${Array.from(keys).map(name).join(' ')}. Space bar: space.`;
}

export function loadDotKeys(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseDotKeys(stored);
      if ('keys' in parsed) return parsed.keys;
    }
  } catch {
    // Fall through to the default keys.
  }
  return DEFAULT_DOT_KEYS;
}

export function saveDotKeys(keys: string): void {
  try {
    if (keys === DEFAULT_DOT_KEYS) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, keys);
  } catch {
    // Not stored; the keys still apply for this session.
  }
}
