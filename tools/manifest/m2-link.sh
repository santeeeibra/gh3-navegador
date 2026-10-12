#!/usr/bin/env bash
# Manifiesto paso 2 (Claude): enlaza el build AISLADO artifacts/d1-wasm/manifest2/web.
# Objetos = mismos que la página actual de la canción (song-sync/pacing/rt-obj + r6/obj-simd, solo lectura)
#         + dependencias de r5_frame que g1_null_gpu actual necesita (r5live/rt-obj, solo lectura)
#         + manifest2/rt-obj (g1_null_gpu, xboxkrnl_io y m2_manifest con el registro G1_M2).
# Pre-js: copia de r6_web.js que además pasa ?m2= y ?m2win=. No toca ningún otro build.
# Uso: bash tools/manifest/m2-link.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; A="$ROOT/artifacts/d1-wasm"; M="$A/manifest2"
VIEW="$M/rt-obj-view"; rm -rf "$VIEW"; mkdir -p "$VIEW"
cp "$ROOT"/artifacts/song-sync/pacing/rt-obj/*.o "$VIEW/"
for o in d2_r5_frame graphics_pipeline_shader_translator graphics_pipeline_shader_translator_disasm graphics_pipeline_texture_util graphics_util_draw ui_graphics_util; do
  cp "$A/r5live/rt-obj/$o.o" "$VIEW/"
done
cp "$M"/rt-obj/*.o "$VIEW/"
# Pre-js: r6_web.js + parámetros m2/m2win (solo agrega entradas a la lista de parámetros).
sed "s#\['padtype', 'G1_PADTYPE'\]#['padtype', 'G1_PADTYPE'], ['m2', 'G1_M2'], ['m2win', 'G1_M2_WIN']#" "$ROOT/tools/d1-wasm/r6_web.js" > "$M/m2_web.js"
grep -q "G1_M2_WIN" "$M/m2_web.js" || { echo "no se pudo agregar m2 al pre-js"; exit 1; }
TMP="$(mktemp -d)"
sed -e "s#\"\$A\"/rt-obj/\*.o#\"$VIEW\"/*.o#" -e "s#\"\$ROOT/tools/d1-wasm/d4_web.js\"#\"$M/m2_web.js\"#" "$ROOT/tools/d1-wasm/link-web.sh" > "$TMP/l.sh"
grep -q "$VIEW" "$TMP/l.sh" && grep -q "m2_web.js" "$TMP/l.sh" || { echo "no se pudo redirigir objetos/pre-js"; exit 1; }
cp "$TMP/l.sh" "$ROOT/tools/d1-wasm/.m2-link-tmp.sh"; rm -rf "$TMP"
set +e; OBJDIR=r6/obj-simd LINK_OUT="$M/web" bash "$ROOT/tools/d1-wasm/.m2-link-tmp.sh"; rc=$?; set -e
rm -f "$ROOT/tools/d1-wasm/.m2-link-tmp.sh"; exit $rc
