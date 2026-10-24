#!/usr/bin/env bash
# Compila la prueba de memoria/MMIO a WebAssembly (wasm32 y wasm64) con el emsdk local.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EMSDK="$ROOT/toolchain/emsdk"
PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
OUT="$ROOT/artifacts/fase1-mem/build"; mkdir -p "$OUT"
SRC="$ROOT/tools/fase1-mem/memmmio_test.cpp"
COMMON=(-std=c++20 -O2 -Wall -Wextra -sSINGLE_FILE=1 -sMODULARIZE=1 -sENVIRONMENT=web,node
  -sALLOW_MEMORY_GROWTH=1 -sEXPORTED_FUNCTIONS=_run_mode,_main -sEXPORTED_RUNTIME_METHODS=ccall)
em++ "$SRC" "${COMMON[@]}" -sEXPORT_NAME=createMem32 -o "$OUT/memmmio32.js"
em++ "$SRC" "${COMMON[@]}" -sMEMORY64=1 -sEXPORT_NAME=createMem64 -o "$OUT/memmmio64.js"
em++ --version | head -1
ls -la "$OUT"
