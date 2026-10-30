// Checks that the built app works offline after its first load.
// Usage: npm run build && npx vite preview --port 4173 & node e2e/offline.mjs
import { chromium, webkit } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:4173/';
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`); };

for (const browserType of [chromium, webkit]) {
  console.log(browserType.name());
  const browser = await browserType.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => !document.querySelector('#editor').disabled);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  const loaded = await page.waitForFunction(() => !document.querySelector('#editor').disabled, null, { timeout: 10_000 }).then(() => true, () => false);
  check('app loads offline', loaded);
  if (loaded) {
    // "and" uncontracted, then space: translation and checking run offline.
    for (const keys of [['f'], ['f', 's', 'j', 'k'], ['f', 'j', 'k']]) {
      for (const k of keys) await page.keyboard.down(k);
      for (const k of keys) await page.keyboard.up(k);
    }
    await page.keyboard.press('Space');
    check('contraction feedback works offline', (await page.locator('.mark.differs').count()) === 1);
    check('braille font loads offline', await page.evaluate(() => document.fonts.check("30px 'Dotwright Braille'")));
  }
  await browser.close();
}
process.exit(failures ? 1 : 0);
