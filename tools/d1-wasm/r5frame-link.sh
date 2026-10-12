#!/usr/bin/env bash
# R5F: enlaza el build SEPARADO de la captura de cuadros con los objetos de artifacts/d1-wasm/r5frame/rt-obj
# (copia de rt-obj + r5_frame, g1_null_gpu nuevo y 5 fuentes del SDK). No toca d2/, d4/, rt-obj/ ni r6/.
# Uso: bash tools/d1-wasm/r5frame-link.sh node|web
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; A="$ROOT/artifacts/d1-wasm"; R="${R5F_DIR:-$A/r5frame}"  # R5F_DIR: build aislado (p. ej. artifacts/d1-wasm/r5frame-v2)
TMP="$ROOT/tools/d1-wasm/.r5frame-link-tmp"; mkdir -p "$TMP"  # link.sh calcula ROOT desde su carpeta
case "${1:-}" in
  node) sed "s#\"\$A\"/rt-obj/\*.o#\"$R/rt-obj\"/*.o#" "$ROOT/tools/d1-wasm/link.sh" > "$TMP/l.sh"; OUT="$R/d2" ;;
  web)  sed "s#\"\$A\"/rt-obj/\*.o#\"$R/rt-obj\"/*.o#" "$ROOT/tools/d1-wasm/link-web.sh" > "$TMP/l.sh"; OUT="$R/d4" ;;
  *) echo "uso: r5frame-link.sh node|web"; exit 2 ;;
esac
grep -q "$R/rt-obj" "$TMP/l.sh" || { echo "no se pudo redirigir rt-obj"; exit 1; }
cp "$TMP/l.sh" "$ROOT/tools/d1-wasm/.r5frame-link.sh"; LINK_OUT="$OUT" bash "$ROOT/tools/d1-wasm/.r5frame-link.sh"; rc=$?; rm -f "$ROOT/tools/d1-wasm/.r5frame-link.sh"
rm -rf "$TMP"; exit $rc
