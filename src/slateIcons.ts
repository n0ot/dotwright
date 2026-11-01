/**
 * Icons for the slate's buttons, drawn as small slate cells so each one shows
 * what the button does: where the stylus goes next, and which cell it lands
 * on (highlighted). They're drawn as read; in Slate mode, style.css mirrors
 * the movement icons along with the slate. The two modes have pictures of a
 * braillewriter and a slate.
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

/**
 * A braillewriter, from the front: a sheet coming out of the top with a raised
 * cell on it, a knob at each end, and the row of keys, three each side of the
 * space bar. It says "six keys write here".
 */
const BRAILLER = svg(
  // The paper, with "f" raised on it.
  '<path d="M13 14V5.5a1.5 1.5 0 0 1 1.5-1.5h11a1.5 1.5 0 0 1 1.5 1.5V14" fill="var(--surface)"/>' +
    '<circle cx="18" cy="8" r="1.4" fill="currentColor" stroke="none"/>' +
    '<circle cx="18" cy="11.5" r="1.4" fill="currentColor" stroke="none"/>' +
    '<circle cx="22" cy="8" r="1.4" fill="currentColor" stroke="none"/>' +
    // The body, sloping in towards the top, and its knobs.
    '<path d="M8 14h24l3 15a3 3 0 0 1-3 3.5H8A3 3 0 0 1 5 29Z" fill="currentColor" fill-opacity="0.1"/>' +
    '<circle cx="5" cy="17" r="2.6" fill="currentColor" stroke="none"/>' +
    '<circle cx="35" cy="17" r="2.6" fill="currentColor" stroke="none"/>' +
    // The keys.
    [9.5, 13.5, 17.5, 22.5, 26.5, 30.5].map((x) => `<circle cx="${x}" cy="24.5" r="1.7" fill="currentColor" stroke="none"/>`).join('') +
    '<path d="M16.5 29h7" stroke-width="2.2"/>',
);

/**
 * A slate: a guide with two rows of cell windows, and a stylus resting across
 * it. It says "punch cells here, one at a time".
 */
const SLATE = svg(
  // The guide, hinged at the left, with two rows of cell windows.
  '<rect x="2" y="16" width="36" height="21" rx="2.5" fill="currentColor" fill-opacity="0.1"/>' +
    '<path d="M7 16v21" stroke-width="1.6"/>' +
    [10.5, 16, 21.5, 27, 32.5]
      .flatMap((x) => [19.5, 28].map((y) => `<rect x="${x}" y="${y}" width="3.4" height="5.6" rx="1.2" fill="var(--surface)" stroke-width="1.5"/>`))
      .join('') +
    // The stylus, leaning in like a pen, its point in a cell: a short, thick handle and a steel point.
    '<path d="M25.2 22.5l4.3-5" stroke-width="1.6"/>' +
    '<path d="M30.3 16.5l5.4-6.3" stroke-width="5.4"/>'
);

export const SLATE_ICONS: Record<string, string> = {
  'slate-next': NEXT,
  'slate-delete': DELETE,
  'slate-newline': NEW_LINE,
  'mode-brailler': BRAILLER,
  'mode-slate': SLATE,
};
