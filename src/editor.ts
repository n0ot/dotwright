import { canonicalChar, maskToChar } from './brailleAscii';
import { keepCaretOnKeyboardFocus } from './focusCaret';
import { DEFAULT_DOT_KEYS, typedChar } from './keymap';
import { CELLS_PER_LINE, hardWrap, wordAt, wordsOf, type Word } from './layout';

type EditKind = 'cell' | 'space' | 'newline' | 'delete' | 'paste' | 'cut' | 'other';

interface Snapshot {
  text: string;
  start: number;
  end: number;
}

export interface EditorEvents {
  /** The document text changed. */
  change(kind: EditKind | 'undo' | 'redo' | 'load'): void;
  /** The caret or selection moved without a text change. */
  select(): void;
  /** A cell was entered with a chord. */
  cell(ch: string): void;
  /** Undo or redo was requested with nothing to apply. */
  nothingTo(action: 'undo' | 'redo'): void;
  /** A cell or space wasn't written, because the line is full. */
  lineFull(): void;
  /** The keyboard tried to edit while keyboard editing is off. */
  keysOff(): void;
}

/** Identifies a key within a chord: the character it types, or " " for the space bar. */
function chordKey(e: KeyboardEvent): string | null {
  return e.code === 'Space' || e.key === ' ' ? ' ' : typedChar(e);
}

/**
 * A braille editor on a native textarea. The textarea holds the document's
 * Braille ASCII, line for line as in a BRF, so screen readers announce it
 * natively. As on a braillewriter, a full line takes no more cells or spaces
 * until a new line is started. Other edits that push a line past 40 cells,
 * such as pasting or joining two lines, break it (see layout.ts). It keeps its own undo history, since changing the text from script
 * invalidates the browser's.
 */
export class BrailleEditor {
  text = '';
  /** Keys for dots 1 to 6 in Perkins-style six-key entry. */
  dotKeys = DEFAULT_DOT_KEYS;
  /**
   * Whether the keyboard edits. In Slate mode it doesn't: the slate writes
   * and erases, and the keyboard only moves the cursor.
   */
  keyboardEdits = true;

  private pressed = new Set<string>();
  private chord = 0;
  private spaceInChord = false;
  private executing = false;
  private pendingKind: EditKind = 'other';

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private lastKind: EditKind | null = null;
  private lastEditTime = 0;

  /** Set while the learner is still writing the word at the caret. */
  private editing = false;
  private editAnchor = 0;
  private lastSelection = '';

  constructor(
    readonly el: HTMLTextAreaElement,
    private events: EditorEvents,
  ) {
    el.addEventListener('keydown', (e) => this.onKeyDown(e));
    el.addEventListener('keyup', (e) => this.onKeyUp(e));
    el.addEventListener('blur', () => this.resetChord());
    keepCaretOnKeyboardFocus(el, () => this.lastSelection.split(':').map(Number) as [number, number]);
    el.addEventListener('beforeinput', (e) => this.onBeforeInput(e));
    el.addEventListener('input', () => this.reconcile());
    document.addEventListener('selectionchange', () => this.onSelectionChange());
    el.addEventListener('mouseup', () => this.onSelectionChange());
    el.addEventListener('keyup', () => this.onSelectionChange());
  }

  get selectionStart(): number {
    return this.el.selectionStart;
  }

  words(): Word[] {
    return wordsOf(this.text);
  }

  /** The word the learner is still entering, which must not be flagged yet. */
  unfinishedWord(words = this.words()): Word | null {
    return this.editing ? wordAt(words, this.el.selectionStart) : null;
  }

  load(text: string): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastKind = null;
    this.editing = false;
    this.apply(hardWrap(text, true).text, 0, 0);
    this.events.change('load');
  }

  moveTo(offset: number): void {
    this.el.focus();
    this.el.setSelectionRange(offset, offset);
    this.onSelectionChange();
  }

  /** Treats the word being written as finished, so it gets feedback, as when the page is taken out to read. */
  finishWord(): void {
    this.editing = false;
  }

  /** Moves the caret without taking focus, to follow another view of the document. */
  placeCaret(offset: number): void {
    this.el.setSelectionRange(offset, offset);
    this.lastSelection = `${offset}:${offset}`;
    this.editing = false;
    this.events.select();
  }

  // ---- Slate ----------------------------------------------------------------
  //
  // The slate works like a keyboard: the learner sets dots on it, then
  // writes the cell at the caret, or erases the cell before the caret.

  /**
   * Writes a cell with these dots at the caret; no dots writes a space.
   * Returns false if the line is full, and nothing was written.
   */
  slateWrite(mask: number): boolean {
    return mask === 0 ? this.write(' ', 'space') : this.write(maskToChar(mask), 'cell');
  }

  /** True if writing one cell at the caret would take its line past the end. */
  lineIsFull(): boolean {
    const { selectionStart, selectionEnd } = this.el;
    const lineStart = this.text.lastIndexOf('\n', selectionStart - 1) + 1;
    const next = this.text.indexOf('\n', selectionEnd);
    const lineEnd = next < 0 ? this.text.length : next;
    if (this.text.slice(selectionStart, selectionEnd).includes('\n')) return false;
    return lineEnd - lineStart - (selectionEnd - selectionStart) + 1 > CELLS_PER_LINE;
  }

  /** Writes a cell or space at the caret, unless the line is full. */
  private write(ch: string, kind: 'cell' | 'space'): boolean {
    if (this.lineIsFull()) {
      this.events.lineFull();
      return false;
    }
    this.insert(ch, kind);
    if (kind === 'cell') this.events.cell(ch);
    return true;
  }

  /** Deletes the cell before the caret (a space or line break included), or the selection. */
  slateDelete(): void {
    const { selectionStart, selectionEnd } = this.el;
    if (selectionStart === selectionEnd) {
      if (selectionStart === 0) return;
      this.el.setSelectionRange(selectionStart - 1, selectionStart);
    }
    this.insert('', 'delete');
  }

  slateNewLine(): void {
    this.insert('\n', 'newline');
  }

  undo(): void {
    this.restore(this.undoStack, this.redoStack, 'undo');
  }

  redo(): void {
    this.restore(this.redoStack, this.undoStack, 'redo');
  }

  private restore(from: Snapshot[], to: Snapshot[], action: 'undo' | 'redo'): void {
    const snap = from.pop();
    if (!snap) {
      this.events.nothingTo(action);
      return;
    }
    to.push(this.snapshot());
    this.lastKind = null;
    this.editing = false;
    this.apply(snap.text, snap.start, snap.end);
    this.events.change(action);
  }

  private snapshot(): Snapshot {
    return { text: this.text, start: this.el.selectionStart, end: this.el.selectionEnd };
  }

  private recordHistory(kind: EditKind): void {
    const now = Date.now();
    const coalesce =
      kind === this.lastKind && (kind === 'cell' || kind === 'delete') && now - this.lastEditTime < 2000;
    if (!coalesce) {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > 500) this.undoStack.shift();
    }
    this.redoStack = [];
    this.lastKind = kind;
    this.lastEditTime = now;
  }

  /** Sets the document text and selection. */
  private apply(text: string, start: number, end: number): void {
    this.text = text;
    if (this.el.value !== text) this.el.value = text;
    this.el.setSelectionRange(start, end);
    this.lastSelection = `${start}:${end}`;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) {
      e.preventDefault();
      if (!this.keyboardEdits) return this.events.keysOff();
      if (e.code === 'KeyY' || e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod || e.altKey) return;
    const id = chordKey(e);
    const dot = id === null ? -1 : Array.from(this.dotKeys).indexOf(id);
    if (id !== null && (dot >= 0 || id === ' ')) {
      e.preventDefault();
      if (e.repeat) return;
      this.pressed.add(id);
      if (dot >= 0) this.chord |= 1 << dot;
      else this.spaceInChord = true;
      return;
    }
    // Only six-key entry writes braille; other typing keys do nothing.
    if (e.key.length === 1) e.preventDefault();
  }

  private onKeyUp(e: KeyboardEvent): void {
    const id = chordKey(e);
    if (id === null || !this.pressed.delete(id) || this.pressed.size > 0) return;
    const chord = this.chord;
    const space = this.spaceInChord;
    this.resetChord();
    if ((chord || space) && !this.keyboardEdits) this.events.keysOff();
    else if (chord) this.write(maskToChar(chord), 'cell');
    else if (space) this.write(' ', 'space');
  }

  private resetChord(): void {
    this.pressed.clear();
    this.chord = 0;
    this.spaceInChord = false;
  }

  private insert(str: string, kind: EditKind): void {
    // The native command edits whatever has focus, so only use it when the
    // document does; slate taps can arrive while focus is elsewhere.
    if (document.activeElement !== this.el) this.beginEdit(kind);
    else if (this.exec(kind, str ? 'insertText' : 'delete', str || undefined)) return;
    this.el.setRangeText(str, this.el.selectionStart, this.el.selectionEnd, 'end');
    this.reconcile();
  }

  /**
   * Runs an editing command as a native text edit, which screen readers track.
   * Chrome doesn't fire beforeinput for execCommand, so the edit is recorded here.
   */
  private exec(kind: EditKind, command: string, value?: string): boolean {
    this.beginEdit(kind);
    this.executing = true;
    try {
      return document.execCommand(command, false, value);
    } finally {
      this.executing = false;
    }
  }

  private onBeforeInput(e: InputEvent): void {
    // Typing, Enter, Backspace, cut, paste and undo from the keyboard or a menu.
    if (!this.keyboardEdits && !this.executing) {
      e.preventDefault();
      this.events.keysOff();
      return;
    }
    if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
      e.preventDefault();
      if (e.inputType === 'historyUndo') this.undo();
      else this.redo();
      return;
    }
    if (this.executing) return;
    const kind =
      e.inputType.startsWith('delete')
        ? e.inputType === 'deleteByCut'
          ? 'cut'
          : 'delete'
        : e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph'
          ? 'newline'
          : e.inputType === 'insertFromPaste'
            ? 'paste'
            : 'other';
    this.beginEdit(kind);
  }

  private beginEdit(kind: EditKind): void {
    this.pendingKind = kind;
    this.recordHistory(kind);
  }

  /**
   * Cleans up after a native edit: characters that aren't Braille ASCII are
   * dropped from the edited region, and a line pushed past 40 cells is broken.
   */
  private reconcile(): void {
    const kind = this.pendingKind;
    this.pendingKind = 'other';
    const before = this.text;
    const after = this.el.value;
    let p = 0;
    while (p < before.length && p < after.length && before[p] === after[p]) p++;
    let q = 0;
    while (q < before.length - p && q < after.length - p && before[before.length - 1 - q] === after[after.length - 1 - q]) {
      q++;
    }
    const regionEnd = after.length - q;
    let cleaned = '';
    for (const ch of after.slice(p, regionEnd)) {
      if (ch === '\n' || ch === ' ') cleaned += ch;
      else if (ch === '\t') cleaned += ' ';
      else cleaned += canonicalChar(ch) ?? '';
    }
    const removed = regionEnd - p - cleaned.length;
    let caret = this.el.selectionStart;
    if (caret >= regionEnd) caret -= removed;
    else if (caret > p) caret = Math.min(caret, p + cleaned.length);

    const wrapped = hardWrap(after.slice(0, p) + cleaned + after.slice(regionEnd), true);
    caret += wrapped.inserted.filter((offset) => offset < caret).length;
    this.apply(wrapped.text, caret, caret);

    this.editing = kind === 'cell' || kind === 'delete';
    this.editAnchor = caret;
    this.events.change(kind);
  }

  private onSelectionChange(): void {
    if (document.activeElement !== this.el) return;
    const key = `${this.el.selectionStart}:${this.el.selectionEnd}`;
    if (key === this.lastSelection) return;
    this.lastSelection = key;
    if (this.editing) {
      const words = this.words();
      const anchorWord = wordAt(words, this.editAnchor);
      const caretWord = wordAt(words, this.el.selectionStart);
      if (!anchorWord || anchorWord !== caretWord) this.editing = false;
    }
    this.events.select();
  }
}
