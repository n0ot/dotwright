# Design review

October 2026. A review of how Dotwright looks and works on desktop, iPad and iPhone (portrait and landscape, light and dark), the research behind it, what was changed, and what to do next.

## Research

**Slate writing.** The difficulty of slate writing is mostly in the learner's head. The Braille Authority of North America and NFB writers point out that it isn't "backwards" writing: a word is spelled in the same order, and only the direction across the page and the dot positions change. Teachers keep a braille alphabet in real dots nearby, have learners write without looking, and check work without taking the paper out of the slate. Dotwright's two modes match this: Slate mode is the back she punches, and Brailler mode is the front, the check. (They were called Front and Back until November 2026; see slate-input.md.)

**Sighted adult learners.** A 2025 interview study of sighted adults learning braille (mostly teachers of blind students, [arXiv 2512.03398](https://arxiv.org/html/2512.03398)) found:

- Practice time is short and broken up, so tools should work in 10 to 15 minute sessions on a phone.
- With little day-to-day exposure to braille, sighted learners forget quickly. Repetition helps, but drill is tedious.
- Learners want instant feedback that explains the rule behind a mistake, not just a flag.
- Correcting mistakes (a backspace) matters in writing practice.
- Tools must still be accessible: adjustable contrast and size, and screen reader support, since teachers use them with blind students.

**Other products.** Most braille apps for sighted learners teach reading or recognition: UEB Prep (Portland State), Braille Tutor, DotSense, Braille Decoded, and the free UEB Online course. Visual Brailler (APH) is a six-key keyboard. The closest to a slate is the University of Washington's V-Braille writer, which asks for one letter at a time on empty dot outlines. None of them has a mirrored slate with free writing and contraction feedback, so Dotwright isn't copying a convention. It should borrow from the phone keyboard, which she uses every day, wherever it can.

**Slates.** Common slates are 4 lines by 28 cells, and full-page slates are 25 or 27 lines by 28 cells. Dotwright's lines are 40 cells, which matches a braillewriter, not a slate.

## What was wrong

The most serious problems first.

1. **On a phone held sideways, the slate covered the whole screen.** The page couldn't be seen at all.
2. **Nothing said what to do first.** An empty page, a page icon and a turned-page icon. On a phone, with no keyboard, she had to know to tap the second icon.
3. **The buttons had no words.** Next was a picture of two cells and an arrow; New line a row of cells and an arrow; Front and Back two page icons that differ by a folded corner. Pictures alone are slow to learn, and they're what the earlier "does she find Next?" question was about.
4. **The header took a quarter of the phone screen**, wrapping onto three rows, which left little room for the page.
5. **The page looked like a text box, not paper.** On a desktop it was a short white strip with a blue border, with most of the window empty under it. On a phone its right edge was cut off by the screen with nothing to show it continued.
6. **The slate's dots were hard to see.** Unpunched dots were faint rings. In dark mode, punched dots were dark grey on near-black, hard to tell from unpunched ones: below the 3:1 contrast that controls' states need.
7. **The slate didn't look like a slate.** A plain rounded card.
8. **No brand mark or icon**, so the browser tab and home screen looked unfinished.

## What changed

- **Landscape phones:** on the back, the slate moves to a column down the right side, and the page fills the rest. The page geometry and header use the compact phone sizes in landscape too.
- **Labels on every slate button:** Next, Delete (Backspace on Windows and Linux), New line, Front, Back. The label is also the button's accessible name, so what's seen and what's heard match. The icons stay, as a second cue.
- **A phone-keyboard layout:** Next, the key used most, is a tall blue key on the left, the way the stylus moves on the back. Delete and New line are stacked on the right, as delete and return are on an iPhone keyboard. Front and Back are a labelled segmented switch under the slate.
- **A slate that looks like one:** the cell is a window in an aluminium-coloured frame, with the paper showing through. Unpunched dots are rings at more than 3:1 contrast with the paper; punched dots fill the space and are clearly different in light and dark modes.
- **A hint on an empty page,** saying what to do first: on a phone, "turn the page over: tap Back, below"; on a computer, the braille keys to press, or Back for the slate; on the back, "tap dots on the slate below, then Next". It's visual only, as the instructions already cover it for screen reader users.
- **On the front, the Front / Back switch floats over the page** instead of sitting in a full-width panel, so the page runs to the bottom of the screen. The page keeps room under its last line to scroll clear of the switch.
- **Screen reader announcements are cleared after 8 seconds.** Before, the last one (such as "Front of the page") stayed on the page, where VoiceOver could find it by touch near the bottom of the screen.
- **The page fills the window** down to the slate, like a sheet of paper. Clicking below the last line goes to the end. On a phone it runs to the edges of the screen, and its edges fade where there's more page to scroll to.
- **A compact header on phones:** the logo, the name, the Feedback switch and a menu button. The menu holds New, Open, Save, Settings and Instructions. It's a disclosure button (`aria-expanded`), which moves focus to the first item when opened and back to the button on Escape. Items are 44 points tall.
- **A brand mark:** a braille cell in the accent colour, also used as the browser icon, with theme colours for Safari's toolbar.
- On a desktop, the order of the header changed: the Feedback switch now comes before New, Open and Save.

## Accessibility checks

- Every control is still a real button with a name. The slate's labels are now visible text, not `aria-label`.
- The phone menu is a disclosure with focus management and Escape. On a desktop it isn't a menu, and the buttons are in the header as before.
- The new hint and page fill don't change what a screen reader reads; the hint is in the hidden overlay.
- Contrast: unpunched dot rings are 3.4:1 against the paper in light mode and 3.6:1 in dark mode; punched dots are 13:1 and 6.9:1. Text is unchanged.
- Safe areas: the page and slate keep clear of the notch and home indicator in both orientations.
- Reduced motion is still respected.

## Things to watch when she tries it

- Does she find Slate on the phone from the hint, without being told? Do the Brailler and Slate pictures read as what they are?
- Does the tall Next key get used without hesitation? Does she ever press Delete by mistake?
- In landscape, does the right-hand slate feel natural, or does she want it on the left?
- Is the slate frame helpful, or is it decoration she doesn't notice?
- In bright light, are the rings clear enough now?

## What to do next

In rough order of value:

1. **Cells per line to match her slate** (28 is common). It makes the back look like her paper and the habits transfer. It would also make the page fit better on a phone.
2. **Explain mistakes, not just mark them.** The research is clear that learners want the rule. A short "why" under the correct form (for example, "and has its own sign") would need a small table of common contractions and their rules.
3. **Short practice sessions:** a word or sentence to write, checked on the front. This suits 10-minute sessions on a phone, and makes the mirror hint possible, because the intended word is known.
4. **A finished, installable app:** a home-screen icon (a PNG apple-touch-icon) and a web app manifest, so it opens full screen from the iPhone home screen. The offline service worker is already there.
5. A dot-number overlay on the slate as an optional learning aid, removed earlier, could return as a setting that fades out with use.

## Sources

- [Tips for teaching slate and stylus, Paths to Literacy](https://pathstoliteracy.org/tips-for-teaching-slate-and-stylus)
- [The Use of the Braille Slate and Stylus, BANA](https://brailleauthority.org/node/57)
- [Teacher, But Also Student: Challenges and Tech Needs of Adult Braille Learners with Sight (arXiv)](https://arxiv.org/html/2512.03398)
- [Braille Tutor app review, Perkins](https://www.perkins.org/resource/braille-tutor-app-review-updated/)
- [UEB Prep app, Paths to Literacy](https://www.pathstoliteracy.org/resource/ueb-prep-app/)
- [V-Braille applications, University of Washington](https://vbraille.cs.washington.edu/Applications)
- [Using Visual Brailler, Perkins](https://www.perkins.org/resource/using-visual-brailler-app-digital-perkins-braillewriter/)
- [Slate and stylus, Wikipedia](https://en.wikipedia.org/wiki/Slate_and_stylus)
