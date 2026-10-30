const STORAGE_KEY = 'dotwright.prefs.v2';

/** Per-viewer display and speech preferences, kept in this browser. */
export interface Prefs {
  /** Show faint points at unraised dot positions. */
  shadowDots: boolean;
  /** Announce each cell as it is entered. */
  echoCells: boolean;
}

const DEFAULTS: Prefs = { shadowDots: true, echoCells: true };

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
