#!/usr/bin/env bash
# Canción + R5L vivo (Claude, 2026-10-11, pedido de Codex): build web AISLADO artifacts/d1-wasm/songlive/.
# Objetos = los de la página actual de la canción (song-sync/pacing/rt-obj: audio R6 + ritmo, C1, g1_seg_table,
# g1e_plan_clear; + r6/obj-simd) con el productor R5L de r5live/rt-obj (r5_frame, g1_null_gpu actual y sus
# dependencias). Todo se copia/lee; no se recompila ni se toca ningún otro build.
# Pre-js tools/d1-wasm/songlive_web.js (r6_web.js + parámetros r5frame/r5live*).
# Salida: songlive/web/gh3-web.{js,wasm} y la página songlive/song (song-build con salida aparte; la página
# reenvía además r5frame/r5framemax/r5live/r5liveconsumer/r5livemax al Worker). NO publicar.
# Uso: bash tools/d1-wasm/songlive-link.sh
# Variantes aisladas: SONGLIVE_DIR=<carpeta en artifacts/d1-wasm> (default songlive) y SONGLIVE_EXTRA=<carpeta con .o que
# reemplazan a los de la vista; p. ej. artifacts/d1-wasm/r5opt/rt-obj).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; A="$ROOT/artifacts/d1-wasm"; S="$A/${SONGLIVE_DIR:-songlive}"
VIEW="$S/rt-obj-view"; rm -rf "$VIEW"; mkdir -p "$VIEW"
cp "$ROOT"/artifacts/song-sync/pacing/rt-obj/*.o "$VIEW/"
for o in d2_r5_frame d2_g1_null_gpu graphics_pipeline_shader_translator graphics_pipeline_shader_translator_disasm graphics_pipeline_texture_util graphics_util_draw ui_graphics_util; do
  cp "$A/r5live/rt-obj/$o.o" "$VIEW/"
done
TMP="$(mktemp -d)"
sed -e "s#\"\$A\"/rt-obj/\*.o#\"$VIEW\"/*.o#" -e "s#\"\$ROOT/tools/d1-wasm/d4_web.js\"#\"\$ROOT/tools/d1-wasm/songlive_web.js\"#" "$ROOT/tools/d1-wasm/link-web.sh" > "$TMP/l.sh"
grep -q "$VIEW" "$TMP/l.sh" && grep -q "songlive_web.js" "$TMP/l.sh" || { echo "no se pudo redirigir objetos/pre-js"; exit 1; }
[ -z "${SONGLIVE_EXTRA:-}" ] || cp "$ROOT/$SONGLIVE_EXTRA"/*.o "$VIEW/"
cp "$TMP/l.sh" "$ROOT/tools/d1-wasm/.songlive-link-tmp.sh"; rm -rf "$TMP"
set +e; OBJDIR=r6/obj-simd LINK_OUT="$S/web" bash "$ROOT/tools/d1-wasm/.songlive-link-tmp.sh"; rc=$?; set -e
rm -f "$ROOT/tools/d1-wasm/.songlive-link-tmp.sh"; [ $rc -eq 0 ] || exit $rc
[ ! -s "$S/web/undefined.txt" ] || { echo "símbolos sin definir:"; cat "$S/web/undefined.txt"; exit 1; }
R6_SONG_WEB="${S#$ROOT/}/web" R6_SONG_OUT="${S#$ROOT/}/song" node "$ROOT/tools/d1-wasm/song-build.mjs" > /dev/null
P="$S/song/index.html"
sed -i "s/\['waitmulti', 'audiotap', 'padtype',/['waitmulti', 'audiotap', 'padtype', 'r5frame', 'r5framemax', 'r5live', 'r5liveconsumer', 'r5livemax', 'r5optcheck', 'r5lite', 'r5livevs',/" "$P"
grep -q "'r5liveconsumer'" "$P" || { echo "la página no reenvía r5live"; exit 1; }
cmp -s "$S/song/gh3-web.wasm" "$S/web/gh3-web.wasm" || { echo "wasm de la página distinto"; exit 1; }
sha256sum "$S/web/gh3-web.wasm" "$S/web/gh3-web.js" | sed "s#$ROOT/##" | tee "$S/WASM-SHA256.txt"
