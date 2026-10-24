#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
cd "$ROOT"
emcc -O2 -pthread -Iartifacts/d1-wasm/rtsrc/ffmpeg artifacts/d1-wasm/rtsrc/src/audio/g1c_fixture.c artifacts/d1-wasm/g1c/ffmpeg-build/libavcodec.a artifacts/d1-wasm/g1c/ffmpeg-build/libavutil.a -lnodefs.js -sNODERAWFS=1 -sENVIRONMENT=node -o artifacts/d1-wasm/g1c/fixture-wasm.js
