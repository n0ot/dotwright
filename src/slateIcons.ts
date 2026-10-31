/**
 * Icons for the slate's buttons, drawn as small slate cells so each one shows
 * what the button does: where the stylus goes next, and which cell it lands
 * on (highlighted). They're drawn as on the front of the page; on the back,
 * style.css mirrors the movement icons along with the slate.
 *
 * The icons are decorative: each button has its own accessible name.
 */

type Look = 'done' | 'target' | 'faint';

/** A cell window with dots, `w` by `h` with its top left at `x`, `y`. */
function cell(x: number, y: number, w: number, h: number, dots: number[], look: Look): string {
  const r = w / 6.5;
  const col = [x + w * 0.32, x + w * 0.68];
  const row = [y + h * 0.25, y + h * 0.5, y + h * 0.75];
  const window = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 4}" ${
    look === 'target' ? 'fill="currentColor" fill-opacity="0.2"' : ''
  }/>`;
  const marks = [1, 2, 3, 4, 5, 6]
    .map((d) => {
      const cx = col[d > 3 ? 1 : 0];
      const cy = row[(d - 1) % 3];
      return dots.includes(d)
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`
        : look === 'target'
          ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.4}" fill="currentColor" stroke="none" opacity="0.5"/>`
          : '';
    })
    .join('');
  const opacity = look === 'done' ? 0.5 : look === 'faint' ? 0.35 : 1;
  return `<g opacity="${opacity}">${window}${marks}</g>`;
}

const svg = (body: string) =>
  `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** Writing the cell and moving on: the written cell, and the empty one the stylus moves to. */
const NEXT = svg(
  cell(1, 7, 13, 26, [1, 2, 4], 'done') + cell(26, 7, 13, 26, [], 'target') + '<path d="M16 20h7.5m-4-4 4 4-4 4"/>',
);

/** The delete symbol from a phone keyboard: a tag pointing back, with a cross. */
const DELETE = svg(
  '<path d="M14 9h20a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H14L4 20Z"/>' + '<path d="M20 15.5l9 9m0-9-9 9"/>',
);

const NEW_LINE = svg(
  cell(1, 2, 9, 15, [1, 4, 5], 'done') +
    cell(12, 2, 9, 15, [1, 2], 'done') +
    cell(23, 2, 9, 15, [2, 4], 'done') +
    cell(1, 23, 9, 15, [], 'target') +
    '<path d="M36.5 4v20.5a6 6 0 0 1-6 6H14m4-4-4 4 4 4"/>',
);

/** A sheet of paper; the back has its top corner turned over. */
const PAGE_FRONT = '<rect x="7" y="2" width="26" height="36" rx="3" fill="currentColor" fill-opacity="0.07"/>';
const PAGE_BACK =
  '<path d="M7 5a3 3 0 0 1 3-3h14l9 9v24a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3Z" fill="currentColor" fill-opacity="0.07"/>' +
  '<path d="M24 2v6a3 3 0 0 0 3 3h6" fill="currentColor" fill-opacity="0.25"/>';

/**
 * One cell, "f" (dots 1-2-4), which looks different mirrored: as read on the
 * front, and as punched on the back.
 */
function dotPositions(mirrored: boolean): [number, number][] {
  return [1, 2, 4].map((d) => {
    const left = d <= 3 !== mirrored;
    return [left ? 15.5 : 24.5, 15 + ((d - 1) % 3) * 8];
  });
}

/** A raised dot, lit from the top left. */
const bump = ([x, y]: [number, number]) =>
  `<circle cx="${x}" cy="${y}" r="3.2" fill="currentColor" stroke="none"/>` +
  `<circle cx="${x - 1}" cy="${y - 1.1}" r="1.1" fill="var(--surface)" stroke="none" opacity="0.75"/>`;

/** A dot pressed in: a hollow, in shadow under its top edge. */
const pit = ([x, y]: [number, number]) =>
  `<circle cx="${x}" cy="${y}" r="3.2" fill="currentColor" fill-opacity="0.2" stroke="none"/>` +
  `<path d="M${x - 3.2} ${y}a3.2 3.2 0 0 1 6.4 0a3.2 1.8 0 0 0-6.4 0Z" fill="currentColor" fill-opacity="0.8" stroke="none"/>`;

const FRONT = svg(PAGE_FRONT + dotPositions(false).map(bump).join(''));
const BACK = svg(PAGE_BACK + dotPositions(true).map(pit).join(''));

export const SLATE_ICONS: Record<string, string> = {
  'slate-next': NEXT,
  'slate-delete': DELETE,
  'slate-newline': NEW_LINE,
  'side-front': FRONT,
  'side-back': BACK,
};
