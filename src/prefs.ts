const STORAGE_KEY = 'dotwright.prefs.v2';

/** Per-viewer display and speech preferences, kept in this browser. */
export type FeedbackWhen = 'cell' | 'word' | 'line';

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
   * When feedback is given: the print of the word being written after every
   * cell (it's still only checked once finished), each word once it's
   * finished, or each line once it's finished. Words by default: the reading
   * changing with every cell distracts some learners.
   */
  feedbackWhen: FeedbackWhen;
  /** Feedback on at all; the Feedback switch, and Off in Settings. */
  feedbackOn: boolean;
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
  feedbackWhen: 'word',
  feedbackOn: true,
  side: 'front',
};

export function loadPrefs(): Prefs {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Prefs> & { liveInterlining?: boolean };
    // Interlining as each cell is written used to be a setting of its own.
    if (stored.liveInterlining && !stored.feedbackWhen) stored.feedbackWhen = 'cell';
    delete stored.liveInterlining;
    return { ...DEFAULTS, ...stored };
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
