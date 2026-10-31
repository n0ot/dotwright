import './style.css';
import { Announcer } from './announcer';
import { spell, spokenName } from './brailleAscii';
import { formatBrf, parseBrf } from './brf';
import { BrailleEditor } from './editor';
import { checkDocument, type WordFeedback } from './feedback';
import { openBrf, saveBrf, type FileHandle } from './files';
import { LINES_PER_PAGE, lineNumberOf, offsetOf, positionOf, wordAt, type Word } from './layout';
import { DEFAULT_DOT_KEYS, describeDotKeys, loadDotKeys, parseDotKeys, saveDotKeys } from './keymap';
import { keepCaretOnKeyboardFocus } from './focusCaret';
import { initLouis } from './louis';
import { playClick } from './click';
import { SLATE_ICONS } from './slateIcons';
import { loadPrefs, savePrefs } from './prefs';
import { clearRecovery, loadRecovery, writeRecovery } from './recovery';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const textarea = byId<HTMLTextAreaElement>('editor');
const overlay = byId('overlay');
const popover = byId('word-popover');
const fileStatus = byId('file-status');
const recoveryWarning = byId('recovery-warning');
const feedbackButton = byId('toggle-feedback');
const saveAsButton = byId('save-as-doc');
const help = byId<HTMLDialogElement>('help');
const printView = byId<HTMLTextAreaElement>('print-view');
const currentKeys = byId('current-keys');
const keysDialog = byId<HTMLDialogElement>('keys-dialog');
const saveDialog = byId<HTMLDialogElement>('save-dialog');
const saveForm = byId<HTMLFormElement>('save-form');
const fileNameInput = byId<HTMLInputElement>('file-name');
const fileNameError = byId('file-name-error');
const gotoDialog = byId<HTMLDialogElement>('goto-dialog');
const gotoForm = byId<HTMLFormElement>('goto-form');
const gotoLine = byId<HTMLInputElement>('goto-line');
const gotoCell = byId<HTMLInputElement>('goto-cell');
const gotoError = byId('goto-error');
const keysForm = byId<HTMLFormElement>('keys-form');
const dotKeysInput = byId<HTMLInputElement>('dot-keys');
const dotKeysError = byId('dot-keys-error');
const settingsDialog = byId<HTMLDialogElement>('settings-dialog');
const showEmptyDots = byId<HTMLInputElement>('show-empty-dots');
const showSlateInput = byId<HTMLInputElement>('show-slate');
const slateClicksInput = byId<HTMLInputElement>('slate-clicks');
const echoCellsInput = byId<HTMLInputElement>('echo-cells');
const settingsKeys = byId('settings-keys');

/**
 * The page's geometry, smaller on narrow screens such as phones. Set on the
 * page as CSS variables, which #editor in style.css uses.
 */
const narrowScreen = matchMedia('(max-width: 640px)');
let FONT_SIZE = 30;
let LINE = 84;
let PAD = 28;
let TOP = 12;
let GLYPH_TOP = 0;

function setGeometry() {
  const narrow = narrowScreen.matches;
  FONT_SIZE = narrow ? 22 : 30;
  LINE = narrow ? 64 : 84;
  PAD = narrow ? 16 : 28;
  TOP = narrow ? 10 : 12;
  GLYPH_TOP = TOP + (LINE - FONT_SIZE * 1.04) / 2;
  const style = document.documentElement.style;
  style.setProperty('--font', `${FONT_SIZE}px`);
  style.setProperty('--line', `${LINE}px`);
  style.setProperty('--pad', `${PAD}px`);
  style.setProperty('--top', `${TOP}px`);
  style.setProperty('--gutter', narrow ? '44px' : '64px');
}
setGeometry();

let cell = FONT_SIZE * 0.6;
let feedbackOn = true;
const prefs = loadPrefs();
/** Which side of the page is shown. The back is the braille as punched on a slate, without feedback. */
let side: 'front' | 'back' = prefs.side === 'back' ? 'back' : 'front';
const feedbackShown = () => feedbackOn && side === 'front';
const feedbackHiddenMessage = () =>
  side === 'back' ? 'This is the back of the page. Alt+F flips it to show feedback.' : 'Feedback is off. Alt+T turns it on.';
let echoCells = prefs.echoCells;
let fileName: string | null = null;
let fileHandle: FileHandle | null = null;
let savedText: string | null = null;
let savedBy: 'file' | 'download' | null = null;
let revealedAt: number | null = null;
let recoveryTimer = 0;
/** Start of the word with an error that the caret is in, for "contraction error" announcements. */
let errorWordStart: number | null = null;

const announcer = new Announcer(byId('announcements'));
const say = (message: string) => announcer.say(message);

const editor = new BrailleEditor(textarea, {
  change(kind) {
    if (kind === 'space' || kind === 'newline') announceCompletedWord(kind);
    else if (kind === 'undo' || kind === 'redo') say(kind === 'undo' ? 'Undo' : 'Redo');
    dropRevealIfMoved();
    errorWordStart = errorWordAtCaret();
    scheduleRecovery();
    render();
  },
  select() {
    dropRevealIfMoved();
    announceErrorChange();
    render();
  },
  cell(ch) {
    if (echoCells) say(spokenName(ch));
  },
  nothingTo(action) {
    say(`Nothing to ${action}`);
  },
});

// ---- Feedback -------------------------------------------------------------

interface WordState {
  word: Word;
  /** Null while the word is unfinished. */
  feedback: WordFeedback | null;
}

function wordStates(): WordState[] {
  const words = editor.words();
  const unfinished = editor.unfinishedWord(words);
  const feedback = checkDocument(editor.text);
  return words.map((word) => ({ word, feedback: word === unfinished ? null : feedback.get(word.start)! }));
}

function stateAtCaret(): WordState | null {
  const states = wordStates();
  const word = wordAt(
    states.map((s) => s.word),
    editor.selectionStart,
  );
  return states.find((s) => s.word === word) ?? null;
}

const isIssue = (f: WordFeedback | null) => f?.status === 'differs' || f?.status === 'unreadable';

function statusText(f: WordFeedback): string {
  const inGrade1 = f.passage === 'grade 1' ? ' in a grade 1 passage' : '';
  switch (f.status) {
    case 'matches':
      return `No contraction error${inGrade1}.`;
    case 'differs':
      return `Contraction error${inGrade1}.`;
    case 'unreadable':
      return `Can't read this braille${inGrade1}.`;
    case 'no-reference':
      return 'No correct form is available for this word.';
  }
}

/** Short name of a word's problem, for announcements. */
const issueName = (f: WordFeedback) => (f.status === 'unreadable' ? "can't read" : 'contraction error');

function errorWordAtCaret(): number | null {
  if (!feedbackShown()) return null;
  const state = stateAtCaret();
  return state && isIssue(state.feedback) ? state.word.start : null;
}

/**
 * Says "contraction error" when the caret moves onto a word with an error and
 * "out of contraction error" when it leaves, once per word, so reading cell
 * by cell inside a word isn't interrupted.
 */
function announceErrorChange() {
  const now = errorWordAtCaret();
  if (now === errorWordStart) return;
  const was = errorWordStart;
  errorWordStart = now;
  if (now !== null) say(issueName(checkDocument(editor.text).get(now)!));
  else if (was !== null) say('out of contraction error');
}

function announceCompletedWord(kind: 'space' | 'newline') {
  const caret = editor.selectionStart;
  const word = editor.words().find((w) => w.end === caret - 1);
  const parts: string[] = [];
  if (echoCells) parts.push(kind === 'space' ? 'space' : 'new line');
  if (feedbackShown() && word) {
    const f = checkDocument(editor.text).get(word.start)!;
    if (isIssue(f)) parts.push(issueName(f));
  }
  if (parts.length) say(parts.join(', '));
}

function dropRevealIfMoved() {
  if (revealedAt === null) return;
  if (stateAtCaret()?.word.start !== revealedAt) revealedAt = null;
}

function speakWordFeedback() {
  if (!feedbackShown()) return say(feedbackHiddenMessage());
  const state = stateAtCaret();
  if (!state) return say('No word at the cursor.');
  const f = state.feedback;
  if (!f) return say(`Unfinished word: ${spell(state.word.text)}. Feedback appears after Space or Enter.`);
  say(`${f.print}. ${statusText(f)}${f.status === 'differs' ? ' Alt+R shows the correct form.' : ''}`);
}

function revealReference() {
  if (!feedbackShown()) return say(feedbackHiddenMessage());
  const state = stateAtCaret();
  if (!state) return say('No word at the cursor.');
  const f = state.feedback;
  if (!f) return say('Finish the word with Space or Enter first.');
  if (!f.reference) return say(statusText(f));
  revealedAt = state.word.start;
  render();
  say(
    f.reference === f.braille
      ? `Correct form: ${spell(f.reference)}. Same as your entry.`
      : `Correct form: ${spell(f.reference)}. Your entry: ${spell(f.braille)}.`,
  );
}

function hideReference() {
  if (revealedAt === null) return;
  revealedAt = null;
  render();
  say('Correct form hidden.');
}

function moveToIssue(direction: 1 | -1) {
  if (!feedbackShown()) return say(feedbackHiddenMessage());
  const issues = wordStates().filter((s) => isIssue(s.feedback));
  if (!issues.length) return say('No contraction errors.');
  const caret = editor.selectionStart;
  const target =
    direction === 1
      ? (issues.find((s) => s.word.start > caret) ?? issues[0])
      : (issues.findLast((s) => s.word.end < caret) ?? issues.at(-1)!);
  // This announcement says more than the one for moving onto the word.
  errorWordStart = target.word.start;
  if (document.activeElement === printView) {
    editor.placeCaret(target.word.start);
    const offset = printOffsetFor(target.word.start);
    printView.setSelectionRange(offset, offset);
    lastPrintCaret = offset;
  } else {
    editor.moveTo(target.word.start);
  }
  const f = target.feedback!;
  const { page, line } = positionOf(editor.text, target.word.start);
  say(`${f.print}. ${statusText(f)} Page ${page}, line ${line}.`);
}

function toggleFeedback() {
  feedbackOn = !feedbackOn;
  feedbackButton.setAttribute('aria-checked', String(feedbackOn));
  if (!feedbackShown() && document.activeElement === printView) textarea.focus();
  revealedAt = null;
  errorWordStart = errorWordAtCaret();
  render();
  say(feedbackOn ? 'Feedback on.' : 'Feedback off.');
}

// ---- Rendering ------------------------------------------------------------

function measureCell() {
  const probe = document.createElement('span');
  probe.style.cssText = `font: ${FONT_SIZE}px 'Dotwright Braille'; position: absolute; visibility: hidden; white-space: pre`;
  probe.textContent = 'a'.repeat(40);
  document.body.append(probe);
  cell = probe.getBoundingClientRect().width / 40;
  probe.remove();
  document.documentElement.style.setProperty('--cell', `${cell}px`);
}

const labelFont = (bold: boolean) => `${bold ? '600 ' : ''}14px ${getComputedStyle(document.body).fontFamily}`;
const measureCtx = document.createElement('canvas').getContext('2d')!;

function place(className: string, left: number, top: number, width?: number, text?: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  if (width !== undefined) el.style.width = `${width}px`;
  if (text !== undefined) el.textContent = text;
  overlay.append(el);
  return el;
}

function render() {
  const display = editor.text;
  const lineStarts = [0];
  for (let i = 0; i < display.length; i++) if (display[i] === '\n') lineStarts.push(i + 1);
  textarea.style.height = `${lineStarts.length * LINE + 2 * TOP}px`;
  overlay.replaceChildren();
  if (prefs.shadowDots) place('dot-shadows', 0, 0, undefined, display);

  const lineOf = (offset: number) => {
    let i = lineStarts.length - 1;
    while (lineStarts[i] > offset) i--;
    return i;
  };

  for (let i = 0; i < lineStarts.length; i += LINES_PER_PAGE) {
    if (i > 0) place('page-break', 0, TOP + i * LINE);
    place('page-label', 0, TOP + i * LINE + 6, undefined, `Page ${i / LINES_PER_PAGE + 1}`).style.left = 'auto';
  }

  const states = wordStates();
  const caretWord = wordAt(
    states.map((s) => s.word),
    editor.selectionStart,
  );
  if (caretWord) {
    const line = lineOf(caretWord.start);
    const col = caretWord.start - lineStarts[line];
    place('current-word', PAD + col * cell - 2, line * LINE + GLYPH_TOP, (caretWord.end - caretWord.start) * cell + 4).style.height =
      `${FONT_SIZE * 1.04}px`;
  }

  // Where the slate writes: the cell it's punching, or the next cell. On the
  // front, an invisible marker at the caret, for scrolling it into view.
  {
    const writing = side === 'back' ? editor.slateCell() : null;
    const at = writing ?? editor.selectionStart;
    const line = lineOf(at);
    const col = at - lineStarts[line];
    const className = prefs.showSlate && side === 'back' ? `slate-cursor${writing === null ? '' : ' writing'}` : 'caret-spot';
    place(className, PAD + col * cell - 2, line * LINE + GLYPH_TOP - 4, cell + 4).style.height = `${FONT_SIZE * 1.04 + 8}px`;
  }

  if (feedbackShown()) {
    let lastLine = -1;
    let lastRight = 0;
    for (const { word, feedback } of states) {
      if (!feedback) continue;
      const line = lineOf(word.start);
      const col = word.start - lineStarts[line];
      const x = PAD + col * cell;
      const top = line * LINE;
      const issue = isIssue(feedback);
      // Print is usually wider than its braille; shift labels right rather than overlap.
      measureCtx.font = labelFont(issue);
      const labelWidth = measureCtx.measureText(feedback.print).width;
      const labelX = line === lastLine ? Math.max(x, lastRight + 6) : x;
      lastLine = line;
      lastRight = labelX + labelWidth;
      place(`print${issue ? ` ${feedback.status}` : ''}`, labelX, top + GLYPH_TOP - 19, undefined, feedback.print);
      if (issue) place(`mark ${feedback.status}`, x, top + GLYPH_TOP + FONT_SIZE * 0.86, (word.end - word.start) * cell);
    }
  }

  const caretState = states.find((s) => s.word === caretWord) ?? null;
  renderPopover(caretState, caretState ? lineOf(caretState.word.start) : 0, lineStarts);
  renderPrintView(states, lineOf, lineStarts.length);
  renderFileStatus();
  renderSlate();
}

// ---- Print view -----------------------------------------------------------

/**
 * A visually hidden, read-only text field holding the print interlining line
 * for line, so screen-reader users can read the print with ordinary text
 * navigation. Its caret and the braille caret follow each other by word.
 */
interface PrintSpan {
  start: number;
  end: number;
  word: Word;
}
let printSpans: PrintSpan[] = [];

function renderPrintView(states: WordState[], lineOf: (offset: number) => number, lineCount: number) {
  printView.hidden = !feedbackShown();
  if (!feedbackShown()) return;
  let text = '';
  let line = 0;
  let lineHasWord = false;
  printSpans = [];
  for (const { word, feedback } of states) {
    const wordLine = lineOf(word.start);
    for (; line < wordLine; line++) {
      text += '\n';
      lineHasWord = false;
    }
    if (lineHasWord) text += ' ';
    // Unfinished words aren't interlined on the sheet, but here the learner asked to read the print.
    const print = (feedback ?? checkDocument(editor.text).get(word.start)!).print;
    printSpans.push({ start: text.length, end: text.length + print.length, word });
    text += print;
    lineHasWord = true;
  }
  for (; line < lineCount - 1; line++) text += '\n';
  if (printView.value !== text) printView.value = text;
  if (document.activeElement !== printView) {
    const offset = printOffsetFor(editor.selectionStart);
    printView.setSelectionRange(offset, offset);
  }
}

function printOffsetFor(brailleOffset: number): number {
  const span = printSpans.find((p) => p.word.start <= brailleOffset && brailleOffset <= p.word.end);
  if (span) return brailleOffset >= span.word.end && brailleOffset > span.word.start ? span.end : span.start;
  return printSpans.find((p) => p.word.start > brailleOffset)?.start ?? printView.value.length;
}

function brailleOffsetFor(printOffset: number): number {
  const span = printSpans.find((p) => p.start <= printOffset && printOffset <= p.end);
  if (span) return printOffset === span.end && printOffset > span.start ? span.word.end : span.word.start;
  return (
    printSpans.find((p) => p.start > printOffset)?.word.start ?? printSpans.at(-1)?.word.end ?? editor.text.length
  );
}

let lastPrintCaret = -1;
function followPrintCaret() {
  if (document.activeElement !== printView || printView.selectionStart === lastPrintCaret) return;
  lastPrintCaret = printView.selectionStart;
  const offset = brailleOffsetFor(lastPrintCaret);
  if (offset !== editor.selectionStart) editor.placeCaret(offset);
}

// Not a readonly field, because Chrome won't move the caret in one; edits are refused instead.
printView.addEventListener('beforeinput', (e) => e.preventDefault());
printView.addEventListener('input', () => render());
document.addEventListener('selectionchange', followPrintCaret);
printView.addEventListener('keyup', followPrintCaret);
printView.addEventListener('mouseup', followPrintCaret);
// VoiceOver in Safari speaks only the character at the caret when focus moves
// between these two fields, without naming the field, so name it.
if (/Apple/.test(navigator.vendor)) {
  const fieldNames = new Map<EventTarget, string>([
    [textarea, 'Braille document'],
    [printView, 'Print interlining'],
  ]);
  for (const [field, name] of fieldNames) {
    field.addEventListener('focus', (e) => {
      if ((e as FocusEvent).relatedTarget && fieldNames.has((e as FocusEvent).relatedTarget!)) {
        setTimeout(() => say(name), 150);
      }
    });
  }
}

// Arriving in the print view starts at the braille caret's word.
keepCaretOnKeyboardFocus(printView, () => {
  const offset = printOffsetFor(editor.selectionStart);
  return [offset, offset];
});

/**
 * A small card under the word at the caret when it has an error, so a mouse
 * user can show its correct form. It doesn't take focus, so the caret stays
 * in the document; keyboard and screen-reader users have Alt+R instead.
 */
function renderPopover(state: WordState | null, line: number, lineStarts: number[]) {
  const f = state?.feedback;
  popover.hidden = !feedbackShown() || !state || !f || !isIssue(f);
  if (popover.hidden || !state || !f) return;
  const parts: Node[] = [];
  const label = document.createElement('span');
  label.className = `label ${f.status}`;
  label.textContent = f.status === 'unreadable' ? "Can't read this braille" : 'Contraction error';
  parts.push(label);
  if (f.reference) {
    if (revealedAt === state.word.start) {
      const correct = document.createElement('span');
      correct.className = 'correct';
      const dots = document.createElement('span');
      dots.className = 'braille';
      dots.textContent = f.reference;
      const ascii = document.createElement('span');
      ascii.className = 'ascii';
      ascii.textContent = f.reference;
      correct.append('Correct:', dots, ascii);
      parts.push(correct, popoverButton('Hide', hideReference));
    } else {
      parts.push(popoverButton('Show correct form', revealReference));
    }
  }
  popover.replaceChildren(...parts);
  const col = state.word.start - lineStarts[line];
  popover.style.left = `${PAD + col * cell - 8}px`;
  // In the gap below the wavy underline, above the next line's print.
  popover.style.top = `${GLYPH_TOP + line * LINE + FONT_SIZE * 1.04 + 5}px`;
}

function popoverButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.tabIndex = -1;
  button.textContent = label;
  // Keep focus, and the caret, in the document.
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', action);
  return button;
}

// ---- Slate ----------------------------------------------------------------

const slate = byId('slate');
const slateDots = [...slate.querySelectorAll<HTMLButtonElement>('.slate-dot')];
const slateCell = slate.querySelector<HTMLElement>('.slate-cell')!;
const slatePosition = byId('slate-position');
const sideFront = byId('side-front');
const sideBack = byId('side-back');
const sheet = byId('sheet');
const coarsePointer = matchMedia('(pointer: coarse)');

function renderSlate() {
  if (!prefs.showSlate) return;
  const mask = editor.slateMask();
  for (const button of slateDots) {
    const dot = Number(button.dataset.dot);
    button.setAttribute('aria-pressed', String(Boolean(mask & (1 << (dot - 1)))));
  }
  const { line, cell: at } = positionOf(editor.text, editor.slateCell() ?? editor.selectionStart);
  const lineText = document.createElement('span');
  lineText.textContent = `Line ${line}`;
  const cellText = document.createElement('span');
  cellText.textContent = `Cell ${at} of 40`;
  slatePosition.replaceChildren(lineText, cellText);
}

const sheetScroll = sheet.parentElement!;

/**
 * Keeps the cell being written in view, above the slate. Where the page is
 * wider than the screen, the cursor is brought back to the middle when it
 * nears an edge, so the cells just written stay in view too.
 */
function revealSlateCursor() {
  const cursor = overlay.querySelector('.slate-cursor, .caret-spot');
  if (!cursor) return;
  cursor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const box = cursor.getBoundingClientRect();
  const view = sheetScroll.getBoundingClientRect();
  const margin = view.width * 0.2;
  if (box.left < view.left + margin || box.right > view.right - margin) {
    sheetScroll.scrollLeft += (box.left + box.right) / 2 - (view.left + view.right) / 2;
  }
}

function afterSlateAction() {
  render();
  revealSlateCursor();
}

for (const button of slateDots) {
  button.addEventListener('click', () => {
    const bit = 1 << (Number(button.dataset.dot) - 1);
    const mask = editor.slateMask() ^ bit;
    if (prefs.slateClicks) playClick(Boolean(mask & bit));
    editor.slateWrite(mask);
    afterSlateAction();
  });
}

for (const [id, icon] of Object.entries(SLATE_ICONS)) byId(id).innerHTML = icon;

/**
 * Slides the slate's cell in from the way the stylus moved, so moving on
 * feels like moving along the slate. `x` is +1 for rightward on screen, -1
 * for leftward; `y` is 1 for down to a new line.
 */
function slideCell(x: number, y = 0) {
  if (reducedMotion.matches) return;
  slateCell.animate(
    [{ transform: `translate(${x * 18}px, ${y * 18}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }],
    { duration: 180, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
  );
}

// The slate is on the back of the page, where lines run right to left.
const slateActions: [string, () => void][] = [
  ['slate-next', () => (editor.slateNext(), slideCell(-1))],
  ['slate-prev', () => (editor.slateBack(), slideCell(1))],
  ['slate-newline', () => (editor.slateNewLine(), slideCell(0, 1))],
];
for (const [id, action] of slateActions) {
  byId(id).addEventListener('click', () => {
    action();
    afterSlateAction();
  });
}

// Tapping the slate leaves focus, and the caret, in the document.
for (const button of slate.querySelectorAll('button')) {
  button.addEventListener('mousedown', (e) => e.preventDefault());
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let turning = false;

/** Turns the page over, squeezing it edge-on and opening it out again on the other side. */
function flip() {
  if (turning) return;
  if (reducedMotion.matches) return turnOver();
  turning = true;
  sheet.classList.add('turning');
  setTimeout(() => {
    turnOver();
    sheet.classList.remove('turning');
    turning = false;
  }, 170);
}

function turnOver() {
  side = side === 'front' ? 'back' : 'front';
  prefs.side = side;
  savePrefs(prefs);
  if (side === 'back' && document.activeElement === printView) textarea.focus();
  revealedAt = null;
  errorWordStart = errorWordAtCaret();
  showSide();
  render();
  // Once the page has opened out, so the cursor is measured where it ends up.
  if (reducedMotion.matches) revealSlateCursor();
  else setTimeout(revealSlateCursor, 200);
  say(side === 'back' ? 'Back of the page, mirrored as on a slate. No feedback until you turn it over.' : 'Front of the page.');
}

/** Shows the page and the slate on the current side. */
function showSide() {
  const back = side === 'back';
  sheet.classList.toggle('back', back);
  slate.classList.toggle('back', back);
  sideFront.setAttribute('aria-pressed', String(!back));
  sideBack.setAttribute('aria-pressed', String(back));
}

sideFront.addEventListener('click', () => side === 'back' && flip());
sideBack.addEventListener('click', () => side === 'front' && flip());

/** Keeps the space the slate covers clear at the bottom of the page. */
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--slate-height', `${slate.hidden ? 0 : slate.offsetHeight}px`);
}).observe(slate);

function applySlatePrefs() {
  slate.hidden = !prefs.showSlate;
  document.body.classList.toggle('has-slate', prefs.showSlate);
  // With the slate on a touch screen, tapping the page moves the cursor
  // without bringing up the on-screen keyboard. A hardware keyboard still works.
  if (prefs.showSlate && coarsePointer.matches) textarea.setAttribute('inputmode', 'none');
  else textarea.removeAttribute('inputmode');
  if (!prefs.showSlate) document.documentElement.style.setProperty('--slate-height', '0px');
  render();
}

// ---- Files and recovery ---------------------------------------------------

const isDirty = () => editor.text !== (savedText ?? '');

function renderFileStatus() {
  const name = fileName ?? 'New document';
  let detail: string;
  if (isDirty()) detail = savedText === null ? 'not saved to a BRF file' : 'unsaved changes';
  else if (savedBy === 'download') detail = 'saved as a download';
  else if (savedText !== null) detail = 'all changes saved to the BRF file';
  else detail = 'empty';
  fileStatus.textContent = `${name} · ${detail}`;
  document.title = `${name} — Dotwright`;
}

function scheduleRecovery() {
  clearTimeout(recoveryTimer);
  recoveryTimer = window.setTimeout(updateRecovery, 400);
}

function updateRecovery() {
  clearTimeout(recoveryTimer);
  const ok = writeRecovery({ text: editor.text, fileName, savedText });
  if (ok) {
    recoveryWarning.textContent = '';
  } else if (!recoveryWarning.textContent) {
    recoveryWarning.textContent =
      'Warning: the recovery copy in this browser could not be updated. Save a BRF file to keep your work.';
  }
}

/**
 * Asks for a file name where the browser can only download (Safari), since a
 * download is otherwise named without asking. Resolves to null on cancel.
 */
function askFileName(suggested: string): Promise<string | null> {
  fileNameInput.value = suggested;
  fileNameError.textContent = '';
  fileNameInput.removeAttribute('aria-invalid');
  saveDialog.showModal();
  fileNameInput.focus();
  fileNameInput.setSelectionRange(0, suggested.replace(/\.brf$/i, '').length);
  return new Promise((resolve) => {
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      const name = fileNameInput.value.trim();
      const error = !name.replace(/\.brf$/i, '')
        ? 'Enter a file name.'
        : /[\\/:*?"<>|]/.test(name)
          ? 'File names can\'t contain \\ / : * ? " < > or |.'
          : '';
      if (error) {
        fileNameInput.setAttribute('aria-invalid', 'true');
        fileNameError.textContent = error;
        return;
      }
      done(/\.brf$/i.test(name) ? name : `${name}.brf`);
    };
    const onClose = () => done(null);
    const done = (name: string | null) => {
      saveForm.removeEventListener('submit', onSubmit);
      saveDialog.removeEventListener('close', onClose);
      if (saveDialog.open) saveDialog.close();
      resolve(name);
    };
    saveForm.addEventListener('submit', onSubmit);
    saveDialog.addEventListener('close', onClose);
  });
}

async function save(saveAs: boolean) {
  try {
    let name = fileName ?? 'untitled.brf';
    if (!window.showSaveFilePicker) {
      const chosen = await askFileName(name);
      if (!chosen) return say('Save cancelled.');
      name = chosen;
    }
    const result = await saveBrf(formatBrf(editor.text), name, fileHandle, saveAs);
    if (!result) return say('Save cancelled.');
    fileName = result.name;
    fileHandle = result.handle;
    savedText = editor.text;
    savedBy = result.method;
    updateRecovery();
    renderFileStatus();
    say(result.method === 'file' ? `Saved ${fileName}.` : `Downloaded ${fileName}. It is in your downloads folder.`);
  } catch (err) {
    say(`Could not save the BRF file. ${err instanceof Error ? err.message : ''}`);
  } finally {
    textarea.focus();
  }
}

async function open() {
  if (isDirty() && !confirm('Open another file? Changes not saved to a BRF file will be lost.')) return;
  try {
    const file = await openBrf();
    if (!file) return say('Open cancelled.');
    const { text, skipped } = parseBrf(file.data);
    editor.load(text);
    fileName = file.name;
    fileHandle = file.handle;
    savedText = text;
    savedBy = null;
    updateRecovery();
    render();
    const pages = Math.ceil(editor.text.split('\n').length / LINES_PER_PAGE);
    const skippedNote = skipped
      ? ` ${skipped} character${skipped === 1 ? ' was' : 's were'} not Braille ASCII and ${skipped === 1 ? 'was' : 'were'} left out.`
      : '';
    say(`Opened ${fileName}, ${pages} page${pages === 1 ? '' : 's'}.${skippedNote}`);
  } catch (err) {
    say(`Could not open the file. ${err instanceof Error ? err.message : ''}`);
  } finally {
    textarea.focus();
  }
}

function discard() {
  if (
    (editor.text || fileName) &&
    !confirm(
      'Discard this document? Changes not saved to a BRF file will be lost, and the recovery copy in this browser will be deleted.',
    )
  ) {
    return;
  }
  editor.load('');
  fileName = null;
  fileHandle = null;
  savedText = null;
  savedBy = null;
  revealedAt = null;
  clearTimeout(recoveryTimer);
  clearRecovery();
  render();
  textarea.focus();
  say('New, empty document.');
}

// ---- Commands -------------------------------------------------------------

function openHelp() {
  currentKeys.textContent = describeDotKeys(editor.dotKeys);
  help.showModal();
}

// ---- Settings -------------------------------------------------------------

function setEchoCells(on: boolean) {
  echoCells = on;
  prefs.echoCells = on;
  echoCellsInput.checked = on;
  savePrefs(prefs);
}

function setShadowDots(on: boolean) {
  prefs.shadowDots = on;
  showEmptyDots.checked = on;
  savePrefs(prefs);
  render();
}

const slateSettings: [HTMLInputElement, 'showSlate' | 'slateClicks'][] = [
  [showSlateInput, 'showSlate'],
  [slateClicksInput, 'slateClicks'],
];
for (const [input, key] of slateSettings) {
  input.addEventListener('change', () => {
    prefs[key] = input.checked;
    savePrefs(prefs);
    applySlatePrefs();
  });
}

function openSettings() {
  for (const [input, key] of slateSettings) input.checked = prefs[key];
  showEmptyDots.checked = prefs.shadowDots;
  echoCellsInput.checked = echoCells;
  settingsKeys.textContent = describeDotKeys(editor.dotKeys);
  settingsDialog.showModal();
}

showEmptyDots.addEventListener('change', () => setShadowDots(showEmptyDots.checked));
echoCellsInput.addEventListener('change', () => setEchoCells(echoCellsInput.checked));
byId('show-settings').addEventListener('click', openSettings);
byId('settings-change-keys').addEventListener('click', () => {
  settingsDialog.close();
  openKeysDialog();
});
settingsDialog.addEventListener('close', () => {
  if (!keysDialog.open) textarea.focus();
});

function openKeysDialog() {
  if (help.open) help.close();
  dotKeysInput.value = editor.dotKeys;
  dotKeysError.textContent = '';
  dotKeysInput.removeAttribute('aria-invalid');
  keysDialog.showModal();
  dotKeysInput.select();
}

function setDotKeys(keys: string) {
  editor.dotKeys = keys;
  saveDotKeys(keys);
  keysDialog.close();
  say(`Braille keys saved. ${describeDotKeys(keys)}`);
}

keysForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const parsed = parseDotKeys(dotKeysInput.value);
  if ('error' in parsed) {
    dotKeysInput.setAttribute('aria-invalid', 'true');
    dotKeysError.textContent = parsed.error;
    dotKeysInput.focus();
    return;
  }
  setDotKeys(parsed.keys);
});
byId('keys-default').addEventListener('click', () => setDotKeys(DEFAULT_DOT_KEYS));
byId('keys-cancel').addEventListener('click', () => keysDialog.close());
byId('save-cancel').addEventListener('click', () => saveDialog.close());
keysDialog.addEventListener('close', () => textarea.focus());

// ---- Go to ----------------------------------------------------------------

/** The field to return to after going to a position: the braille document or the print view. */
let gotoReturn: HTMLTextAreaElement = textarea;

function openGoTo() {
  gotoReturn = document.activeElement === printView ? printView : textarea;
  const caret = editor.selectionStart;
  gotoLine.value = String(lineNumberOf(editor.text, caret));
  gotoCell.value = String(positionOf(editor.text, caret).cell);
  gotoError.textContent = '';
  for (const input of [gotoLine, gotoCell]) input.removeAttribute('aria-invalid');
  gotoDialog.showModal();
  // Typing replaces the pre-filled number. Tabbing between the fields selects
  // their numbers natively; selecting again on focus would make VoiceOver
  // announce the selection instead of the field's label.
  gotoLine.focus();
  gotoLine.select();
}

gotoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const line = Number(gotoLine.value.trim());
  const cell = Number(gotoCell.value.trim());
  const found = offsetOf(editor.text, line, cell);
  if ('error' in found) return showGoToError(found.error, found.error.includes('cell') ? gotoCell : gotoLine);
  gotoDialog.close();
  if (gotoReturn === printView) {
    editor.placeCaret(found.offset);
    const offset = printOffsetFor(found.offset);
    printView.setSelectionRange(offset, offset);
    lastPrintCaret = offset;
  } else {
    editor.moveTo(found.offset);
  }
  const pastEnd = found.cell < cell ? ' (end of line)' : '';
  const position = positionOf(editor.text, found.offset);
  // After the screen reader has spoken the field it returned to.
  setTimeout(() => say(`Line ${line}, cell ${found.cell}${pastEnd}. Page ${position.page}, line ${position.line}.`), 200);
});

function showGoToError(message: string, field: HTMLInputElement) {
  field.setAttribute('aria-invalid', 'true');
  gotoError.textContent = message;
  field.focus();
  field.select();
}
byId('goto-cancel').addEventListener('click', () => gotoDialog.close());
gotoDialog.addEventListener('close', () => gotoReturn.focus());

window.addEventListener('keydown', (e) => {
  if (help.open || keysDialog.open || saveDialog.open || gotoDialog.open || settingsDialog.open) return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey && !mod) {
    const commands: Record<string, () => void> = {
      KeyW: speakWordFeedback,
      KeyR: revealReference,
      KeyN: () => moveToIssue(e.shiftKey ? -1 : 1),
      KeyT: toggleFeedback,
      KeyF: flip,
      KeyL: () => {
        const { page, line, cell } = positionOf(editor.text, editor.selectionStart);
        say(`Page ${page}, line ${line}, cell ${cell}.`);
      },
      KeyG: openGoTo,
      KeyK: () => {
        setEchoCells(!echoCells);
        say(echoCells ? 'Announcing entered cells.' : 'Not announcing entered cells.');
      },
      KeyH: openHelp,
      KeyB: openKeysDialog,
    };
    const command = commands[e.code];
    if (command) {
      e.preventDefault();
      command();
    }
  } else if (mod && !e.altKey && (e.code === 'KeyS' || e.code === 'KeyO')) {
    e.preventDefault();
    if (e.code === 'KeyS') save(e.shiftKey);
    else open();
  } else if (e.key === 'Escape' && revealedAt !== null) {
    e.preventDefault();
    hideReference();
  }
});

byId('new-doc').addEventListener('click', discard);
byId('open-doc').addEventListener('click', open);
byId('save-doc').addEventListener('click', () => save(false));
saveAsButton.addEventListener('click', () => save(true));
saveAsButton.hidden = !window.showSaveFilePicker;
feedbackButton.addEventListener('click', toggleFeedback);
byId('show-help').addEventListener('click', (e) => {
  e.preventDefault();
  openHelp();
});
byId('change-keys').addEventListener('click', openKeysDialog);
help.addEventListener('close', () => textarea.focus());
textarea.addEventListener('scroll', () => {
  overlay.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
});
window.addEventListener('pagehide', updateRecovery);
narrowScreen.addEventListener('change', () => {
  setGeometry();
  measureCell();
  render();
});

// ---- Start ----------------------------------------------------------------

async function start() {
  fileStatus.textContent = 'Loading the braille translator…';
  await Promise.all([
    document.fonts.load(`${FONT_SIZE}px 'Dotwright Braille'`),
    document.fonts.load(`${FONT_SIZE}px 'Dotwright Braille Shadows'`),
    initLouis(),
  ]);
  measureCell();
  showSide();
  applySlatePrefs();
  editor.dotKeys = loadDotKeys();

  const copy = loadRecovery();
  editor.load(copy?.text ?? '');
  if (copy) {
    fileName = copy.fileName;
    savedText = copy.savedText;
  }
  textarea.disabled = false;
  // Continue where the learner left off.
  editor.moveTo(editor.text.length);
  render();
  if (copy?.text) {
    say(
      `Restored your document from this browser's recovery copy.${isDirty() ? ' It has changes not saved to a BRF file.' : ''}` +
        ' The recovery copy is kept only in this browser and is lost if browser data is cleared, so save a BRF file to keep your work.',
    );
  }
}

// Offline support for the built app (see vite.config.ts).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // The app still works online without it.
  });
}

start().catch((err) => {
  fileStatus.textContent = `Dotwright could not start: ${err instanceof Error ? err.message : err}`;
});
