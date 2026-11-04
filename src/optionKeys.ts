/**
 * On a Mac, Option with a letter types a symbol, and on some layouts starts an
 * accent (a dead key, as Option+W is in ABC Extended). Safari begins an accent
 * before the page can cancel it, and a screen reader hears it typed. So while
 * Option is held on its own, the field is read-only: the Alt shortcuts still
 * work, but nothing is typed. Keys that aren't characters, like Option+arrow,
 * make it editable again first, since Chrome won't move the caret in a
 * read-only field. Control+Option, the VoiceOver keys, is left alone.
 */
export function holdOffOptionTyping(el: HTMLTextAreaElement): void {
  const release = () => {
    if (el.readOnly) el.readOnly = false;
  };
  el.addEventListener('keydown', (e) => {
    const optionAlone = e.altKey && !e.ctrlKey && !e.metaKey;
    if (!optionAlone) release();
    else if (e.key === 'Alt') el.readOnly = true;
    else if (e.key.length > 1 && e.key !== 'Dead') release();
  });
  el.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') release();
  });
  el.addEventListener('blur', release);
}
