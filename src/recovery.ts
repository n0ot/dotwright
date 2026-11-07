const KEY = 'dotwright.recovery.v1';

/** A browser-local copy of the working document, kept only to survive an accidental refresh. */
export interface RecoveryCopy {
  text: string;
  fileName: string | null;
  /** The text as last saved to a BRF file, or null if never saved. */
  savedText: string | null;
  /** The text being transcribed, if any. It isn't saved in the BRF file. */
  source?: string;
}

export function loadRecovery(): RecoveryCopy | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const copy = JSON.parse(raw) as RecoveryCopy;
    return typeof copy.text === 'string' ? copy : null;
  } catch {
    return null;
  }
}

/** Returns false if the copy could not be stored. */
export function writeRecovery(copy: RecoveryCopy): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(copy));
    return true;
  } catch {
    return false;
  }
}

export function clearRecovery(): boolean {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
