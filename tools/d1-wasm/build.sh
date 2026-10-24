#!/usr/bin/env bash
# Paso D1: compila a WebAssembly (wasm32) los archivos C++ generados de GH3 X360 (variante dd2ca1ab).
# Solo compila (.o). No enlaza ni ejecuta. Uso: bash tools/d1-wasm/build.sh [archivo.cpp ...]
# Variables: OPT (por defecto -O2), JOBS (por defecto 6), OUT.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
PB="$ROOT/artifacts/xex-adapt/paso-b"; SDK="$PB/src/rexglue-sdk-090"; GEN="$PB/gh3-variant/generated/variant-dd2ca1ab"
OUT="${OUT:-$ROOT/artifacts/d1-wasm/obj${OPT_TAG:-}}"; mkdir -p "$OUT"
OPT="${OPT:--O2}"; JOBS="${JOBS:-6}"
FLAGS=(-std=c++23 $OPT -w -pthread -DREX_PLATFORM_LINUX=1 -DSPDLOG_FMT_EXTERNAL -DREXGLUE_BUILD_CONFIG=\"Release\"
  -I"$ROOT/tools/d1-wasm" -I"$GEN" -I"$ROOT/artifacts/d1-wasm/rtsrc/include" -I"$ROOT/artifacts/d1-wasm/sdkp/include" -I"$PB/build/sdk/include"
  -I"$SDK/thirdparty/simde" -I"$SDK/thirdparty/fmt/include" -I"$SDK/thirdparty/spdlog/include"
  -include "$ROOT/tools/d1-wasm/gh3_wasm_prelude.h")
if [ "${G1B_TRACE:-0}" = 1 ]; then FLAGS+=(-DGH3_G1B_TRACE=1); fi
if [ "${R2_WATCH:-0}" = 1 ]; then FLAGS+=(-DGH3_R2_WATCH=1); fi
if [ $# -gt 0 ]; then FILES=("$@"); else FILES=("$GEN"/*.cpp); fi
compile() {  # $1 = fuente
  local f="$1" b; b="$(basename "$f" .cpp)"
  local t0=$(date +%s%N)
  if em++ "${FLAGS[@]}" -c "$f" -o "$OUT/$b.o" 2> "$OUT/$b.err"; then st=OK; else st=FAIL; fi
  local t1=$(date +%s%N)
  printf "%s\t%s\t%.1f\t%s\t%s\n" "$b" "$st" "$(( (t1 - t0) / 1000000 ))e-3" "$(stat -c %s "$f")" "$( [ -f "$OUT/$b.o" ] && stat -c %s "$OUT/$b.o" || echo 0)"
}
export -f compile; export OUT
# Exportar el array como cadena para xargs: se reconstruye con declare -p.
FLAGS_DECL="$(declare -p FLAGS)"; export FLAGS_DECL
printf "%s\n" "${FILES[@]}" | xargs -P "$JOBS" -I{} bash -c 'eval "$FLAGS_DECL"; compile "$1"' _ {} | tee "$OUT/results.tsv"
