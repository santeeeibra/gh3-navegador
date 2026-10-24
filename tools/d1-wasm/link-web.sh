#!/usr/bin/env bash
# Paso D4: enlaza los mismos objetos de D2/D3 para el navegador. El programa entero corre dentro de un
# Worker (gh3-web.js es el script del Worker), así WORKERFS puede leer los archivos elegidos en la página.
# Salida: artifacts/d1-wasm/d4/gh3-web.{js,wasm}. NO publicar: es código del juego.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
A="$ROOT/artifacts/d1-wasm"; OUT="${LINK_OUT:-$A/d4}"; mkdir -p "$OUT"
OBJS=("$A"/${OBJDIR:-obj}/*.o "$A"/rt-obj/*.o)
FILTERED=(); for obj in "${OBJS[@]}"; do [[ "$obj" == */d2_xma_context_silent.o ]] || FILTERED+=("$obj"); done
OBJS=("${FILTERED[@]}" "$A/g1c/ffmpeg-build/libavcodec.a" "$A/g1c/ffmpeg-build/libavutil.a")
LINK=(-O0 --profiling-funcs -pthread -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=8 -sDEFAULT_PTHREAD_STACK_SIZE=4MB
  -sSTACK_SIZE=8MB -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB
  -sENVIRONMENT=web,worker -lworkerfs.js -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1
  --pre-js "$ROOT/tools/d1-wasm/d4_web.js"
  -sERROR_ON_UNDEFINED_SYMBOLS=0 -Wl,--warn-unresolved-symbols)
t0=$(date +%s)
em++ "${LINK[@]}" "${OBJS[@]}" -o "$OUT/gh3-web.js" 2> "$OUT/link.err"
rc=$?
echo "link rc=$rc en $(( $(date +%s) - t0 )) s"
grep -o "undefined symbol: [^ ]*" "$OUT/link.err" | sed 's/undefined symbol: //' | sort -u > "$OUT/undefined.txt"
echo "simbolos sin definir: $(wc -l < "$OUT/undefined.txt")"
grep -i "error" "$OUT/link.err" | grep -v "undefined symbol" | head -20
ls -la "$OUT"/gh3-web.*
