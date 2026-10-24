#!/usr/bin/env bash
# R6 (Claude): enlaza igual que link.sh (Node) o link-web.sh (navegador), pero con el audio de
# artifacts/d1-wasm/r6/rt-obj en lugar del de rt-obj. No toca d2/ ni d4/ (los usa Codex).
# Uso: bash tools/d1-wasm/r6-link.sh node|web   -> artifacts/d1-wasm/r6/{d2,web}
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; A="$ROOT/artifacts/d1-wasm"
VIEW="$A/r6/rt-obj-view"; rm -rf "$VIEW"; mkdir -p "$VIEW"
for o in "$A"/rt-obj/*.o; do [ -f "$A/r6/rt-obj/$(basename "$o")" ] || cp "$o" "$VIEW/"; done
cp "$A"/r6/rt-obj/*.o "$VIEW/"
TMP="$(mktemp -d)"
case "${1:-node}" in
  node) sed "s#\"\$A\"/rt-obj/\*.o#\"$VIEW\"/*.o#" "$ROOT/tools/d1-wasm/link.sh" > "$TMP/l.sh"; LINK_OUT="$A/r6/d2" ;;
  web)  sed -e "s#\"\$A\"/rt-obj/\*.o#\"$VIEW\"/*.o#" -e "s#tools/d1-wasm/d4_web.js#tools/d1-wasm/r6_web.js#" "$ROOT/tools/d1-wasm/link-web.sh" > "$TMP/l.sh"; LINK_OUT="$A/r6/web${R6_SUFFIX:-}" ;;
esac
grep -q "$VIEW" "$TMP/l.sh" || { echo "no se pudo redirigir rt-obj"; exit 1; }
cp "$TMP/l.sh" "$ROOT/tools/d1-wasm/.r6-link-tmp.sh"
LINK_OUT="$LINK_OUT" bash "$ROOT/tools/d1-wasm/.r6-link-tmp.sh"; rc=$?
rm -f "$ROOT/tools/d1-wasm/.r6-link-tmp.sh"; rm -rf "$TMP"; exit $rc
