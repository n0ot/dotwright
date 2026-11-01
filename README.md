# Dotwright

Learn by Brailling.

**Use it at https://n0ot.github.io/dotwright/**

Dotwright is a braille writing practice tool that runs in a web browser. It's for people who know basic braille and are learning to write contracted Unified English Braille (UEB), and it works for both sighted and blind learners.

You write braille yourself, cell by cell, with six-key entry on an ordinary keyboard, as on a Perkins brailler. As you finish each word, Dotwright can show you:

- the print reading of what you wrote, above the braille
- a wavy underline on words with a contraction error, meaning they differ from fully contracted UEB, and a dotted one on braille that couldn't be read
- the correct, fully contracted form, but only when you ask for it: click the word and choose Show correct form, or press Alt+R

Dotwright never changes your braille. There's no "fix" button: you make every correction yourself, which is the point. Feedback can be turned off entirely, so you can write on your own and check later.

## Features

- **Six-key entry** with F D S J K L and the space bar, or any six keys you choose, to suit your keyboard layout.
- **Two modes**, chosen with a switch under the page. **Brailler** mode is like a braillewriter: six keys on the keyboard write the braille as read, left to right, with print and feedback. **Slate** mode is like a slate and stylus, for practising on a phone or with a mouse or trackpad: the page is turned over and mirrored, lines run right to left, dots are pits, and there's no feedback until you switch back to Brailler, as you'd turn the paper over to check it. A slate under the page writes one cell at a time, mirrored too, with dots 1, 2 and 3 on the right: set the dots, then Next writes them at the cursor, and Delete (Backspace on Windows and Linux) erases the cell before it. In Slate mode the keyboard only moves the cursor.
- **Screen reader support** for VoiceOver on macOS and NVDA on Windows. Moving through the braille announces each cell as its Braille ASCII character. Moving onto a word with an error says "contraction error", and keyboard commands give the print and status of the word at the cursor.
- **A print view** for screen reader users: a hidden, read-only copy of the print, line for line. Moving through it moves the braille cursor to the same word.
- **BRF files**: open existing ones and save your work, in the standard 40-cell, 25-line page format. Your braille is saved exactly as you wrote it, mistakes included.
- **Private and offline.** Your writing never leaves your computer. After the first visit, Dotwright works without an internet connection. If the page is refreshed by accident, your work is restored from a copy kept in the browser, but saving a BRF file is the way to keep it.

Each cell's empty dot positions are drawn as faint grey points behind the raised dots, like Duxbury's SimBraille, so it's easy to see where each dot sits. They can be turned off in Settings for raised dots only, as on paper.

In Brailler mode, the print reading of each word appears above it once the word is finished, with a space, a new line, or by moving away from it, and that's when it's checked. A word left unfinished on the slate is read when you switch to Brailler, and one left unfinished when the page was closed is read when it opens. To see the reading change with every cell instead, turn on "Interline each word as it is written" in Settings; the word being written is still only checked once it's finished.

Press Command+/ (Ctrl+/ on Windows and Linux) in Dotwright for the instructions and keyboard shortcuts.

## Limitations

- Feedback is only as good as liblouis's reading of braille back into print. It can misread some entries, so now and then a word may be marked as a contraction error when it isn't.
- Words are checked one at a time. Capitalized and grade 1 passages are followed across words, but other multi-word rules, such as emphasis passages, aren't yet.
- Contraction checking is always against fully contracted UEB. There are no settings for learning a subset of contractions.
- Safari and Chrome on a computer, and Safari on iPhone, are tested; Firefox and Android aren't. NVDA support hasn't been tested with NVDA itself yet.
- The slate is designed for sighted use. Its buttons work with a keyboard and screen reader, but there's no direct-touch slate for VoiceOver on iPhone.
- On a phone, a 40-cell line is wider than the screen, so the page scrolls sideways to follow the cursor. Held sideways, the slate moves to the right of the page. The document commands, Settings and Instructions are in a menu at the top.
- A cell punched without mirroring often reads as some other braille that liblouis accepts, so it may show odd print rather than a contraction error.

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

To try it on a phone, serve it on every network interface with `npm run dev -- --host`, and open the address it prints. Over Tailscale, the machine's MagicDNS name (ending in `.ts.net`) works too.

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

The smoke test covers six-key typing, feedback, the print view, go-to, custom keys, saving, recovery, discarding and the slate, including on an emulated iPhone in portrait and landscape. Run it against the development server:

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

- **Editor** (`src/editor.ts`): a native text area holding the document as Braille ASCII, line for line like a BRF file. Screen readers read it natively, so each cell is announced as its Braille ASCII character. The braille font draws those characters as dots. Lines are at most 40 cells, and pages are 25 lines. As on a braillewriter, a full line takes no more cells until a new line is started, and a margin bell rings when 6 cells are left (a setting). Words are never moved to the next line for the learner, since deciding whether a word fits is part of the skill; pasting or joining lines still breaks an overlong line at a space.
- **Six-key entry**: chords of F D S J K L by default, with the space bar for space. Learners can choose other keys in Settings (`src/keymap.ts`). They write in Brailler mode only.
- **Slate**: dots are held on the slate until written; the editor's slate methods then write or erase at the caret through the same edit path as the keyboard, so undo, line wrapping and feedback work the same. Slate mode shows the same text area, mirrored with a CSS transform (the back of the page), and turns off editing from the keyboard (`keyboardEdits`).
- **Feedback** (`src/feedback.ts`): each word is read back to print with liblouis and translated forward again to fully contracted UEB. A word that differs is flagged as a possible issue, and a word that can't be read is reported as such. Capitalized and grade 1 passages are tracked across words.
- **Print view**: a hidden, read-only text field after the document holding the print line for line. Its cursor and the braille cursor follow each other by word.
- **Files** (`src/brf.ts`, `src/files.ts`): BRF files are opened and saved locally. Chrome and Edge save in place; Safari saves as a download.
- **Recovery** (`src/recovery.ts`): a copy of the current document is kept in the browser's local storage so a refresh doesn't lose work. It is not a substitute for saving a BRF file.
- **Offline**: `vite.config.ts` generates `sw.js` at build time, listing every built file to cache.

Keyboard shortcuts are listed in the app under Instructions (Command+/ or Ctrl+/). They show Command and Option on Apple devices, and Ctrl and Alt elsewhere.

### Project layout

```
index.html             Page, dialogs and instructions
src/                   App code (TypeScript) and styles
src/louis/             liblouis compiled to WebAssembly, with its TypeScript wrapper
src/fonts/             The braille dot fonts (raised dots, and empty positions)
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

#### Braille fonts

`src/fonts/dotwright-braille.woff2` and `dotwright-braille-shadows.woff2` are generated by `tools/make-font.py`:

```sh
python3 -m venv .venv
.venv/bin/pip install fonttools brotli
.venv/bin/python tools/make-font.py
```

## Licenses

liblouis and its translation tables are licensed under the GNU LGPL, version 2.1 or later. Dotwright loads them as a separate, unmodified WebAssembly module (`src/louis/`), built from the liblouis 3.39.0 source release by `tools/liblouis/build.sh`. That source is available from [liblouis.io](https://liblouis.io).
