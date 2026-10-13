#!/usr/bin/env bash
# Build web "espía" (ingeniería inversa, Claude 2026-10-13): compila el código generado de GH3 con
# tools/re/rt/gh3_re_prelude.h (cuenta llamadas por función + vigila escrituras) y re_hooks.cpp.
# Mismas opciones que r6/obj-simd (-O2 -msimd128). Salida: artifacts/re/obj-simd. No toca otros builds.
# Uso: bash tools/re/build-wasm-re.sh [archivo.cpp ...]
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
PB="$ROOT/artifacts/xex-adapt/paso-b"; SDK="$PB/src/rexglue-sdk-090"; GEN="$PB/gh3-variant/generated/variant-dd2ca1ab"
OUT="${OUT:-$ROOT/artifacts/re/obj-simd}"; mkdir -p "$OUT"
JOBS="${JOBS:-6}"
FLAGS=(-std=c++23 -O2 -msimd128 -w -pthread -DREX_PLATFORM_LINUX=1 -DSPDLOG_FMT_EXTERNAL -DREXGLUE_BUILD_CONFIG=\"Release\"
  -I"$ROOT/tools/re/rt" -I"$ROOT/tools/d1-wasm" -I"$GEN" -I"$ROOT/artifacts/d1-wasm/rtsrc/include" -I"$ROOT/artifacts/d1-wasm/sdkp/include" -I"$PB/build/sdk/include"
  -I"$SDK/thirdparty/simde" -I"$SDK/thirdparty/fmt/include" -I"$SDK/thirdparty/spdlog/include")
if [ $# -gt 0 ]; then FILES=("$@"); else FILES=("$GEN"/*.cpp "$ROOT/tools/re/rt/re_hooks.cpp"); fi
compile() {  # $1 = fuente
  local f="$1" b inc=(); b="$(basename "$f" .cpp)"
  [ "$b" = re_hooks ] || inc=(-include "$ROOT/tools/re/rt/gh3_re_prelude.h")
  local t0=$(date +%s%N)
  if em++ "${FLAGS[@]}" "${inc[@]}" -c "$f" -o "$OUT/$b.o" 2> "$OUT/$b.err"; then st=OK; else st=FAIL; fi
  local t1=$(date +%s%N)
  printf "%s\t%s\t%.1f\n" "$b" "$st" "$(( (t1 - t0) / 1000000 ))e-3"
}
export -f compile; export OUT ROOT
FLAGS_DECL="$(declare -p FLAGS)"; export FLAGS_DECL
printf "%s\n" "${FILES[@]}" | xargs -P "$JOBS" -I{} bash -c 'eval "$FLAGS_DECL"; compile "$1"' _ {} | tee "$OUT/results.tsv"
