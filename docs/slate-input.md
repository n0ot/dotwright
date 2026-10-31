# Slate input: feature brief

Status: first version built, October 2026. See "What's built" at the end.

## Problem

A sighted learner practising with a real slate and stylus writes several lines, flips the paper, and only then finds mistakes she made lines earlier. Finding them that late is discouraging, and by then she can't tell what she was thinking when she made them.

Dotwright already gives quick feedback, but only for six-key entry on a computer keyboard. Writing on a slate is a different skill: each cell is punched mirrored, and the line is written right to left. There's no way to practise that skill in Dotwright, and no way to use Dotwright on a phone.

## Who it's for

The main user is a sighted adult learning contracted UEB who already uses a real slate. She'll practise on an iPhone and on a MacBook, in Safari on both. Dotwright is practice for the real slate, not a replacement for it.

## Goals

- Practise writing mirrored and right to left, the way a slate works.
- Find mistakes while the word is still fresh, not lines later.
- Show the braille in reading orientation, with the same print interlining and contraction feedback as six-key entry.
- Let her rely on feedback less over time, so that writing on the real slate improves too.
- Work in Safari on an iPhone held in portrait, and on a Mac with a trackpad.
- Look good. Visual polish matters, because she's sighted and this is something she'll come back to.
- Be obvious to a sighted user without explanation, and keep the screen uncluttered.
- Stay usable with a keyboard and screen reader, even though that isn't the main way slate input will be used.

## Non-goals for the first version

- An on-screen six-key (Perkins-style) keyboard on the phone. On a phone, six finger targets take up most of the screen and leave no room for the braille.
- Writing by tapping cells directly on a full page. A full slate line is about 28 cells. Even in landscape that makes each dot a few millimetres wide, much smaller than a fingertip. The page can show where she is, but the writing happens on one large cell.
- Swipe gestures. They're hard to discover, and swiping in from the edge of the screen in iPhone Safari goes back a page. Buttons come first; swipes could come later as a shortcut.
- Matching a real slate's number of cells per line and lines per page exactly.
- Browsers other than Safari, and Android. The design shouldn't rule them out, but they won't be tested.
- A native app, or direct-touch slate input with VoiceOver.

## How it works

### Layout

The screen has two parts:

- **The page**, at the top. It shows the braille written so far, with a cursor at the cell being written.
- **The slate**, at the bottom. It's where she writes.

The slate goes at the bottom because that's where her thumbs are, and so she can watch her hand and glance up at the page. On a Mac it stays at the bottom of the window, so the layout is the same on both devices.

### The slate

- One large cell: a 2×3 grid of dot targets, mirrored as on a slate. Dots 1, 2 and 3 are in the right column and 4, 5 and 6 in the left. On a phone, each target is at least 60 points square.
- Tapping or clicking a target punches that dot. Tapping a punched dot takes it out again.
- The cell is written at the cursor on the page. Its dots appear on the page as she punches them.
- Next to the cell are three buttons:
  - **Next**, with an arrow pointing left, because on a slate the stylus moves left. It moves on to the next cell. Pressing Next on an empty cell writes a space.
  - **Back**, with an arrow pointing right. It goes back one cell so she can fix it.
  - **New line**.
- Tapping a cell on the page moves the cursor there, to fix something further back or carry on writing somewhere else.
- An optional setting shows the dot numbers on the targets. It's a learning aid that she can turn off once mirroring comes naturally.
- Each punch plays a short click sound. iPhone Safari doesn't support vibration from web pages, so there's no haptic feedback.

### Front and back of the page

The page can be shown two ways, and the **Flip** button switches between them:

- **Front:** the braille as it reads, left to right, with print interlining and error marks. This is how Dotwright looks now.
- **Back:** the page as she's punching it, mirrored and written right to left, with no print and no error marks. This is what she sees on a real slate.

On the back she can write a few lines without seeing whether they're right, then flip over to check, just like with paper. On the front she gets feedback as she goes. The front and back are the same document, so flipping doesn't change anything she's written.

### Feedback timing

Research on motor learning suggests this order. Frequent, immediate feedback helps most while a skill is new. If it stays that way, learners come to depend on it and do worse once it's gone (the "guidance hypothesis"). Feedback that becomes less frequent as the learner improves (faded feedback) tends to give better long-term learning.

Front and back make that easy to do:

1. Start on the front, with errors marked as each word is finished. This is the default, and how Dotwright works now.
2. Move to the back, flipping after each line.
3. Write a whole paragraph on the back before flipping, as on paper.

Even at step 2 she finds mistakes at the end of each line, not after several lines. That removes the frustration without taking away practice at writing without help. A later version could suggest the next step when she's making few mistakes.

### Mirroring errors

When a word is wrong but would be right if some of its cells were un-mirrored (for example, she wrote dots 4-5 meaning dots 1-2), Dotwright says so: "Looks like this cell wasn't mirrored." This is the mistake most particular to slate writing, and naming it is more useful than a general contraction error.

### Slate and keyboard together

There are no input modes. Six-key entry on the keyboard always works, on a Mac or on an iPhone with a hardware keyboard, and the slate is always there to tap or click. She can mix them, for example by writing on the slate and fixing a cell from the keyboard.

- The slate is shown by default. A Show slate setting hides it, for people who only use the keyboard and want the space or a shorter list of controls.
- Clicking a slate control leaves keyboard focus on the page, so typing still goes to the braille. The slate controls can still be reached with Tab, for keyboard and screen reader users.
- On an iPhone, the braille page is a text area, and tapping it would normally bring up the on-screen keyboard over the slate. The on-screen keyboard is turned off for the page (`inputmode="none"`), and a hardware keyboard still works.

## Requirements

### Must have

- The page above and a single mirrored cell below, in portrait on an iPhone and in a Mac window.
- Tap or click to punch and un-punch dots.
- Next, Back and New line buttons.
- Tapping a cell on the page moves the cursor there.
- Written cells feed the existing document and feedback, including BRF saving and recovery.
- Six-key entry and the slate both work at all times, with no mode to switch.
- Clicking the slate leaves keyboard focus on the page.
- Tapping the page on an iPhone doesn't bring up the on-screen keyboard.
- A Show slate setting to hide the slate.
- Slate controls that a keyboard and screen reader can operate. For example, each dot target is a toggle button labelled with its dot number.

### Should have

- The Flip button, with front and back views of the page.
- Recognising mirroring errors.
- A click sound on each punch.

### Nice to have

- The dot-number labels setting.
- Swipes as shortcuts for Next and Back.
- Suggesting when to move to a later feedback step.
- A strict mode where punched dots can't be removed, as on paper.
- A cells-per-line setting to match her own slate.

## Accessibility

Slate input is designed for sighted use first. Even so, every control is a real button with a clear label, and the rest of Dotwright keeps its current screen reader support. Making the whole app responsive must not break the keyboard and VoiceOver experience on the desktop.

## How we'll decide the rest

Some questions can't be answered in the abstract, so the plan is to build one working version and watch her use it rather than ask her. Things to watch for:

- Does she find Next without being told, and does the arrow pointing left make sense or confuse her?
- Are the dot targets big enough on her phone, and is the slate the right height?
- Does she use Flip? Which side does she spend most of her time on?
- Does she want to see the line she's on as she writes on the back, or is the cursor enough?

## How we'll know it's working

- She writes several lines on the phone and catches most mistakes within a word or line.
- She says she's less discouraged.
- Over time, she spends more of her time on the back of the page.
- Mistakes she finds on real slate paper become less frequent.

## What's built

The first version has the must-haves, Flip with the front and back of the page, the click sound, and the dot-number setting. Alt+F also flips.

Not built yet:

- **Mirroring errors.** Testing against about a thousand English words showed this needs a word list. Mirroring one cell of a correctly written word almost always gives braille that liblouis reads as some other correctly contracted "word", usually not a real one. So the checker can't tell a mirroring mistake from a different word, and a hint would mostly suggest nonsense. The same finding means an unmirrored cell often doesn't get a contraction-error mark at all. Instead, the print above it reads as something odd, which a sighted learner will notice. A list of common English words would make the hint reliable.
- Swipes, suggested feedback steps, strict mode, and a cells-per-line setting.

## Revised after the first try (October 2026)

In the first version, the slate was always mirrored but the page usually wasn't, so Next pointed left while the cursor moved right. The slate now always matches the side of the page that's shown:

- **Front:** the cell is laid out as read (dots 1, 2 and 3 on the left), Next points right, and dots are raised bumps. Print and feedback are shown.
- **Back:** the page and the cell are mirrored, as on a real slate. Next points left, and dots are pits pressed into the paper. There's no feedback until the page is turned over.

Other changes:

- A Front / Back switch under the slate replaces the Flip button, so it's always clear which side is shown. The side is remembered between visits.
- The button that goes back a cell is now called Previous, so it isn't confused with the back of the page.
- The dot numbers and their setting were removed.

### Icons

The slate's buttons show pictures instead of words; screen readers still hear their names (Next cell, Previous cell, New line, Front, Back). Each picture shows what the button does, using small slate cells: Next is an arrow from a written cell to a highlighted empty one, Previous an arrow back to a highlighted written cell, and New line a return arrow from a row of cells down to the start of the next. On the back, these mirror along with the slate. Front is a page with raised dots, and Back a page with its corner turned and the same cell as pits, mirrored. The slate's cell also slides in from the direction of travel when moving to another cell or line.

## Slate on the back only (October 2026)

On the front, the slate's cell was laid out as read, and she began entering cells as if it were the slate, which defeats the point of practising mirroring. The slate now appears only on the back of the page. On the front, only the Front / Back buttons are shown; writing there is by keyboard. Slate input therefore always means mirrored input.
