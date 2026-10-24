#!/usr/bin/env bash
# Firma de menú G1e por archivos: rutas [g1-file] desde gh.png (1er START) en orden, sin repetidos seguidos.
# Uso: bash tools/d1-wasm/r5frame-sig.sh <log>
awk '/\[g1-file\]/{ if ($0 ~ /gh\.png/) on=1; if (on) { sub(/.*path=/,""); sub(/ status.*/,""); print } }' "$1" | uniq | head -40
