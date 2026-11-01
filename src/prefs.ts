const STORAGE_KEY = 'dotwright.prefs.v2';

/** Per-viewer display and speech preferences, kept in this browser. */
export interface Prefs {
  /** Show faint points at unraised dot positions. */
  shadowDots: boolean;
  /** Announce each cell as it is entered. */
  echoCells: boolean;
  /** Play a click when a dot is punched on the slate. */
  slateClicks: boolean;
  /**
   * Interline the word being written after every cell, not only once it's
   * finished. Off by default: the reading changing as she writes distracts.
   */
  liveInterlining: boolean;
  /** Ring a bell near the end of a line, like a braillewriter's margin bell. */
  marginBell: boolean;
  /**
   * The mode last used: Brailler ("front"), with six-key entry on the page as
   * read, or Slate ("back"), on the page mirrored as on a slate.
   */
  side: 'front' | 'back';
}

const DEFAULTS: Prefs = { shadowDots: true, echoCells: true, slateClicks: true, marginBell: true, liveInterlining: false, side: 'front' };

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
