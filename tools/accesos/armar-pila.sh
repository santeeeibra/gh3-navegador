#!/usr/bin/env bash
# Claude 2026-10-15 (paso 4, memoria iPhone): build aislado con tope de pila por hilo (tools/accesos/pila_hilos.c, --wrap).
# Base = xmalazy-pub (mismos objetos/opciones que armar-memdiag.sh con XMALAZY=1 DIAG=0) y página = memtex/demo.
#   PILA=bytes (0 = sin tope)   PILADIAG=1: pinta pilas y escribe «PILA ...» en el registro (NO sirve para medir memoria).
# Uso: T=artifacts/d1-wasm/pila-1m PILA=1048576 bash tools/accesos/armar-pila.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"; A=artifacts/d1-wasm; T=${T:?falta T}; PILA=${PILA:-0}; PILADIAG=${PILADIAG:-0}
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
mkdir -p "$T/web" "$T/extra"
emcc -O2 -pthread -DPILA_MAX="$PILA" -DPILA_DIAG="$PILADIAG" -c tools/accesos/pila_hilos.c -o "$T/extra/zz_pila_hilos.o"
OBJS=(); for o in "$A"/recorte/obj-simd/*.o "$A"/recorte/view/*.o; do
  [[ "$o" == */recorte/view/audio_xma_context.o || "$o" == */d2_xma_context_silent.o ]] || OBJS+=("$o"); done
OBJS+=("$A/xmalazy/obj/audio_xma_context.o" "$T/extra/zz_pila_hilos.o" "$A/g1c/ffmpeg-build/libavcodec.a" "$A/g1c/ffmpeg-build/libavutil.a")
WRAP=(-Wl,--wrap=pthread_attr_setstacksize -Wl,--wrap=pthread_create)
LINK=(-O0 --profiling-funcs -pthread -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=8 -sDEFAULT_PTHREAD_STACK_SIZE=4MB
  -sSTACK_SIZE=8MB -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB
  -sENVIRONMENT=web,worker -lworkerfs.js -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1
  --pre-js "$ROOT/tools/d1-wasm/songlive_web.js" -sERROR_ON_UNDEFINED_SYMBOLS=0 -Wl,--warn-unresolved-symbols)
em++ "${LINK[@]}" "${WRAP[@]}" "${OBJS[@]}" -o "$T/web/gh3-web.js" 2> "$T/web/link.err" || { tail -5 "$T/web/link.err"; exit 1; }
if [ ! -d "$T/demo" ]; then mkdir -p "$T/demo"; for f in "$A"/memtex/demo/*; do [ -f "$f" ] && cp -l "$f" "$T/demo/"; done; fi
cp --remove-destination "$T/web/gh3-web.wasm" "$T/demo/gh3-web.wasm"
node -e "
const fs=require('fs'),A='$A';
let js=fs.readFileSync(A+'/xmalazy-pub/demo/gh3-web.js','utf8');
const o=fs.readFileSync(A+'/xmalazy-pub/web/gh3-web.js','utf8').split('\n'),n=fs.readFileSync('$T/web/gh3-web.js','utf8').split('\n');
if(o.length!==n.length)throw new Error('cantidad de líneas distinta '+o.length+' '+n.length);
let c=0;for(let i=0;i<o.length;i++)if(o[i]!==n[i]){if(!/^  \d+: /.test(o[i]))throw new Error('línea no ASM_CONSTS '+i+': '+o[i].slice(0,80)+' | '+n[i].slice(0,80));if(js.split(o[i]).length!==2)throw new Error('ambigua '+i);js=js.replace(o[i],n[i]);c++;}
fs.writeFileSync('$T/demo/gh3-web.js.new',js);console.log('ASM_CONSTS cambiadas',c);"
cp --remove-destination "$T/demo/gh3-web.js.new" "$T/demo/gh3-web.js"; rm -f -- "$T/demo/gh3-web.js.new"
md5sum "$A/xmalazy-pub/demo/gh3-web.wasm" "$T/demo/gh3-web.wasm" | cut -c1-12
