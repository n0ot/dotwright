"""Generates src/fonts/dotwright-braille.woff2: a monospace font that draws
North American Braille ASCII (either letter case) and Unicode braille patterns
as six-dot cells. Raised dots are filled; unraised positions are faint points.

Usage: python tools/make-font.py   (needs: pip install fonttools brotli)
"""
import math
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ASCII = " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)="
LOWER_ALIASES = {"`": "@", "{": "[", "|": "\\", "}": "]", "~": "^"}

UPM, ADVANCE, ASCENT, DESCENT = 1000, 600, 820, 220
COLS = (190, 410)
ROWS = (640, 400, 160)  # dots 1-3 left column top to bottom, 4-6 right
RAISED, FLAT = 78, 22


def circle(pen, cx, cy, r):
    # Eight off-curve points make a closed quadratic circle; clockwise for TrueType.
    k = r / math.cos(math.pi / 8)
    pts = [(round(cx + k * math.cos(-i * math.pi / 4 + math.pi / 8)),
            round(cy + k * math.sin(-i * math.pi / 4 + math.pi / 8))) for i in range(8)]
    pen.qCurveTo(*pts, None)
    pen.closePath()


def cell_glyph(mask):
    pen = TTGlyphPen(None)
    if mask:
        for dot in range(6):
            col, row = divmod(dot, 3)
            circle(pen, COLS[col], ROWS[row], RAISED if mask & (1 << dot) else FLAT)
    return pen.glyph()


glyph_order = [".notdef"] + [f"cell{m:02d}" for m in range(64)]
glyphs = {".notdef": TTGlyphPen(None).glyph()}
for m in range(64):
    glyphs[f"cell{m:02d}"] = cell_glyph(m)

cmap = {}
for m, ch in enumerate(ASCII):
    cmap[ord(ch)] = f"cell{m:02d}"
    if ch.isalpha():
        cmap[ord(ch.lower())] = f"cell{m:02d}"
    cmap[0x2800 + m] = f"cell{m:02d}"
for low, up in LOWER_ALIASES.items():
    cmap[ord(low)] = cmap[ord(up)]
cmap[0xA0] = cmap[0x20]

fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(glyph_order)
fb.setupCharacterMap(cmap)
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics({g: (ADVANCE, 0) for g in glyph_order})
fb.setupHorizontalHeader(ascent=ASCENT, descent=-DESCENT)
fb.setupNameTable({"familyName": "Dotwright Braille", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=ASCENT, sTypoDescender=-DESCENT, usWinAscent=ASCENT,
            usWinDescent=DESCENT)
fb.setupPost(isFixedPitch=1)
fb.font.flavor = "woff2"
out = Path(__file__).resolve().parent.parent / "src/fonts/dotwright-braille.woff2"
fb.save(out)
print("wrote", out)
