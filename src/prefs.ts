const STORAGE_KEY = 'dotwright.prefs.v2';

/** Per-viewer display and speech preferences, kept in this browser. */
export interface Prefs {
  /** Show faint points at unraised dot positions. */
  shadowDots: boolean;
  /** Announce each cell as it is entered. */
  echoCells: boolean;
  /** Play sounds: the slate's clicks, the margin bell, and the knock when nothing can be written. */
  sounds: boolean;
  /** Number the slate's dots, for a learner still finding the mirrored positions. Off: it gives them away. */
  slateNumbers: boolean;
  /**
   * Interline the word being written after every cell, not only once it's
   * finished. Off by default: the reading changing as she writes distracts.
   */
  liveInterlining: boolean;
  /** Ring a bell near the end of a line, like a braillewriter's margin bell, when sounds are on. */
  marginBell: boolean;
  /**
   * The mode last used: Brailler ("front"), with six-key entry on the page as
   * read, or Slate ("back"), on the page mirrored as on a slate.
   */
  side: 'front' | 'back';
}

export const DEFAULTS: Readonly<Prefs> = {
  shadowDots: true,
  echoCells: true,
  sounds: true,
  slateNumbers: false,
  marginBell: true,
  liveInterlining: false,
  side: 'front',
};

export function loadPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Not stored; the preferences still apply for this session.
  }
}
