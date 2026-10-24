#!/usr/bin/env bash
# Claude 2026-10-17: copia de DIAGNÓSTICO artifacts/d1-wasm/pasadas (no publicable) = sinescena + gh3_recomp.18 con pasadas salteables + r5_frame con [pas].
# del escenario (VS fuera de la lista del dibujador «muy»). Sólo cambia d2_r5_frame.o (fuente tools/pasadas/r5_frame.cpp)
# e index.html (pasa r5livevs). Uso (Git Bash): bash tools/sinescena/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"; A=artifacts/d1-wasm; T=$A/pasadas; BASE=$A/c1strum-pub; SE=$A/sinescena
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
mkdir -p "$T/obj"; rm -rf "$T/obj/rt"; OUT="$ROOT/$T/obj/rt" RT_EXTRA_FLAGS="-O3 -msimd128 -msse2 -DR5L_SIN_B6B7" bash tools/d1-wasm/build-runtime.sh "$ROOT/tools/pasadas/r5_frame.cpp" | grep -q OK
PB="$ROOT/artifacts/xex-adapt/paso-b"; SDK="$PB/src/rexglue-sdk-090"; GEN="$PB/gh3-variant/generated/variant-dd2ca1ab"
em++ -std=c++23 -O2 -msimd128 -w -pthread -DREX_PLATFORM_LINUX=1 -DSPDLOG_FMT_EXTERNAL -DREXGLUE_BUILD_CONFIG=\"Release\"   -I"$ROOT/tools/pasadas" -I"$ROOT/tools/d1-wasm" -I"$GEN" -I"$ROOT/artifacts/d1-wasm/rtsrc/include" -I"$ROOT/artifacts/d1-wasm/sdkp/include" -I"$PB/build/sdk/include"   -I"$SDK/thirdparty/simde" -I"$SDK/thirdparty/fmt/include" -I"$SDK/thirdparty/spdlog/include"   -DPAS_K0=${PAS_K0:-0} "-DPAS_NO={${PAS_NO:--1}}" -include "$ROOT/tools/d1-wasm/gh3_wasm_prelude.h" -c "$T/src/gh3_recomp.18.cpp" -o "$T/obj/gh3_recomp.18.o" 2> "$T/obj/compile.err" || { tail -20 "$T/obj/compile.err"; exit 1; }
R5O=$(ls "$T"/obj/rt/*r5_frame.o); G18="$T/obj/gh3_recomp.18.o"
C1O=$(ls "$BASE"/obj/c1/*g1e_input.o | head -1)
OBJS=(); for o in "$A"/recorte/obj-simd/*.o "$A"/recorte/view/*.o; do
  if [[ "$o" == */gh3_recomp.2.o ]]; then o="$BASE/obj/gh3_recomp.2.o"; fi
  if [[ "$o" == */d2_g1e_input.o ]]; then o="$C1O"; fi
  if [[ "$o" == */d2_r5_frame.o ]]; then o="$R5O"; fi
  if [[ "$o" == */gh3_recomp.18.o ]]; then o="$G18"; fi
  [[ "$o" == */recorte/view/audio_xma_context.o || "$o" == */d2_xma_context_silent.o || "$o" == */recorte/view/core_threading_posix.o ]] || OBJS+=("$o"); done
OBJS+=("$A/recorte2/rt/core_threading_posix.o" "$A/xmalazy/obj/audio_xma_context.o" "$A/pila-1m/extra/zz_pila_hilos.o" "$A/g1c/ffmpeg-build/libavcodec.a" "$A/g1c/ffmpeg-build/libavutil.a")
printf '%s\n' "${OBJS[@]}" | grep -c "pasadas" | grep -q 2 || { echo "No se reemplazó r5_frame"; exit 1; }
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
cp "$SE/demo/index.html" "$T/demo/index.html"
echo "Listo: $T/demo"
