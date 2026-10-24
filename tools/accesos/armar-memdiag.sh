#!/usr/bin/env bash
# Claude 2026-10-15 (paso 4, memoria iPhone): build de DIAGNÓSTICO artifacts/d1-wasm/memdiag = recorte (publicado) + big_alloc_log.c
# (anota reservas >= 256 KB). Mismos objetos y opciones que tools/optim/link-memlazy.sh + --wrap. No publicar.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"; A=artifacts/d1-wasm; T=${T:-$A/memdiag}
# DIAG=0: sin registro de reservas.  XMALAZY=1: audio_xma_context.o de artifacts/d1-wasm/xmalazy/obj (decodificador XMA perezoso, paso 4).
DIAG=${DIAG:-1}; XMALAZY=${XMALAZY:-0}
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
mkdir -p "$T/web" "$T/extra"
emcc -O2 -pthread -c tools/accesos/big_alloc_log.c -o "$T/extra/zz_big_alloc_log.o"
OBJS=("$A"/recorte/obj-simd/*.o "$A"/recorte/view/*.o)
[ "$DIAG" = 1 ] && OBJS+=("$T/extra/zz_big_alloc_log.o")
if [ "$XMALAZY" = 1 ]; then F=(); for o in "${OBJS[@]}"; do [[ "$o" == */recorte/view/audio_xma_context.o ]] || F+=("$o"); done; OBJS=("${F[@]}" "$A/xmalazy/obj/audio_xma_context.o"); fi
FILTERED=(); for obj in "${OBJS[@]}"; do [[ "$obj" == */d2_xma_context_silent.o ]] || FILTERED+=("$obj"); done
OBJS=("${FILTERED[@]}" "$A/g1c/ffmpeg-build/libavcodec.a" "$A/g1c/ffmpeg-build/libavutil.a")
WRAP=(-Wl,--wrap=malloc -Wl,--wrap=calloc -Wl,--wrap=aligned_alloc -Wl,--wrap=memalign -Wl,--wrap=posix_memalign)
LINK=(-O0 --profiling-funcs -pthread -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=8 -sDEFAULT_PTHREAD_STACK_SIZE=4MB
  -sSTACK_SIZE=8MB -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB
  -sENVIRONMENT=web,worker -lworkerfs.js -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1
  --pre-js "$ROOT/tools/d1-wasm/songlive_web.js" -sERROR_ON_UNDEFINED_SYMBOLS=0 -Wl,--warn-unresolved-symbols)
[ "$DIAG" = 1 ] || WRAP=()
em++ "${LINK[@]}" "${WRAP[@]}" "${OBJS[@]}" -o "$T/web/gh3-web.js" 2> "$T/web/link.err" || { tail -5 "$T/web/link.err"; exit 1; }
[ -d "$T/demo" ] || cp -al "$A/recorte-pub/demo" "$T/demo"
cp --remove-destination "$T/web/gh3-web.wasm" "$T/demo/gh3-web.wasm"
node -e "
const fs=require('fs'),A='$A';
let js=fs.readFileSync(A+'/recorte-pub/demo/gh3-web.js','utf8');
const o=fs.readFileSync(A+'/recorte/web/gh3-web.js','utf8').split('\n'),n=fs.readFileSync('$T/web/gh3-web.js','utf8').split('\n');
if(o.length!==n.length)throw new Error('cantidad de líneas distinta '+o.length+' '+n.length);
let c=0;for(let i=0;i<o.length;i++)if(o[i]!==n[i]){if(!/^  \d+: /.test(o[i]))throw new Error('línea no ASM_CONSTS '+i+': '+o[i].slice(0,80)+' | '+n[i].slice(0,80));if(js.split(o[i]).length!==2)throw new Error('ambigua '+i);js=js.replace(o[i],n[i]);c++;}
fs.writeFileSync('$T/demo/gh3-web.js.new',js);console.log('ASM_CONSTS cambiadas',c);"
cp --remove-destination "$T/demo/gh3-web.js.new" "$T/demo/gh3-web.js"; rm -f -- "$T/demo/gh3-web.js.new"
md5sum "$A/recorte-pub/demo/gh3-web.wasm" "$T/demo/gh3-web.wasm" | cut -c1-12
