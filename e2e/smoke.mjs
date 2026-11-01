// Drives the app in Chromium and WebKit the way a six-key typist would.
// Usage: npx vite --port 5173 & node e2e/smoke.mjs
import { chromium, webkit } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5173/';
const DOTS = { 1: 'f', 2: 'd', 3: 's', 4: 'j', 5: 'k', 6: 'l' };
// Braille ASCII to dot numbers, for the cells this test types.
const CELLS = { a: '1', n: '1345', d: '145', '&': '12346', '!': '2346', c: '14', t: '2345', '4': '256', ',': '6' };

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
  check('space announces issue', (await announced(page)).includes('contraction error'), await announced(page));
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
  await page.keyboard.press('Alt+KeyT');
  check('feedback off hides print, marks and the popover', (await page.locator('.print, .mark').count()) === 0 && await page.locator('#word-popover').isHidden());
  await page.keyboard.press('Alt+KeyT');

  // Wrapping: a long paragraph must break only at spaces, within 40 cells.
  await page.keyboard.press(LINE_END);
  for (let i = 0; i < 6; i++) await type(page, '!c!c!c ');
  const lines = (await ta.inputValue()).split('\n');
  check('lines wrap at 40 cells', lines.length > 1 && lines.every((l) => l.trimEnd().length <= 40), JSON.stringify(lines));
  check('no word split across lines', lines.slice(1).every((l) => l.startsWith('!c!c!c')), JSON.stringify(lines));

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

  // Custom braille keys typed in order into a field, punctuation included.
  await page.keyboard.press('Alt+KeyB');
  await page.keyboard.type('qwe');
  await page.keyboard.press('Enter');
  check('rejects fewer than 6 keys', (await page.locator('#dot-keys-error').textContent()).includes('6 keys'));
  await page.fill('#dot-keys', 'd c x h , .');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  check('saves dot keys', (await announced(page)).includes('Braille keys saved'), await announced(page));
  await page.click('#new-doc');
  // Dots 1 and 5 (d and ,) make "e".
  await page.keyboard.down('d'); await page.keyboard.down(','); await page.keyboard.up('d'); await page.keyboard.up(',');
  await page.keyboard.press('Space');
  check('custom keys enter braille', (await ta.inputValue()) === 'e ', await ta.inputValue());
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#editor').disabled);
  await page.keyboard.press('d');
  check('custom keys persist', (await ta.inputValue()) === 'e a', await ta.inputValue());
  await page.keyboard.press('Alt+KeyB');
  await page.click('#keys-default');
  check('no instructions on the page', !(await page.locator('body > :not(dialog)').allInnerTexts()).join(' ').match(/press|substitute|F D S/i));

  // Slate: tap dots to write the cell at the cursor; keyboard focus stays in the document.
  await page.click('#new-doc');
  const punch = async (...dots) => { for (const d of dots) await page.click(`.slate-dot[data-dot="${d}"]`); };
  const pressed = () => page.evaluate(() => [...document.querySelectorAll('.slate-dot[aria-pressed="true"]')].map((b) => b.dataset.dot).join(''));
  check('front shows only the Front and Back buttons',
    await page.locator('#side-back').isVisible() && await page.locator('.slate-cell').isHidden() && await page.locator('#slate-next').isHidden());
  check('no slate cursor on the front', (await page.locator('.slate-cursor').count()) === 0);
  await page.click('#side-back');
  await page.waitForTimeout(300);
  check('back shows the slate', await page.locator('.slate-cell').isVisible() && (await page.locator('.slate-cursor').count()) === 1);
  const dotColumn = () => page.evaluate(() => getComputedStyle(document.querySelector('.slate-dot[data-dot="1"]')).gridColumnStart);
  check('slate is mirrored', (await dotColumn()) === '2', await dotColumn());
  check('screen readers hear that the dots are mirrored', (await page.getAttribute('.slate-cell', 'aria-label')) === 'Dots, mirrored');
  check('Back shows the page mirrored and without print', await page.locator('#sheet.back').count() === 1);
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
  check('keyboard works alongside the slate', (await ta.inputValue()) === 'ac a', JSON.stringify(await ta.inputValue()));
  await punch(2, 3, 4, 6);
  await page.click('#slate-newline');
  check('New line writes the dots set, then starts a line', (await ta.inputValue()) === 'ac a!\n', JSON.stringify(await ta.inputValue()));
  check('slate position shown', (await page.locator('#slate-position').textContent()).startsWith('Line 2'));
  await page.click('#slate-delete');
  check('Delete deletes a line break', (await ta.inputValue()) === 'ac a!', JSON.stringify(await ta.inputValue()));
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyZ' : 'Control+KeyZ');
  check('undo brings back what Delete deleted', (await ta.inputValue()) === 'ac a!\n', JSON.stringify(await ta.inputValue()));

  check('side switch shows the back', (await page.getAttribute('#side-back', 'aria-pressed')) === 'true');
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#editor').disabled);
  check('side is remembered', await page.locator('#sheet.back').count() === 1);
  await page.keyboard.press('Alt+KeyW');
  await page.waitForTimeout(80);
  check('word feedback explains the back', (await lastSaid(page)).includes('back of the page'), await lastSaid(page));
  await page.keyboard.press('Alt+KeyF');
  await page.waitForTimeout(300);
  check('Alt+F flips back to the front, with feedback on what was written',
    await page.locator('#sheet.back').count() === 0 && (await page.locator('.print').count()) > 0 && await page.locator('.slate-cell').isHidden());

  await page.click('#show-settings');
  await page.click('#show-slate');
  await page.keyboard.press('Escape');
  check('Settings hide the slate', await page.locator('#slate').isHidden());
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#editor').disabled);
  check('hidden slate stays hidden', await page.locator('#slate').isHidden());
  await page.click('#show-settings');
  await page.click('#show-slate');
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
  await page.tap('#side-back');
  await page.waitForTimeout(300);
  for (const d of [2, 3, 4, 6]) await page.tap(`.slate-dot[data-dot="${d}"]`);
  await page.tap('#slate-next');
  await page.tap('#slate-next');
  check('tapping the slate writes braille', (await page.locator('#editor').inputValue()) === '! ');
  const slateTop = (await page.locator('#slate').boundingBox()).y;
  const cursor = await page.locator('.slate-cursor').boundingBox();
  check('cursor is above the slate', cursor.y + cursor.height <= slateTop, `${cursor.y} ${slateTop}`);
  check('empty page has no hint once written', (await page.locator('.empty-hint').count()) === 0);
  await page.tap('#side-front');
  await page.waitForTimeout(300);
  check('front has no slate panel, just the switch',
    await page.evaluate(() => getComputedStyle(document.querySelector('#slate')).backgroundImage === 'none' && getComputedStyle(document.querySelector('#slate')).borderTopWidth === '0px'));
  const sheetBottom = (await page.locator('#sheet').boundingBox());
  const switchBox = await page.locator('.side-switch').boundingBox();
  check('page runs down behind the switch', sheetBottom.y + sheetBottom.height > switchBox.y + switchBox.height, `${JSON.stringify(sheetBottom)} ${JSON.stringify(switchBox)}`);
  const cleared = await page.waitForFunction(() => [...document.querySelectorAll('#announcements div')].every((d) => d.textContent === ''), null, { timeout: 10000 }).then(() => true, () => false);
  check('spoken announcements are cleared from the page', cleared);
  await page.tap('#side-back');
  await page.waitForTimeout(300);

  // On a phone, the document commands are in a menu.
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
  check('no page errors on the phone', errors.length === 0, errors.join('; '));
  await context.close();

  // Turned sideways, the slate goes down the right side, beside the page.
  console.log('webkit, iPhone landscape');
  const land = await browser.newContext(devices['iPhone 14 landscape']);
  const lpage = await land.newPage();
  await lpage.goto(URL);
  await lpage.waitForFunction(() => !document.querySelector('#editor').disabled);
  check('empty page says how to start', (await lpage.locator('.empty-hint').textContent()).includes('Back'));
  await lpage.tap('#side-back');
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
  await browser.close();
}
process.exit(failures ? 1 : 0);
