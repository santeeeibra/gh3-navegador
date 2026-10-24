#!/usr/bin/env bash
# Claude 2026-10-16 (recorte2 CPU): build aislado sobre la publicada pila-1m (mismos objetos/enlace que armar-pila.sh con
# PILA=1048576) cambiando SOLO core_threading_posix.o por $T/rt (compilado con
#   OUT=$T/rt RT_EXTRA_FLAGS="-O3 -msimd128 -msse2 -DG1D_OFF" bash tools/d1-wasm/build-runtime.sh rtsrc/.../threading_posix.cpp).
# Demo = pila-1m/demo (enlaces duros) con gh3-web.wasm/js nuevos (ASM_CONSTS ajustadas).
# Uso: T=artifacts/d1-wasm/recorte2 bash tools/optim/armar-recorte2.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"; A=artifacts/d1-wasm; T=${T:?falta T}
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
mkdir -p "$T/web"
OBJS=(); for o in "$A"/recorte/obj-simd/*.o "$A"/recorte/view/*.o; do
  if [[ "$o" == */gh3_recomp.2.o ]]; then o="$T/obj/gh3_recomp.2.o"; fi
  [[ "$o" == */recorte/view/audio_xma_context.o || "$o" == */d2_xma_context_silent.o || "$o" == */recorte/view/core_threading_posix.o ]] || OBJS+=("$o"); done
OBJS+=("$A/recorte2/rt/core_threading_posix.o" "$A/xmalazy/obj/audio_xma_context.o" "$A/pila-1m/extra/zz_pila_hilos.o" "$A/g1c/ffmpeg-build/libavcodec.a" "$A/g1c/ffmpeg-build/libavutil.a")
WRAP=(-Wl,--wrap=pthread_attr_setstacksize -Wl,--wrap=pthread_create)
LINK=(-O0 --profiling-funcs -pthread -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=8 -sDEFAULT_PTHREAD_STACK_SIZE=4MB
  -sSTACK_SIZE=8MB -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB
  -sENVIRONMENT=web,worker -lworkerfs.js -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1
  --pre-js "$ROOT/tools/d1-wasm/songlive_web.js" -sERROR_ON_UNDEFINED_SYMBOLS=0 -Wl,--warn-unresolved-symbols)
em++ "${LINK[@]}" "${WRAP[@]}" "${OBJS[@]}" -o "$T/web/gh3-web.js" 2> "$T/web/link.err" || { tail -5 "$T/web/link.err"; exit 1; }
if [ ! -d "$T/demo" ]; then mkdir -p "$T/demo"; for f in "$A"/lagtest/demo/*; do [ -f "$f" ] && cp -l "$f" "$T/demo/"; done; fi
cp --remove-destination "$T/web/gh3-web.wasm" "$T/demo/gh3-web.wasm"
echo "Enlace preparado para merge verificado de JS"
