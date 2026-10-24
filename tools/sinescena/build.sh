#!/usr/bin/env bash
# Claude 2026-10-17: copia aislada artifacts/d1-wasm/sinescena/demo = c1strum-pub/demo + productor R5L que no arma los draws
# del escenario (VS fuera de la lista del dibujador «muy»). Sólo cambia d2_r5_frame.o (fuente tools/sinescena/r5_frame.cpp)
# e index.html (pasa r5livevs). Uso (Git Bash): bash tools/sinescena/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"; A=artifacts/d1-wasm; T=$A/sinescena; BASE=$A/c1strum-pub
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
rm -rf "$T/obj"; OUT="$ROOT/$T/obj" RT_EXTRA_FLAGS="-O3 -msimd128 -msse2 -DR5L_SIN_B6B7" bash tools/d1-wasm/build-runtime.sh "$ROOT/tools/sinescena/r5_frame.cpp" | grep -q OK
R5O=$(ls "$T"/obj/*r5_frame.o)
C1O=$(ls "$BASE"/obj/c1/*g1e_input.o | head -1)
OBJS=(); for o in "$A"/recorte/obj-simd/*.o "$A"/recorte/view/*.o; do
  if [[ "$o" == */gh3_recomp.2.o ]]; then o="$BASE/obj/gh3_recomp.2.o"; fi
  if [[ "$o" == */d2_g1e_input.o ]]; then o="$C1O"; fi
  if [[ "$o" == */d2_r5_frame.o ]]; then o="$R5O"; fi
  [[ "$o" == */recorte/view/audio_xma_context.o || "$o" == */d2_xma_context_silent.o || "$o" == */recorte/view/core_threading_posix.o ]] || OBJS+=("$o"); done
OBJS+=("$A/recorte2/rt/core_threading_posix.o" "$A/xmalazy/obj/audio_xma_context.o" "$A/pila-1m/extra/zz_pila_hilos.o" "$A/g1c/ffmpeg-build/libavcodec.a" "$A/g1c/ffmpeg-build/libavutil.a")
printf '%s\n' "${OBJS[@]}" | grep -c "sinescena" | grep -q 1 || { echo "No se reemplazó r5_frame"; exit 1; }
WRAP=(-Wl,--wrap=pthread_attr_setstacksize -Wl,--wrap=pthread_create)
LINK=(-O0 --profiling-funcs -pthread -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=8 -sDEFAULT_PTHREAD_STACK_SIZE=4MB
  -sSTACK_SIZE=8MB -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB
  -sENVIRONMENT=web,worker -lworkerfs.js -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1
  --pre-js "$ROOT/tools/d1-wasm/songlive_web.js" -sERROR_ON_UNDEFINED_SYMBOLS=0 -Wl,--warn-unresolved-symbols)
mkdir -p "$T/web"; em++ "${LINK[@]}" "${WRAP[@]}" "${OBJS[@]}" -o "$T/web/gh3-web.js" 2> "$T/web/link.err" || { tail -5 "$T/web/link.err"; exit 1; }
# Mismo armado de JS que c1strum-pub (constantes publicadas conservadas, claves remapeadas).
C1_WEB="$T/web/" C1_TARGET="$T/web/gh3-web.merged.js" node tools/c1-strum/merge-js.mjs
rm -rf "$T/demo"; mkdir -p "$T/demo"
for f in "$BASE"/demo/*; do [ -f "$f" ] && cp -l "$f" "$T/demo/"; done
rm -f "$T/demo/gh3-web.wasm" "$T/demo/gh3-web.js" "$T/demo/index.html"
cp "$T/web/gh3-web.merged.js" "$T/demo/gh3-web.js"
cp "$T/web/gh3-web.wasm" "$T/demo/gh3-web.wasm"
node tools/sinescena/prepare-html.mjs "$BASE/demo/index.html" "$T/demo/index.html"
echo "Listo: $T/demo"
