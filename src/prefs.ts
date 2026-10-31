const STORAGE_KEY = 'dotwright.prefs.v2';

/** Per-viewer display and speech preferences, kept in this browser. */
export interface Prefs {
  /** Show faint points at unraised dot positions. */
  shadowDots: boolean;
  /** Announce each cell as it is entered. */
  echoCells: boolean;
  /** Show the slate, for writing cells by tapping or clicking dots. */
  showSlate: boolean;
  /** Play a click when a dot is punched on the slate. */
  slateClicks: boolean;
  /** The side of the page last shown: the front as read, or the back as written on a slate. */
  side: 'front' | 'back';
}

const DEFAULTS: Prefs = { shadowDots: true, echoCells: true, showSlate: true, slateClicks: true, side: 'front' };

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
