# Dotwright

Learn by Brailling.

**Use it at https://n0ot.github.io/dotwright/**

Dotwright is a braille writing practice tool that runs in a web browser. It's for people who know basic braille and are learning to write contracted Unified English Braille (UEB), and it works for both sighted and blind learners.

You write braille yourself, cell by cell, with six-key entry on an ordinary keyboard, as on a Perkins brailler. As you finish each word, Dotwright can show you:

- the print reading of what you wrote, above the braille
- whether the word differs from its fully contracted UEB form, or couldn't be read at all
- the fully contracted reference form, but only when you ask for it

Dotwright never changes your braille. There's no "fix" button: you make every correction yourself, which is the point. Feedback can be turned off entirely, so you can write on your own and check later.

## Features

- **Six-key entry** with F D S J K L and the space bar, or any six keys you choose, to suit your keyboard layout.
- **Screen reader support** for VoiceOver on macOS and NVDA on Windows. Moving through the braille announces each cell as its Braille ASCII character, and keyboard commands give the print and contraction status of the word at the cursor.
- **A print view** for screen reader users: a hidden, read-only copy of the print, line for line. Moving through it moves the braille cursor to the same word.
- **BRF files**: open existing ones and save your work, in the standard 40-cell, 25-line page format. Your braille is saved exactly as you wrote it, mistakes included.
- **Private and offline.** Your writing never leaves your computer. After the first visit, Dotwright works without an internet connection. If the page is refreshed by accident, your work is restored from a copy kept in the browser, but saving a BRF file is the way to keep it.

Press Alt+H in Dotwright for the full list of keyboard commands.

## Limitations

- Feedback is only as good as liblouis's reading of braille back into print. It can misread some entries, so a flagged word means "worth a second look", not proof of a mistake.
- Words are checked one at a time. Capitalized and grade 1 passages are followed across words, but other multi-word rules, such as emphasis passages, aren't yet.
- Contraction checking is always against fully contracted UEB. There are no settings for learning a subset of contractions.
- Desktop and laptop browsers only: Safari and Chrome are tested, Firefox isn't. NVDA support hasn't been tested with NVDA itself yet.

## Development

### Requirements

- Node.js 20.19 or later (or 22.12 or later), with npm.
- For the browser tests only: Playwright's Chromium and WebKit browsers (see [Tests](#tests)).

### Getting started

```sh
npm install
npm run dev
```

Then open http://localhost:5173. The development server reloads as you change code. It doesn't register the offline service worker.

### Building

```sh
npm run build
```

This type-checks the code and writes the finished site to `dist/`:

- `index.html`, plus scripts, styles (with the braille dot font built in) and the liblouis WebAssembly file in `assets/`
- `sw.js`, the service worker that caches the app for offline use

To try the built site locally:

```sh
npm run preview
```

Then open http://localhost:4173.

#### Deploying

Every push to `main` runs the tests, builds the site and publishes it to GitHub Pages at https://n0ot.github.io/dotwright/ (see `.github/workflows/pages.yml`).

To host it somewhere else: `dist/` is a static site, so copy its contents into any folder of any website, such as `https://example.org/tools/dotwright/`. All of its links are relative, so it works wherever it's placed. There is no server code, and documents never leave the learner's browser.

- Serve it over HTTPS. Offline use needs a service worker, which browsers only allow over HTTPS (or on `localhost`).
- Copies on the same site share one browser recovery copy and one braille key setting, because browsers store those per site, not per folder. One copy per site avoids this.

### Tests

Unit tests cover braille translation and feedback, line wrapping, BRF reading and writing, go-to and key settings:

```sh
npm test
```

The browser tests drive the real app in Chromium and WebKit, Safari's engine. Install those browsers once:

```sh
npx playwright install chromium webkit
```

The smoke test covers six-key typing, feedback, the print view, go-to, custom keys, saving, recovery and discarding. Run it against the development server:

```sh
npm run dev          # in one terminal
npm run smoke        # in another
```

The offline test loads the built site, goes offline, reloads, and checks that writing and feedback still work:

```sh
npm run build
npm run preview      # in one terminal
npm run offline      # in another
```

None of these replace testing with VoiceOver and NVDA themselves.

### How it works

- **Editor** (`src/editor.ts`): a native text area holding the document as Braille ASCII, line for line like a BRF file. Screen readers read it natively, so each cell is announced as its Braille ASCII character. The braille font draws those characters as dots. Lines are at most 40 cells, and pages are 25 lines.
- **Six-key entry**: chords of F D S J K L by default, with the space bar for space. Learners can choose other keys with Alt+B (`src/keymap.ts`).
- **Feedback** (`src/feedback.ts`): each word is read back to print with liblouis and translated forward again to fully contracted UEB. A word that differs is flagged as a possible issue, and a word that can't be read is reported as such. Capitalized and grade 1 passages are tracked across words.
- **Print view**: a hidden, read-only text field after the document holding the print line for line. Its cursor and the braille cursor follow each other by word.
- **Files** (`src/brf.ts`, `src/files.ts`): BRF files are opened and saved locally. Chrome and Edge save in place; Safari saves as a download.
- **Recovery** (`src/recovery.ts`): a copy of the current document is kept in the browser's local storage so a refresh doesn't lose work. It is not a substitute for saving a BRF file.
- **Offline**: `vite.config.ts` generates `sw.js` at build time, listing every built file to cache.

Keyboard commands are listed in the app under Instructions (Alt+H).

### Project layout

```
index.html             Page, dialogs and instructions
src/                   App code (TypeScript) and styles
src/louis/             liblouis compiled to WebAssembly, with its TypeScript wrapper
src/fonts/             The braille dot font
tools/liblouis/        Script to rebuild the liblouis WebAssembly module
tools/make-font.py     Script to regenerate the braille dot font
e2e/                   Browser tests
vite.config.ts         Build configuration and service worker generation
.github/workflows/     Tests, build and GitHub Pages deployment
```

### Rebuilding generated files

These are checked in, so you only need to regenerate them when changing them.

#### liblouis

`src/louis/louis.mjs` and `src/louis/louis.wasm` are liblouis 3.39.0 compiled with Emscripten. The UEB tables are embedded in the WASM file. To rebuild:

```sh
brew install emscripten
curl -LO https://github.com/liblouis/liblouis/releases/download/v3.39.0/liblouis-3.39.0.tar.gz
tar xzf liblouis-3.39.0.tar.gz
tools/liblouis/build.sh liblouis-3.39.0
```

The script compiles the C sources directly, without running liblouis's `configure` script.

#### Braille font

`src/fonts/dotwright-braille.woff2` is generated by `tools/make-font.py`:

```sh
python3 -m venv .venv
.venv/bin/pip install fonttools brotli
.venv/bin/python tools/make-font.py
```

## Licenses

liblouis and its translation tables are licensed under the GNU LGPL, version 2.1 or later. Dotwright loads them as a separate, unmodified WebAssembly module (`src/louis/`), built from the liblouis 3.39.0 source release by `tools/liblouis/build.sh`. That source is available from [liblouis.io](https://liblouis.io).
