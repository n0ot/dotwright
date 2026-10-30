#!/bin/bash
# Rebuilds src/louis/louis.{mjs,wasm} from a liblouis source release.
# Usage: tools/liblouis/build.sh path/to/liblouis-3.39.0
# Requires Emscripten (brew install emscripten). Skips liblouis's configure
# script: liblouis.h is generated from its template and config.h is checked in.
set -euo pipefail
SRC="$1/liblouis"
TABLES_SRC="$1/tables"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../../src/louis"
WORK="$(mktemp -d)"
sed 's/@WIDECHAR_TYPE@/unsigned short int/' "$SRC/liblouis.h.in" > "$WORK/liblouis.h"
cp "$HERE/config.h" "$WORK/"
mkdir "$WORK/tables"
# en-ueb-g2.ctb and everything it includes
todo="en-ueb-g2.ctb"; seen=""
while [ -n "$todo" ]; do
  set -- $todo; t=$1; shift; todo="$*"
  case " $seen " in *" $t "*) continue;; esac
  seen="$seen $t"
  for i in $(grep -E '^\s*include\s' "$TABLES_SRC/$t" | awk '{print $2}'); do todo="$todo $i"; done
done
for t in $seen; do cp "$TABLES_SRC/$t" "$WORK/tables/"; done
cd "$WORK"
emcc -O2 -I. -I"$SRC" -DTABLESDIR='"/tables"' \
  "$SRC"/{compileTranslationTable,lou_translateString,lou_backTranslateString,commonTranslationFunctions,metadata,pattern,logging,utils}.c \
  --embed-file tables@/tables \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=8MB -sINITIAL_MEMORY=32MB \
  -sEXPORTED_FUNCTIONS=_lou_translate,_lou_backTranslate,_lou_version,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPU16,HEAP32,UTF8ToString,stringToUTF8,lengthBytesUTF8 \
  -o "$OUT/louis.mjs"
echo "Built $OUT/louis.mjs"
