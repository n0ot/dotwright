// Drives the app in Chromium and WebKit the way a six-key typist would.
// Usage: npx vite --port 5173 & node e2e/smoke.mjs
import { chromium, webkit } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5173/';
const DOTS = { 1: 'f', 2: 'd', 3: 's', 4: 'j', 5: 'k', 6: 'l' };
// Braille ASCII to dot numbers, for the cells this test types.
const CELLS = { a: '1', n: '1345', d: '145', '&': '12346', '!': '2346', c: '14', t: '2345', '4': '256', ',': '6', i: '24', m: '134', y: '13456', s: '234', o: '135', b: '12', h: '125', e: '15' };

async function chord(page, ch) {
  if (ch === ' ') return page.keyboard.press('Space');
  const keys = [...CELLS[ch]].map((d) => DOTS[d]);
  for (const k of keys) await page.keyboard.down(k);
  for (const k of keys) await page.keyboard.up(k);
}
const type = async (page, s) => { for (const ch of s) await chord(page, ch); };
// Line start and end keys for the platform the tests run on.
const LINE_START = process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home';
const LINE_END = process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End';
const lastSaid = (page) => page.evaluate(() => [...document.querySelectorAll('#announcements div')].map((d) => d.textContent).filter(Boolean).at(-1) ?? '');
const announced = (page) => page.evaluate(() => [...document.querySelectorAll('#announcements div')].map((d) => d.textContent).join(' | '));
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`); };

for (const browserType of [chromium, webkit]) {
  console.log(browserType.name());
  const browser = await browserType.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => !document.querySelector('#editor').disabled);
  const ta = page.locator('#editor');

  check('empty dot positions shown by default', (await page.locator('.dot-shadows').count()) === 1);
  await type(page, 'and');
  check('chords enter Braille ASCII', (await ta.inputValue()) === 'and', await ta.inputValue());
  check('unfinished word is not flagged', (await page.locator('.mark').count()) === 0);
  await page.waitForTimeout(80);
  check('cell echo announced', (await announced(page)).includes('d'));
  await type(page, ' ');
  await page.waitForTimeout(80);
  check('completed uncontracted word is flagged', (await page.locator('.mark.differs').count()) === 1);
  check('space reads the finished word, and its issue', (await lastSaid(page)) === 'and, contraction error', await lastSaid(page));
  check('print interlining shows learner reading', (await page.locator('.print').first().textContent()) === 'and');

  await type(page, '& ! cat4 ');
  check('contracted words not flagged', (await page.locator('.mark').count()) === 1, String(await page.locator('.mark').count()));

  await page.keyboard.press(LINE_START);
  await page.keyboard.press('Alt+KeyW');
  await page.waitForTimeout(80);
  check('Alt+W speaks word feedback', (await announced(page)).includes('Contraction error.'), await announced(page));
  await page.keyboard.press('Alt+KeyR');
  await page.waitForTimeout(80);
  check('Alt+R reveals reference', (await announced(page)).includes('Correct form: ampersand'), await announced(page));
  check('reveal leaves braille unchanged', (await ta.inputValue()).startsWith('and & '));
  check('correct form shown by the word', (await page.locator('#word-popover').textContent()).includes('&'));
  await page.keyboard.press('Escape');

  // The same with the mouse: click the flagged word, then Show correct form.
  const box = await ta.boundingBox();
  await page.mouse.click(box.x + 40, box.y + 42);
  const popover = page.locator('#word-popover');
  const showButton = popover.locator('button', { hasText: 'Show correct form' });
  check('clicked word shows Contraction error and a Show correct form button',
    (await popover.textContent()).includes('Contraction error') && await showButton.isVisible());
  await showButton.click();
  check('Show correct form reveals it', (await popover.textContent()).includes('&') && await popover.locator('button', { hasText: 'Hide' }).isVisible());
  check('the correct form is given in dot numbers, not Braille ASCII', (await popover.locator('.dot-numbers').textContent()) === '12346',
    await popover.locator('.correct').textContent());
  check('Show reference leaves braille unchanged and returns to the document',
    (await ta.inputValue()).startsWith('and & ') && await page.evaluate(() => document.activeElement.id === 'editor'));
  await popover.locator('button', { hasText: 'Hide' }).click();
  check('Hide hides it', await showButton.isVisible());

  // Arrowing onto and off a word with an error.
  await page.keyboard.press(LINE_START);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(80);
  check('leaving an error word says so', (await announced(page)).includes('out of contraction error'), await announced(page));
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(80);
  check('arriving on an error word says so', (await lastSaid(page)) === 'contraction error', await announced(page));
  await page.keyboard.press(LINE_START);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  check('typing letters does nothing', await (async () => { await page.keyboard.press('q'); return !(await ta.inputValue()).includes('q'); })());
  {
    // As Option+W does on a Mac, past the keys: the text area never takes it.
    const before = await ta.inputValue();
    const inputs = await page.evaluate(() => { window.inputs = 0; document.getElementById('editor').addEventListener('input', () => window.inputs++); });
    await page.keyboard.insertText('∑');
    check('typed symbols never reach the text area', (await ta.inputValue()) === before && (await page.evaluate(() => window.inputs)) === 0, await ta.inputValue());
    await page.keyboard.down('Alt');
    check('holding Option alone makes the field read-only, so it types nothing', await ta.evaluate((el) => el.readOnly));
    const at = await ta.evaluate((el) => el.selectionStart);
    await page.keyboard.press('ArrowRight');
    check('but Option+arrow still moves', !(await ta.evaluate((el) => el.readOnly)) && (await ta.evaluate((el) => el.selectionStart)) !== at);
    await page.keyboard.up('Alt');
  }
  await page.keyboard.press('Alt+KeyT');
  check('feedback off hides print, marks and the popover', (await page.locator('.print, .mark').count()) === 0 && await page.locator('#word-popover').isHidden());
  await page.keyboard.press('Alt+KeyT');

  // A full line takes nothing more, as on a braillewriter, until a new line is started.
  await page.keyboard.press(LINE_END);
  const lineCount = (await ta.inputValue()).split('\n').length;
  for (let i = 0; i < 7; i++) await type(page, '!c!c!c ');
  let lines = (await ta.inputValue()).split('\n');
  await page.waitForTimeout(80);
  check('a full line stops at 40 cells', lines.length === lineCount && lines.at(-1).length === 40, JSON.stringify(lines));
  check('writing past the end says so', (await lastSaid(page)) === 'End of line', await lastSaid(page));
  await page.keyboard.press('Enter');
  await type(page, '!c');
  lines = (await ta.inputValue()).split('\n');
  check('Enter starts a new line to carry on', lines.length === lineCount + 1 && lines.at(-1) === '!c', JSON.stringify(lines));

  await page.keyboard.press('Meta+KeyZ');
  await page.keyboard.press('Control+KeyZ');
  await page.waitForTimeout(80);
  check('undo works', (await announced(page)).includes('Undo') || (await announced(page)).includes('Nothing'));

  // Recovery survives a reload.
  const before = await ta.inputValue();
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#editor').disabled);
  check('recovery restores after refresh', (await ta.inputValue()) === before);
  check('restored work is still unsaved', (await page.locator('#file-status').textContent()).includes('not saved'));

  // Save falls back to a download where the File System Access API is missing.
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  await page.click('#save-doc');
  await page.fill('#file-name', 'lesson one');
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  check('download uses the chosen name', download.suggestedFilename() === 'lesson one.brf', download.suggestedFilename());
  const brf = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
  check('saved BRF keeps uncorrected braille', brf.startsWith('AND & ! CAT4'), JSON.stringify(brf.slice(0, 40)));
  check('saved BRF lines are <= 40 cells', brf.split('\r\n').every((l) => l.length <= 40));

  page.on('dialog', (d) => d.accept());
  await page.click('#new-doc');
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#editor').disabled);
  check('discarded work is not restored', (await ta.inputValue()) === '');

  // Print view: Tab from the document, read-only, line for line, caret follows by word.
  await page.click('#new-doc');
  await type(page, 'and & ! cat4');
  await page.keyboard.press('Enter');
  await type(page, '!');
  await page.keyboard.press('Tab');
  const pv = page.locator('#print-view');
  check('Tab reaches the print view', await page.evaluate(() => document.activeElement.id === 'print-view'));
  check('the page shows the print view has focus', await page.evaluate(() => getComputedStyle(document.querySelector('#sheet')).borderTopStyle === 'dashed'));
  check('the popover is hidden in the print view', await page.locator('#word-popover').isHidden());
  if (browserType === webkit) {
    await page.waitForTimeout(250);
    check('Safari names the print view on Tab', (await announced(page)).includes('Print interlining'), await announced(page));
  }
  check('print view mirrors lines', (await pv.inputValue()) === 'and and the cat.\nthe', JSON.stringify(await pv.inputValue()));
  check('print view caret starts at braille caret word', await page.evaluate(() => document.querySelector('#print-view').selectionStart) === 20);
  await page.keyboard.press('q');
  check('print view refuses typing', (await pv.inputValue()) === 'and and the cat.\nthe');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press(LINE_START);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  const caret = () => page.evaluate(() => document.querySelector('#editor').selectionStart);
  check('braille caret follows print caret', (await caret()) === 4, String(await caret()));
  check('focus stays in print view', await page.evaluate(() => document.activeElement.id === 'print-view'));
  await page.keyboard.press('Alt+KeyW');
  await page.waitForTimeout(80);
  check('Alt+W works from the print view', (await announced(page)).includes('and. No contraction error'), await announced(page));
  await page.keyboard.press('Shift+Tab');
  check('back in the document at the same word', (await caret()) === 4 && await page.evaluate(() => document.activeElement.id === 'editor'));
  await page.keyboard.press('Alt+KeyT');
  check('print view hidden when feedback is off', await page.evaluate(() => document.querySelector('#print-view').hidden));
  await page.keyboard.press('Alt+KeyT');

  await page.keyboard.press('Alt+KeyH');
  check('Instructions open on their heading', await page.evaluate(() => document.activeElement.id === 'help-title'));
  await page.keyboard.press('Escape');

  // Go to: line and cell fields pre-filled with the current position.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Alt+KeyG');
  check('Alt+G pre-fills the current line and cell',
    (await page.inputValue('#goto-line')) === '1' && (await page.inputValue('#goto-cell')) === '5', `${await page.inputValue('#goto-line')} ${await page.inputValue('#goto-cell')}`);
  await page.keyboard.press('Tab');
  await page.keyboard.type('9');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('Alt+G moves the braille cursor', (await caret()) === 8 && await page.evaluate(() => document.activeElement.id === 'editor'), String(await caret()));
  check('Alt+G announces the position', (await announced(page)).includes('Line 1, cell 9'), await announced(page));
  await page.keyboard.press('Alt+KeyG');
  await page.keyboard.type('9');
  await page.keyboard.press('Enter');
  check('Alt+G explains an invalid line', (await page.locator('#goto-error').textContent()) === 'Enter a line from 1 to 2.');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Alt+KeyG');
  await page.keyboard.type('2');
  await page.keyboard.press('Tab');
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  check('Alt+G from the print view stays there', (await caret()) === 13 && await page.evaluate(() => document.activeElement.id === 'print-view'), String(await caret()));
  await page.keyboard.press('Shift+Tab');

  // Custom braille keys typed in order into a field in Settings, punctuation included.
  const openSettings = async () => { await page.evaluate(() => document.querySelector('#show-settings').click()); await page.waitForSelector('#settings-dialog[open]'); };
  await openSettings();
  check('Settings shows the braille keys', (await page.inputValue('#dot-keys')) === 'f d s j k l', await page.inputValue('#dot-keys'));
  await page.fill('#dot-keys', 'qwe');
  await page.press('#dot-keys', 'Enter');
  check('rejects fewer than 6 keys, and stays open', (await page.locator('#dot-keys-error').textContent()).includes('6 keys') && await page.locator('#settings-dialog[open]').count() === 1);
  await page.fill('#dot-keys', 'd c x h , .');
  await page.press('#dot-keys', 'Enter');
  await page.waitForTimeout(80);
  check('Enter saves dot keys and closes Settings', (await announced(page)).includes('Braille keys saved') && await page.locator('#settings-dialog[open]').count() === 0, await announced(page));
  await page.click('#new-doc');
  // Dots 1 and 5 (d and ,) make "e".
  await page.keyboard.down('d'); await page.keyboard.down(','); await page.keyboard.up('d'); await page.keyboard.up(',');
  await page.keyboard.press('Space');
  check('custom keys enter braille', (await ta.inputValue()) === 'e ', await ta.inputValue());
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#editor').disabled);
  await page.keyboard.press('d');
  check('custom keys persist', (await ta.inputValue()) === 'e a', await ta.inputValue());
  await openSettings();
  await page.fill('#dot-keys', 'x');
  await page.keyboard.press('Escape');
  await openSettings();
  check('Escape leaves the keys as they were', (await page.inputValue('#dot-keys')) === 'd c x h , .', await page.inputValue('#dot-keys'));
  check('settings are grouped', (await page.locator('#settings-dialog legend').allTextContents()).join('|') === 'Feedback|Page|Slate|Speech and sound|Braille keys');
  check('dot numbers are off by default', !(await page.isChecked('#slate-numbers')));
  await page.uncheck('#sounds');
  check('the bell is one of the sounds', await page.isDisabled('#margin-bell'));
  await page.check('#slate-numbers');
  await page.click('#settings-reset');
  await page.waitForTimeout(80);
  check('Reset to defaults restores the keys and settings',
    (await page.inputValue('#dot-keys')) === 'f d s j k l' && await page.isChecked('#sounds') && !(await page.isChecked('#slate-numbers'))
      && await page.isEnabled('#margin-bell') && (await announced(page)).includes('reset'), await announced(page));
  await page.click('#settings-done button.primary');
  check('no instructions on the page', !(await page.locator('body > :not(dialog)').allInnerTexts()).join(' ').match(/press|substitute|F D S/i));

  // Slate: tap dots to write the cell at the cursor; keyboard focus stays in the document.
  await page.click('#new-doc');
  const punch = async (...dots) => { for (const d of dots) await page.click(`.slate-dot[data-dot="${d}"]`); };
  const pressed = () => page.evaluate(() => [...document.querySelectorAll('.slate-dot[aria-pressed="true"]')].map((b) => b.dataset.dot).join(''));
  check('Brailler mode shows only the mode switch',
    await page.locator('#mode-slate').isVisible() && await page.locator('.slate-cell').isHidden() && await page.locator('#slate-next').isHidden());
  check('in Brailler mode the switch is not in a Slate region', (await page.getAttribute('#slate', 'aria-label')) === null);
  check('no slate cursor in Brailler mode', (await page.locator('.slate-cursor').count()) === 0);
  check('the mode switch is a radio group with one tab stop',
    (await page.getAttribute('.side-switch', 'role')) === 'radiogroup' &&
    (await page.getAttribute('#mode-brailler', 'aria-checked')) === 'true' &&
    (await page.getAttribute('#mode-slate', 'tabindex')) === '-1');
  await page.focus('#mode-brailler');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('arrow keys switch to Slate mode, and move focus with it',
    (await page.getAttribute('#mode-slate', 'aria-checked')) === 'true' && await page.evaluate(() => document.activeElement.id === 'mode-slate'));
  await page.focus('#editor');
  check('in Slate mode the slate is a region', (await page.getAttribute('#slate', 'aria-label')) === 'Slate');
  check('Slate mode shows the slate', await page.locator('.slate-cell').isVisible() && (await page.locator('.slate-cursor').count()) === 1);
  const dotColumn = () => page.evaluate(() => getComputedStyle(document.querySelector('.slate-dot[data-dot="1"]')).gridColumnStart);
  check('slate is mirrored', (await dotColumn()) === '2', await dotColumn());
  const dotNumber = () => page.evaluate(() => getComputedStyle(document.querySelector('.slate-dot[data-dot="1"]'), '::after').content);
  check('no dot numbers on the slate by default', ['none', 'normal', ''].includes(await dotNumber()), await dotNumber());
  await openSettings();
  await page.check('#slate-numbers');
  await page.click('#settings-done button.primary');
  check('dot numbers can be shown on the slate', (await dotNumber()) === '"1"', await dotNumber());
  await openSettings();
  await page.uncheck('#slate-numbers');
  await page.click('#settings-done button.primary');
  check('screen readers hear that the dots are mirrored', (await page.getAttribute('.slate-cell', 'aria-label')) === 'Dots, mirrored');
  check('Slate mode shows the page mirrored and without print', await page.locator('#sheet.back').count() === 1);
  await punch(1, 4);
  check('dots are set on the slate, not yet written', (await ta.inputValue()) === '' && (await pressed()) === '14', `${await ta.inputValue()} ${await pressed()}`);
  check('preview shows where the cell will go', (await page.locator('.slate-preview').textContent()) === 'c');
  check('slate keeps focus in the document', await page.evaluate(() => document.activeElement.id === 'editor'));
  await punch(4);
  check('tapping a set dot takes it out', (await pressed()) === '1', await pressed());
  await page.click('#slate-next');
  check('Next cell writes the cell and clears the slate', (await ta.inputValue()) === 'a' && (await pressed()) === '', `${await ta.inputValue()} ${await pressed()}`);
  await punch(1, 2);
  await page.click('#slate-next');
  await page.click('#slate-next');
  check('Next cell with no dots writes a space', (await ta.inputValue()) === 'ab ', JSON.stringify(await ta.inputValue()));
  check('no feedback on the back', (await page.locator('.print, .mark').count()) === 0);
  await page.click('#slate-delete');
  check('Delete deletes a space', (await ta.inputValue()) === 'ab', JSON.stringify(await ta.inputValue()));
  await page.waitForTimeout(80);
  check('Delete says what it deleted', (await lastSaid(page)) === 'space', await lastSaid(page));
  check('Delete is named for the platform',
    (await page.locator('#slate-delete').textContent()).trim() === (process.platform === 'darwin' ? 'Delete' : 'Backspace'));
  await punch(3, 6);
  await page.click('#slate-delete');
  check('Delete clears dots not yet written first', (await ta.inputValue()) === 'ab' && (await pressed()) === '', `${await ta.inputValue()} ${await pressed()}`);
  await page.click('#slate-delete');
  check('then deletes the cell before the cursor', (await ta.inputValue()) === 'a', JSON.stringify(await ta.inputValue()));
  await punch(1, 4);
  await page.click('#slate-next');
  await page.click('#slate-next');
  await page.keyboard.down('f'); await page.keyboard.up('f');
  await page.waitForTimeout(80);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyZ' : 'Control+KeyZ');
  check('Enter, Backspace and undo don\'t edit in Slate mode', (await ta.inputValue()) === 'ac ', JSON.stringify(await ta.inputValue()));
  await page.waitForTimeout(80);
  check('braille keys don\'t write in Slate mode', (await ta.inputValue()) === 'ac ' && (await lastSaid(page)).includes('write with the slate'), `${JSON.stringify(await ta.inputValue())} ${await lastSaid(page)}`);
  // On the mirrored page, sideways keys go the way they point: Right is back through the text.
  const caretAt = () => ta.evaluate((el) => el.selectionStart);
  await page.keyboard.press('ArrowRight');
  check('Right moves back on the mirrored page', (await caretAt()) === 2, await caretAt());
  await page.waitForTimeout(80);
  check('and says the cell it moved to', (await lastSaid(page)) === 'space', await lastSaid(page));
  await page.keyboard.press('ArrowLeft');
  check('Left moves on', (await caretAt()) === 3, await caretAt());
  await page.keyboard.press(process.platform === 'darwin' ? 'Alt+ArrowRight' : 'Control+ArrowRight');
  check('Option or Ctrl + Right goes back a word', (await caretAt()) === 0, await caretAt());
  await page.keyboard.press('Shift+ArrowLeft');
  check('Shift selects the way it points', (await ta.evaluate((el) => [el.selectionStart, el.selectionEnd].join())) === '0,1');
  await page.keyboard.press(LINE_START);
  check('the left end of the line is its end', (await caretAt()) === 3, await caretAt());
  await page.keyboard.press(LINE_END);
  check('the right end is its start', (await caretAt()) === 0, await caretAt());
  await page.keyboard.press(LINE_START);
  await punch(1);
  await page.click('#slate-next');
  await punch(2, 3, 4, 6);
  await page.click('#slate-newline');
  check('New line writes the dots set, then starts a line', (await ta.inputValue()) === 'ac a!\n', JSON.stringify(await ta.inputValue()));
  check('slate position shown', (await page.locator('#slate-position').textContent()).startsWith('Line 2'));
  await page.click('#slate-delete');
  check('Delete deletes a line break', (await ta.inputValue()) === 'ac a!', JSON.stringify(await ta.inputValue()));
  await page.click('#slate-newline');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  for (let i = 0; i < 39; i++) { await punch(1); await page.click('#slate-next'); }
  const dotsOff = () => page.evaluate(() => [...document.querySelectorAll('.slate-dot')].every((b) => b.getAttribute('aria-disabled') === 'true'));
  const line2 = async () => (await ta.inputValue()).split('\n')[1];
  await punch(1, 2);
  await page.click('#slate-next');
  check('Next writes the last cell of a line', (await line2()) === 'a'.repeat(39) + 'b', JSON.stringify(await line2()));
  check('slate position says when the line is full', (await page.locator('#slate-position').textContent()).includes('End of line'));
  check('a full line dims the dots and Next', await dotsOff() && (await page.getAttribute('#slate-next', 'aria-disabled')) === 'true');
  await page.click('.slate-dot[data-dot="1"]', { force: true });
  await page.waitForTimeout(80);
  check('dimmed dots set nothing, and say why', (await pressed()) === '' && (await lastSaid(page)) === 'End of line', `${await pressed()} ${await announced(page)}`);
  await page.click('#slate-delete');
  check('Delete makes room, and the dots come back', (await line2()).length === 39 && !(await dotsOff()));
  await punch(1, 2);
  await page.click('#slate-next');
  await page.click('#slate-newline');
  check('New line brings the dots back', (await ta.inputValue()).endsWith('b\n') && !(await dotsOff()), JSON.stringify(await ta.inputValue()));

  check('mode switch shows Slate', (await page.getAttribute('#mode-slate', 'aria-checked')) === 'true');
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#editor').disabled);
  check('mode is remembered', await page.locator('#sheet.back').count() === 1);
  await page.keyboard.press('Alt+KeyW');
  await page.waitForTimeout(80);
  check('word feedback explains Slate mode', (await lastSaid(page)).includes('no feedback in Slate mode'), await lastSaid(page));
  await page.keyboard.press('Alt+KeyM');
  await page.waitForTimeout(300);
  check('Alt+M switches to Brailler mode, with feedback on what was written',
    await page.locator('#sheet.back').count() === 0 && (await page.locator('.print').count()) > 0 && await page.locator('.slate-cell').isHidden());

  check('Brailler mode writes with the keyboard again', await (async () => {
    const before = await ta.inputValue();
    await page.keyboard.press('Enter');
    return (await ta.inputValue()) === before + '\n';
  })());

  // A word written on the slate, with no space after it, is read back too,
  // until writing more of it in Brailler mode makes it unfinished again.
  await page.keyboard.press('Alt+KeyM');
  await page.waitForTimeout(300);
  await punch(1, 3);
  await page.click('#slate-next');
  await page.keyboard.press('Alt+KeyM');
  await page.waitForTimeout(300);
  const prints = () => page.locator('.print').allTextContents();
  check('the word the slate stopped in is interlined in Brailler mode', (await prints()).includes('knowledge'), JSON.stringify(await prints()));
  await chord(page, 'i');
  check('writing more of it takes the interlining away', !(await prints()).includes('knowledge') && (await ta.inputValue()).endsWith('\nki'),
    JSON.stringify(await prints()));
  const feedbackWhen = async (value) => {
    await openSettings();
    await page.check(`input[name="feedback-when"][value="${value}"]`);
    await page.click('#settings-done button.primary');
  };
  await openSettings();
  check('feedback comes when each word is finished by default', await page.isChecked('input[name="feedback-when"][value="word"]'));
  await page.click('#settings-done button.primary');
  await feedbackWhen('cell');
  check('with feedback as each cell is written, the word being written is interlined, unchecked',
    (await page.locator('.print.live').allTextContents()).join() === 'ki' && (await page.locator('.print.live.differs, .print.live.unreadable').count()) === 0,
    JSON.stringify(await prints()));
  await chord(page, 'n');
  await page.waitForTimeout(80);
  const liveReading = (await page.locator('.print.live').allTextContents()).join();
  check('and the interlining follows each cell', liveReading !== 'ki', JSON.stringify(await prints()));
  check('and each cell is announced by the reading so far, not its name', (await lastSaid(page)) === liveReading, await lastSaid(page));
  await page.keyboard.press('Alt+KeyW');
  await page.waitForTimeout(80);
  check('Alt+W reads the word so far', (await lastSaid(page)).startsWith(`${liveReading}, so far.`), await lastSaid(page));

  // Feedback when each line is finished: nothing on the line until then.
  await feedbackWhen('line');
  await page.keyboard.press('Space');
  await chord(page, '!');
  await page.keyboard.press('Space');
  check('with feedback when each line is finished, the line being written isn\'t interlined', !(await prints()).includes('the'), JSON.stringify(await prints()));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Alt+KeyW');
  await page.waitForTimeout(80);
  check('but Alt+W still checks a finished word on it', (await lastSaid(page)).startsWith('the. No contraction error'), await lastSaid(page));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  check('until it\'s finished', (await prints()).includes('the'), JSON.stringify(await prints()));
  await page.waitForTimeout(80);
  check('and Enter reads the line', (await lastSaid(page)).endsWith(" the, contraction error, new line"), await lastSaid(page));

  check('there is no Off among the choices: the Feedback switch is that', (await page.locator('input[name="feedback-when"]').count()) === 3);
  await page.keyboard.press('Alt+KeyT');
  await page.keyboard.press('Alt+KeyT');
  await openSettings();
  check('the switch leaves the choice as it was', await page.isChecked('input[name="feedback-when"][value="line"]'));
  await page.check('input[name="feedback-when"][value="word"]');
  await page.click('#settings-done button.primary');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Slash' : 'Control+Slash');
  check('Command or Ctrl + / opens the instructions', await page.locator('#help[open]').count() === 1);
  check('the top bar is on one line', await page.evaluate(() =>
    [...document.querySelectorAll('.topbar button:not([hidden]), .topbar .help-link, .tagline')].every((e) => getComputedStyle(e).display === 'none' || e.getBoundingClientRect().height < 40)));
  check('keyboard shortcuts are shown with a keyboard', await page.locator('#shortcuts-section[open]').count() === 1);
  const modKey = await page.locator('#help kbd.mod').first().textContent();
  check('instructions name the keys for this system', modKey === (process.platform === 'darwin' ? 'Command' : 'Ctrl'), modKey);
  await page.keyboard.press('Escape');

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
}

// The slate on a phone: tapping the page mustn't bring up the on-screen keyboard.
{
  console.log('webkit, iPhone');
  const browser = await webkit.launch();
  const { devices } = await import('playwright');
  const context = await browser.newContext(devices['iPhone 14']);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => !document.querySelector('#editor').disabled);
  check('no on-screen keyboard for the page', (await page.getAttribute('#editor', 'inputmode')) === 'none');
  await page.tap('#mode-slate');
  await page.waitForTimeout(300);
  for (const d of [2, 3, 4, 6]) await page.tap(`.slate-dot[data-dot="${d}"]`);
  await page.tap('#slate-next');
  await page.tap('#slate-next');
  check('tapping the slate writes braille', (await page.locator('#editor').inputValue()) === '! ');
  const slateTop = (await page.locator('#slate').boundingBox()).y;
  const cursor = await page.locator('.slate-cursor').boundingBox();
  check('cursor is above the slate', cursor.y + cursor.height <= slateTop, `${cursor.y} ${slateTop}`);
  check('empty page has no hint once written', (await page.locator('.empty-hint').count()) === 0);
  await page.tap('#slate-newline');
  check('after a line on the slate, a hint says how to read it back', ((await page.locator('.empty-hint').textContent()) ?? '').includes('Brailler'));
  await page.tap('#mode-brailler');
  await page.waitForTimeout(300);
  check('Brailler mode has no slate panel, just the switch',
    await page.evaluate(() => getComputedStyle(document.querySelector('#slate')).backgroundImage === 'none' && getComputedStyle(document.querySelector('#slate')).borderTopWidth === '0px'));
  const sheetBottom = (await page.locator('#sheet').boundingBox());
  const switchBox = await page.locator('.side-switch').boundingBox();
  check('page runs down behind the switch', sheetBottom.y + sheetBottom.height > switchBox.y + switchBox.height, `${JSON.stringify(sheetBottom)} ${JSON.stringify(switchBox)}`);
  const cleared = await page.waitForFunction(() => [...document.querySelectorAll('#announcements div')].every((d) => d.textContent === ''), null, { timeout: 10000 }).then(() => true, () => false);
  check('spoken announcements are cleared from the page', cleared);
  await page.tap('#mode-slate');
  await page.waitForTimeout(300);
  check('once read back, the hint goes', (await page.locator('.empty-hint').count()) === 0);

  // On a phone, the document commands are in a menu.
  await page.tap('#menu-button');
  await page.tap('#show-help');
  check('on a phone, the instructions say to use Slate mode, and fold the shortcuts away',
    await page.locator('#help .phone-first').isVisible() && await page.locator('#shortcuts-section[open]').count() === 0);
  await page.keyboard.press('Escape');
  check('document commands are in a menu', await page.locator('#new-doc').isHidden() && await page.locator('#menu-button').isVisible());
  await page.tap('#menu-button');
  check('menu opens', await page.locator('#new-doc').isVisible() && (await page.getAttribute('#menu-button', 'aria-expanded')) === 'true');
  check('menu moves focus to its first item', await page.evaluate(() => document.activeElement.id === 'new-doc'));
  await page.keyboard.press('Escape');
  check('Escape closes the menu and returns focus',
    await page.locator('#new-doc').isHidden() && await page.evaluate(() => document.activeElement.id === 'menu-button'));
  await page.tap('#menu-button');
  await page.locator('#file-status').tap({ position: { x: 8, y: 6 } });
  check('tapping elsewhere closes the menu', await page.locator('#new-doc').isHidden());
  // A flagged word near the right edge of the screen: its popover stays on screen.
  await page.tap('#mode-brailler');
  await page.waitForTimeout(300);
  // As with a keyboard connected to the phone.
  await page.focus('#editor');
  await type(page, 'my cat sat on a mat by the ');
  await page.keyboard.press('Enter');
  await type(page, 'my ');
  const theWord = page.locator('.print.differs', { hasText: 'the' }).first();
  const wordBox = await theWord.boundingBox();
  await page.touchscreen.tap(wordBox.x + 6, wordBox.y + 30);
  await page.waitForTimeout(200);
  const scrolled = () => page.evaluate(() => document.querySelector('#sheet').parentElement.scrollLeft);
  const before = await scrolled();
  const viewport = page.viewportSize();
  const popBox = await page.locator('#word-popover').boundingBox();
  check('the popover stays on screen', popBox && popBox.x >= 0 && popBox.x + popBox.width <= viewport.width, JSON.stringify(popBox));
  const show = await page.locator('#word-popover button', { hasText: 'Show correct form' }).boundingBox();
  await page.touchscreen.tap(show.x + show.width / 2, show.y + show.height / 2);
  await page.waitForTimeout(200);
  check('Show correct form shows it, without scrolling the page',
    (await page.locator('#word-popover .correct').count()) === 1 && (await scrolled()) === before, `${before} ${await scrolled()}`);
  const nextPrint = await page.locator('.print', { hasText: 'my' }).last().boundingBox();
  const pop = await page.locator('#word-popover').boundingBox();
  check('the popover is above the next line', pop.y + pop.height <= nextPrint.y + 2, `${JSON.stringify(pop)} ${JSON.stringify(nextPrint)}`);
  // A long line written on the slate is read from its start in Brailler mode.
  await page.tap('#mode-slate');
  await page.waitForTimeout(300);
  await page.tap('#slate-newline');
  for (let i = 0; i < 4; i++) { await page.tap('.slate-dot[data-dot="1"]'); await page.tap('#slate-next'); }
  await page.tap('#mode-brailler');
  await page.waitForTimeout(400);
  check('back in Brailler mode, a short line is shown from its start', (await scrolled()) === 0, await scrolled());
  await page.tap('#mode-slate');
  await page.waitForTimeout(300);
  await page.tap('#slate-next');
  for (let i = 0; i < 26; i++) { if (i % 3 < 2) await page.tap('.slate-dot[data-dot="1"]'); await page.tap('#slate-next'); }
  await page.tap('#mode-brailler');
  await page.waitForTimeout(400);
  // The print over the word at the cursor: the last on the cursor's line.
  const caretPrint = await page.evaluate(() => {
    const caret = document.querySelector('.caret-spot').getBoundingClientRect();
    const onLine = [...document.querySelectorAll('.print')].map((e) => e.getBoundingClientRect())
      .filter((r) => r.bottom <= caret.top + 8 && r.bottom > caret.top - 30);
    const r = onLine.sort((a, b) => b.right - a.right)[0];
    return r && { x: r.x, right: r.right, width: innerWidth };
  });
  check('and a long one from the start of the word at the cursor, with its print',
    caretPrint && caretPrint.x >= 0 && caretPrint.right <= caretPrint.width, JSON.stringify(caretPrint));
  check('no page errors on the phone', errors.length === 0, errors.join('; '));
  await context.close();

  // Turned sideways, the slate goes down the right side, beside the page.
  console.log('webkit, iPhone landscape');
  const land = await browser.newContext(devices['iPhone 14 landscape']);
  const lpage = await land.newPage();
  await lpage.goto(URL);
  await lpage.waitForFunction(() => !document.querySelector('#editor').disabled);
  const lhint = await lpage.locator('.empty-hint').textContent();
  check('empty page says how to start, with the switch below', lhint.includes('Slate') && lhint.includes('below'), lhint);
  await lpage.tap('#mode-slate');
  await lpage.waitForTimeout(300);
  const slateBox = await lpage.locator('#slate').boundingBox();
  const sheetBox = await lpage.locator('.sheet-scroll').boundingBox();
  const view = lpage.viewportSize();
  check('slate is down the side', slateBox.y <= 1 && slateBox.height >= view.height - 1, JSON.stringify(slateBox));
  check('page is beside the slate, not under it', sheetBox.x + sheetBox.width <= slateBox.x + 1 && sheetBox.height > view.height / 2,
    `${JSON.stringify(sheetBox)} ${JSON.stringify(slateBox)}`);
  const cellBox = await lpage.locator('.slate-cell').boundingBox();
  check('whole slate fits on screen', cellBox.y >= 0 && cellBox.y + cellBox.height <= view.height, JSON.stringify(cellBox));
  await lpage.tap('.slate-dot[data-dot="1"]');
  await lpage.tap('#slate-next');
  check('slate writes in landscape', (await lpage.locator('#editor').inputValue()) === 'a');
  check('the start of the line is in view', await lpage.evaluate(() => {
    const scroll = document.querySelector('.sheet-scroll');
    return scroll.scrollLeft >= scroll.scrollWidth - scroll.clientWidth - 1;
  }));
  await browser.close();
}
process.exit(failures ? 1 : 0);
