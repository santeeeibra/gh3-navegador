#!/usr/bin/env bash
# Claude 2026-10-16: compila y arma la copia C1 v2 (artifacts/sincronia-rea/c1id/demo).
# = enlace de Codex (tools/sincronia/link-press.sh, base recorte2) cambiando gh3_recomp.2.o (sonda C1) y d2_g1e_input.o (C1 v2).
# Uso (Git Bash): node tools/c1-strum/prepare.mjs && bash tools/c1-strum/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"; A=artifacts/d1-wasm; T=artifacts/sincronia-rea/c1id; P=artifacts/sincronia-rea/pulsacion
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
PB="$ROOT/artifacts/xex-adapt/paso-b"; SDK="$PB/src/rexglue-sdk-090"; GEN="$PB/gh3-variant/generated/variant-dd2ca1ab"
mkdir -p "$T/obj" "$T/web"
# 1) C1 v2 (mismas banderas que build-runtime.sh)
OUT="$ROOT/$T/obj/c1" bash tools/d1-wasm/build-runtime.sh "$ROOT/tools/c1-strum/g1e_input.cpp" > "$T/obj/c1.log"
C1O=$(ls "$T"/obj/c1/*g1e_input.o | head -1); grep -q OK "$T/obj/c1.log" || { cat "$T"/obj/c1/*.err | head -20; exit 1; }
# 2) código recompilado con la sonda C1 (mismas banderas que build-press.sh de Codex)
em++ -std=c++23 -O2 -msimd128 -w -pthread -DREX_PLATFORM_LINUX=1 -DSPDLOG_FMT_EXTERNAL -DREXGLUE_BUILD_CONFIG=\"Release\" \
  -I"$ROOT/tools/c1-strum" -I"$ROOT/tools/sincronia" -I"$ROOT/tools/d1-wasm" -I"$GEN" -I"$ROOT/artifacts/d1-wasm/rtsrc/include" -I"$ROOT/artifacts/d1-wasm/sdkp/include" -I"$PB/build/sdk/include" \
  -I"$SDK/thirdparty/simde" -I"$SDK/thirdparty/fmt/include" -I"$SDK/thirdparty/spdlog/include" \
  -include "$ROOT/tools/d1-wasm/gh3_wasm_prelude.h" -c "$T/src/gh3_recomp.2.cpp" -o "$T/obj/gh3_recomp.2.o" 2> "$T/obj/compile.err" || { tail -20 "$T/obj/compile.err"; exit 1; }
# 3) enlace (igual que link-press.sh)
OBJS=(); for o in "$A"/recorte/obj-simd/*.o "$A"/recorte/view/*.o; do
  if [[ "$o" == */gh3_recomp.2.o ]]; then o="$T/obj/gh3_recomp.2.o"; fi
  if [[ "$o" == */d2_g1e_input.o ]]; then o="$C1O"; fi
  [[ "$o" == */recorte/view/audio_xma_context.o || "$o" == */d2_xma_context_silent.o || "$o" == */recorte/view/core_threading_posix.o ]] || OBJS+=("$o"); done
OBJS+=("$A/recorte2/rt/core_threading_posix.o" "$A/xmalazy/obj/audio_xma_context.o" "$A/pila-1m/extra/zz_pila_hilos.o" "$A/g1c/ffmpeg-build/libavcodec.a" "$A/g1c/ffmpeg-build/libavutil.a")
printf '%s\n' "${OBJS[@]}" | grep -c "c1id" | grep -q 2 || { echo "No se reemplazaron los 2 objetos"; exit 1; }
WRAP=(-Wl,--wrap=pthread_attr_setstacksize -Wl,--wrap=pthread_create)
LINK=(-O0 --profiling-funcs -pthread -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=8 -sDEFAULT_PTHREAD_STACK_SIZE=4MB
  -sSTACK_SIZE=8MB -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB
  -sENVIRONMENT=web,worker -lworkerfs.js -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1
  --pre-js "$ROOT/tools/d1-wasm/songlive_web.js" -sERROR_ON_UNDEFINED_SYMBOLS=0 -Wl,--warn-unresolved-symbols)
em++ "${LINK[@]}" "${WRAP[@]}" "${OBJS[@]}" -o "$T/web/gh3-web.js" 2> "$T/web/link.err" || { tail -5 "$T/web/link.err"; exit 1; }
# 4) demo: enlaces duros de la copia de Codex + lo propio
rm -rf "$T/demo"; mkdir -p "$T/demo"
for f in "$P"/demo/*; do [ -f "$f" ] && cp -l "$f" "$T/demo/"; done
rm -f "$T/demo/press-page.js" "$T/demo/gh3-web.wasm" "$T/demo/gh3-web.js" "$T/demo/gh3-input.js" "$T/demo/index.html"
cp "$T/web/gh3-web.wasm" "$T/demo/gh3-web.wasm"
cp "$T/gh3-input.js" "$T/index.html" "$T/c1-strum-page.js" "$T/demo/"
node tools/c1-strum/merge-js.mjs
echo "Listo: $T/demo"
