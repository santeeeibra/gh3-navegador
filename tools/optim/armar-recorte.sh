#!/usr/bin/env bash
# Claude 2026-10-15 (recorte CPU): build aislado artifacts/d1-wasm/recorte sobre la base publicada (prod-barato: objetos
# optim/b3/obj-simd + vista prod-barato/view, wasm ed90bec0…). Cambios, cada uno opcional por variable:
#   REPARTO=1  (DESCARTADO: el robot erra y el reloj de la canción se atrasa) gh3_recomp.5 con descanso en el bucle de reparto de tareas (tools/optim/patch-reparto.py, ya compilado en recorte/obj1)
#   FENCE=1    gh3_recomp.35 con descanso de 250 µs en la espera de cerca de GPU sub_824D0070 (patch-spins.py loc_824D00F8, en recorte/obj1)
#   ESPERAS=1  (DESCARTADO: sin mejora medida, futex_wake igual) core_threading_posix (rtsrc, -DG1D_OFF, en recorte/rt-esperas-descartado): WaitMultiple despierta sólo si hay quien duerma y sin hora si no hay plazo
#   FMA=1      fma/fmaf rápidas (tools/optim/fma_rapida.c) en vez de la de la biblioteca
# Arma recorte/demo = autopista60-pub/demo (enlaces duros) con gh3-web.wasm/js nuevos (ASM_CONSTS ajustadas como prod-barato/rearmar.sh).
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"; A=artifacts/d1-wasm; T=$A/recorte
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
rm -rf "$T/obj-simd" "$T/view"; mkdir -p "$T/obj-simd" "$T/view" "$T/web"
cp -l "$A"/optim/b3/obj-simd/*.o "$T/obj-simd/"; cp -l "$A"/prod-barato/view/*.o "$T/view/"
if [ "${REPARTO:-0}" = 1 ]; then rm -f "$T/obj-simd/gh3_recomp.5.o"; cp "$T/obj1/gh3_recomp.5.o" "$T/obj-simd/"; fi
if [ "${FENCE:-1}" = 1 ]; then rm -f "$T/obj-simd/gh3_recomp.35.o"; cp "$T/obj1/gh3_recomp.35.o" "$T/obj-simd/"; fi
if [ "${ESPERAS:-0}" = 1 ]; then rm -f "$T/view/core_threading_posix.o"; cp "$T/rt-b/core_threading_posix.o" "$T/view/"; fi
if [ "${FMA:-1}" = 1 ]; then emcc -O2 -pthread -c tools/optim/fma_rapida.c -o "$T/view/zz_fma_rapida.o"; fi
OBJDIR=recorte/obj-simd VIEW="$ROOT/$T/view" LINK_OUT="$ROOT/$T/web" bash tools/optim/link-memlazy.sh | tail -3
[ -d "$T/demo" ] || cp -al "$A/autopista60-pub/demo" "$T/demo"
cp --remove-destination "$T/web/gh3-web.wasm" "$T/demo/gh3-web.wasm"
node -e "
const fs=require('fs'),A='$A';
let js=fs.readFileSync(A+'/autopista60-pub/demo/gh3-web.js','utf8');
const o=fs.readFileSync(A+'/prod-barato/web/gh3-web.js','utf8').split('\n'),n=fs.readFileSync('$T/web/gh3-web.js','utf8').split('\n');
if(o.length!==n.length)throw new Error('cantidad de líneas distinta');
let c=0;for(let i=0;i<o.length;i++)if(o[i]!==n[i]){if(!/^  \d+: /.test(o[i]))throw new Error('línea no ASM_CONSTS '+i);if(js.split(o[i]).length!==2)throw new Error('ambigua '+i);js=js.replace(o[i],n[i]);c++;}
fs.writeFileSync('$T/demo/gh3-web.js.new',js);console.log('ASM_CONSTS cambiadas',c);"
cp --remove-destination "$T/demo/gh3-web.js.new" "$T/demo/gh3-web.js"; rm -f -- "$T/demo/gh3-web.js.new"
md5sum "$A/autopista60-pub/demo/gh3-web.wasm" "$T/demo/gh3-web.wasm" "$A/autopista60-pub/demo/gh3-web.js" "$T/demo/gh3-web.js"
