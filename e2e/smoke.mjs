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

  await type(page, 'and');
  check('chords enter Braille ASCII', (await ta.inputValue()) === 'and', await ta.inputValue());
  check('unfinished word is not flagged', (await page.locator('.mark').count()) === 0);
  await page.waitForTimeout(80);
  check('cell echo announced', (await announced(page)).includes('d'));
  await type(page, ' ');
  await page.waitForTimeout(80);
  check('completed uncontracted word is flagged', (await page.locator('.mark.differs').count()) === 1);
  check('space announces issue', (await announced(page)).includes('possible contraction issue'), await announced(page));
  check('print interlining shows learner reading', (await page.locator('.print').first().textContent()) === 'and');

  await type(page, '& ! cat4 ');
  check('contracted words not flagged', (await page.locator('.mark').count()) === 1, String(await page.locator('.mark').count()));

  await page.keyboard.press(browserType === webkit ? 'Meta+ArrowLeft' : 'Home');
  await page.keyboard.press('Alt+KeyW');
  await page.waitForTimeout(80);
  check('Alt+W speaks word feedback', (await announced(page)).includes('Possible contraction issue'), await announced(page));
  await page.keyboard.press('Alt+KeyR');
  await page.waitForTimeout(80);
  check('Alt+R reveals reference', (await announced(page)).includes('Reference: ampersand'), await announced(page));
  check('reveal leaves braille unchanged', (await ta.inputValue()).startsWith('and & '));
  check('reference shown in panel', (await page.locator('#word-details').textContent()).includes('&'));

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  check('typing letters does nothing', await (async () => { await page.keyboard.press('q'); return !(await ta.inputValue()).includes('q'); })());
  await page.keyboard.press('Alt+KeyT');
  check('feedback off hides print and marks', (await page.locator('.print, .mark').count()) === 0 && await page.locator('#word-panel').isHidden());
  await page.keyboard.press('Alt+KeyT');

  // Wrapping: a long paragraph must break only at spaces, within 40 cells.
  await page.keyboard.press(browserType === webkit ? 'Meta+ArrowRight' : 'End');
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
  await page.keyboard.press(browserType === webkit ? 'Meta+ArrowLeft' : 'Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  const caret = () => page.evaluate(() => document.querySelector('#editor').selectionStart);
  check('braille caret follows print caret', (await caret()) === 4, String(await caret()));
  check('focus stays in print view', await page.evaluate(() => document.activeElement.id === 'print-view'));
  await page.keyboard.press('Alt+KeyW');
  await page.waitForTimeout(80);
  check('Alt+W works from the print view', (await announced(page)).includes('and. Matches'), await announced(page));
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

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
}
process.exit(failures ? 1 : 0);
