#!/usr/bin/env bash
# Claude 2026-10-16 (pedido Codex, escena PC): build aislado = recorte2 publicado (objetos y enlace iguales) cambiando SOLO
# d2_r5_frame.o por $T/rt (api.resourceHash: XXH3-128 hex del rango completo). Compilar antes:
#   OUT=$T/rt RT_EXTRA_FLAGS="-O3 -msimd128 -msse2 -DR5L_SIN_B6B7" bash tools/d1-wasm/build-runtime.sh $T/tools/d1-wasm/r5_frame.cpp
# Demo = lagtest/demo (enlaces duros) con gh3-web.wasm/js nuevos. gh3-web.js = salida del enlace + mismos parches que la
# publicada (diff recorte2/web → lagtest/demo aplicado con patch).
# Uso: T=artifacts/d1-wasm/rhash bash tools/optim/armar-rhash.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"; A=artifacts/d1-wasm; T=${T:?falta T}
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
mkdir -p "$T/web"
OBJS=(); for o in "$A"/recorte/obj-simd/*.o "$A"/recorte/view/*.o; do
  [[ "$o" == */recorte/view/audio_xma_context.o || "$o" == */d2_xma_context_silent.o || "$o" == */recorte/view/core_threading_posix.o || "$o" == */recorte/view/d2_r5_frame.o ]] || OBJS+=("$o"); done
OBJS+=("$A/recorte2/rt/core_threading_posix.o" "$T/rt/d2_r5_frame.o" "$A/xmalazy/obj/audio_xma_context.o" "$A/pila-1m/extra/zz_pila_hilos.o" "$A/g1c/ffmpeg-build/libavcodec.a" "$A/g1c/ffmpeg-build/libavutil.a")
WRAP=(-Wl,--wrap=pthread_attr_setstacksize -Wl,--wrap=pthread_create)
LINK=(-O0 --profiling-funcs -pthread -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=8 -sDEFAULT_PTHREAD_STACK_SIZE=4MB
  -sSTACK_SIZE=8MB -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB
  -sENVIRONMENT=web,worker -lworkerfs.js -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1
  --pre-js "$ROOT/tools/d1-wasm/songlive_web.js" -sERROR_ON_UNDEFINED_SYMBOLS=0 -Wl,--warn-unresolved-symbols)
em++ "${LINK[@]}" "${WRAP[@]}" "${OBJS[@]}" -o "$T/web/gh3-web.js" 2> "$T/web/link.err" || { tail -5 "$T/web/link.err"; exit 1; }
if [ ! -d "$T/demo" ]; then mkdir -p "$T/demo"; for f in "$A"/lagtest/demo/*; do [ -f "$f" ] && cp -l "$f" "$T/demo/"; done; fi
cp --remove-destination "$T/web/gh3-web.wasm" "$T/demo/gh3-web.wasm"
diff -u "$A/recorte2/web/gh3-web.js" "$A/lagtest/demo/gh3-web.js" > "$T/web/parches.diff" || true
cp "$T/web/gh3-web.js" "$T/web/gh3-web.pub.js"; patch --no-backup-if-mismatch "$T/web/gh3-web.pub.js" < "$T/web/parches.diff"
cp --remove-destination "$T/web/gh3-web.pub.js" "$T/demo/gh3-web.js"
grep -c "r5l_hash128" "$T/demo/gh3-web.js"; md5sum "$A/lagtest/demo/gh3-web.wasm" "$T/demo/gh3-web.wasm" | cut -c1-12
