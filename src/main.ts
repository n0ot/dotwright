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
import { clearRecovery, loadRecovery, writeRecovery } from './recovery';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const textarea = byId<HTMLTextAreaElement>('editor');
const overlay = byId('overlay');
const wordPanel = byId('word-panel');
const wordDetails = byId('word-details');
const fileStatus = byId('file-status');
const recoveryStatus = byId('recovery-status');
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

// Must match #editor in style.css.
const FONT_SIZE = 30;
const LINE = 84;
const PAD = 24;
const GLYPH_TOP = (LINE - FONT_SIZE * 1.04) / 2;

let cell = FONT_SIZE * 0.6;
let feedbackOn = true;
let echoCells = true;
let fileName: string | null = null;
let fileHandle: FileHandle | null = null;
let savedText: string | null = null;
let savedBy: 'file' | 'download' | null = null;
let revealedAt: number | null = null;
let recoveryTimer = 0;

const announcer = new Announcer(byId('announcements'));
const say = (message: string) => announcer.say(message);

const editor = new BrailleEditor(textarea, {
  change(kind) {
    if (kind === 'space' || kind === 'newline') announceCompletedWord(kind);
    else if (kind === 'undo' || kind === 'redo') say(kind === 'undo' ? 'Undo' : 'Redo');
    dropRevealIfMoved();
    scheduleRecovery();
    render();
  },
  select() {
    dropRevealIfMoved();
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
  const reference = f.passage === 'grade 1' ? 'uncontracted reference, in a grade 1 passage' : 'fully contracted reference';
  switch (f.status) {
    case 'matches':
      return `Matches the ${reference}.`;
    case 'differs':
      return `Possible contraction issue: differs from the ${reference}.`;
    case 'unreadable':
      return f.passage === 'grade 1'
        ? 'Some cells could not be interpreted in a grade 1 passage, so there is no reference form.'
        : 'Some cells could not be interpreted, so there is no reference form.';
    case 'no-reference':
      return 'No reference form is available for this word.';
  }
}

function announceCompletedWord(kind: 'space' | 'newline') {
  const caret = editor.selectionStart;
  const word = editor.words().find((w) => w.end === caret - 1);
  const parts: string[] = [];
  if (echoCells) parts.push(kind === 'space' ? 'space' : 'new line');
  if (feedbackOn && word) {
    const f = checkDocument(editor.text).get(word.start)!;
    if (f.status === 'differs') parts.push('possible contraction issue');
    else if (f.status === 'unreadable') parts.push('could not interpret');
  }
  if (parts.length) say(parts.join(', '));
}

function dropRevealIfMoved() {
  if (revealedAt === null) return;
  if (stateAtCaret()?.word.start !== revealedAt) revealedAt = null;
}

function speakWordFeedback() {
  if (!feedbackOn) return say('Feedback is off. Alt+T turns it on.');
  const state = stateAtCaret();
  if (!state) return say('No word at the cursor.');
  const f = state.feedback;
  if (!f) return say(`Unfinished word: ${spell(state.word.text)}. Feedback appears after Space or Enter.`);
  say(`${f.print}. ${statusText(f)}${f.status === 'differs' ? ' Alt+R reveals the reference.' : ''}`);
}

function revealReference() {
  if (!feedbackOn) return say('Feedback is off. Alt+T turns it on.');
  const state = stateAtCaret();
  if (!state) return say('No word at the cursor.');
  const f = state.feedback;
  if (!f) return say('Finish the word with Space or Enter first.');
  if (!f.reference) return say(statusText(f));
  revealedAt = state.word.start;
  render();
  say(
    f.reference === f.braille
      ? `Reference: ${spell(f.reference)}. Same as your entry.`
      : `Reference: ${spell(f.reference)}. Your entry: ${spell(f.braille)}.`,
  );
}

function hideReference() {
  if (revealedAt === null) return;
  revealedAt = null;
  render();
  say('Reference hidden.');
}

function moveToIssue(direction: 1 | -1) {
  if (!feedbackOn) return say('Feedback is off. Alt+T turns it on.');
  const issues = wordStates().filter((s) => isIssue(s.feedback));
  if (!issues.length) return say('No words with issues.');
  const caret = editor.selectionStart;
  const target =
    direction === 1
      ? (issues.find((s) => s.word.start > caret) ?? issues[0])
      : (issues.findLast((s) => s.word.end < caret) ?? issues.at(-1)!);
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
  feedbackButton.setAttribute('aria-pressed', String(feedbackOn));
  if (!feedbackOn && document.activeElement === printView) textarea.focus();
  revealedAt = null;
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
  textarea.style.height = `${lineStarts.length * LINE}px`;
  overlay.replaceChildren();

  const lineOf = (offset: number) => {
    let i = lineStarts.length - 1;
    while (lineStarts[i] > offset) i--;
    return i;
  };

  for (let i = 0; i < lineStarts.length; i += LINES_PER_PAGE) {
    if (i > 0) place('page-break', 0, i * LINE);
    place('page-label', 0, i * LINE + 2, undefined, `Page ${i / LINES_PER_PAGE + 1}`).style.left = 'auto';
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

  if (feedbackOn) {
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

  renderWordPanel(states.find((s) => s.word === caretWord) ?? null);
  renderPrintView(states, lineOf, lineStarts.length);
  renderFileStatus();
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
  printView.hidden = !feedbackOn;
  if (!feedbackOn) return;
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

function renderWordPanel(state: WordState | null) {
  wordPanel.hidden = !feedbackOn;
  if (!feedbackOn) return;
  const rows: [string, string | Node][] = [];
  const brailleNode = (b: string) => {
    const span = document.createElement('span');
    const dots = document.createElement('span');
    dots.className = 'braille';
    dots.setAttribute('aria-hidden', 'true');
    dots.textContent = b;
    span.append(dots, b);
    return span;
  };
  if (!state) {
    rows.push(['Word', 'None at the cursor']);
  } else {
    rows.push(['Your braille', brailleNode(state.word.text)]);
    const f = state.feedback;
    if (!f) {
      rows.push(['Status', 'Unfinished']);
    } else {
      rows.push(['Print', f.print], ['Status', statusText(f)]);
      if (f.reference) {
        rows.push(
          revealedAt === state.word.start
            ? ['Reference', brailleNode(f.reference)]
            : ['Reference', 'Hidden'],
        );
      }
    }
  }
  wordDetails.replaceChildren(
    ...rows.flatMap(([term, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.append(value);
      return [dt, dd];
    }),
  );
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
  fileStatus.textContent = `${name} — ${detail}`;
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
    recoveryStatus.textContent = `Recovery copy updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  } else if (!recoveryWarning.textContent) {
    recoveryStatus.textContent = '';
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
  recoveryStatus.textContent = '';
  render();
  textarea.focus();
  say('New, empty document.');
}

// ---- Commands -------------------------------------------------------------

function openHelp() {
  currentKeys.textContent = describeDotKeys(editor.dotKeys);
  help.showModal();
}

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
  if (help.open || keysDialog.open || saveDialog.open || gotoDialog.open) return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey && !mod) {
    const commands: Record<string, () => void> = {
      KeyW: speakWordFeedback,
      KeyR: revealReference,
      KeyN: () => moveToIssue(e.shiftKey ? -1 : 1),
      KeyT: toggleFeedback,
      KeyL: () => {
        const { page, line, cell } = positionOf(editor.text, editor.selectionStart);
        say(`Page ${page}, line ${line}, cell ${cell}.`);
      },
      KeyG: openGoTo,
      KeyK: () => {
        echoCells = !echoCells;
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

// ---- Start ----------------------------------------------------------------

async function start() {
  fileStatus.textContent = 'Loading the braille translator…';
  await Promise.all([document.fonts.load(`${FONT_SIZE}px 'Dotwright Braille'`), initLouis()]);
  measureCell();
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
