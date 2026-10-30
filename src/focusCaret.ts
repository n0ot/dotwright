/**
 * WebKit moves a text field's caret to the start when it is tabbed into, after
 * the focus event. This puts the caret where `caret` says instead, on keyboard
 * focus only, so a click still places the caret where the learner clicked.
 */
export function keepCaretOnKeyboardFocus(el: HTMLTextAreaElement, caret: () => [number, number]): void {
  let pointer = false;
  let pending = false;
  el.addEventListener('pointerdown', () => {
    pointer = true;
    pending = false;
  });
  // Any key the learner presses after arriving wins over the restore.
  el.addEventListener('keydown', () => (pending = false), true);
  el.addEventListener('blur', () => {
    pointer = false;
    pending = false;
  });
  el.addEventListener('focus', () => {
    if (pointer) {
      pointer = false;
      return;
    }
    const [start, end] = caret();
    pending = true;
    // Only undo a reset to the start, not a caret placed on purpose since focusing.
    const restore = () => {
      if (pending && document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === 0) {
        el.setSelectionRange(start, end);
      }
    };
    restore();
    setTimeout(restore, 0);
    requestAnimationFrame(() => {
      restore();
      pending = false;
    });
  });
}
