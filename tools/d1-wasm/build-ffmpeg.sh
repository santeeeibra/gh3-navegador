#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
cd "$ROOT"
mkdir -p "$ROOT/artifacts/d1-wasm/g1c"
if [ ! -d "$ROOT/artifacts/d1-wasm/rtsrc/ffmpeg" ]; then
  python -c 'import shutil; from pathlib import Path; r=Path.cwd(); shutil.copytree(r/"artifacts/xex-adapt/paso-b/src/rexglue-sdk-090/thirdparty/FFmpeg",r/"artifacts/d1-wasm/rtsrc/ffmpeg",ignore=shutil.ignore_patterns(".git"))'
fi
cd "$ROOT/artifacts/d1-wasm/rtsrc/ffmpeg"
if [ ! -f .wasm-configured ] || [ "${CONFIGURE:-0}" = 1 ]; then
bash configure --cc=emcc --ar=emar --ranlib=emranlib --nm=emnm --enable-cross-compile --arch=wasm32 --target-os=linux --disable-everything --disable-autodetect --disable-programs --disable-doc --disable-network --disable-avformat --disable-avdevice --disable-avfilter --disable-avresample --disable-swresample --disable-swscale --disable-postproc --disable-asm --disable-x86asm --disable-pthreads --disable-w32threads --disable-os2threads --enable-decoder=xmaframes --extra-cflags=-pthread --extra-ldflags=-pthread > "$ROOT/artifacts/d1-wasm/g1c/ffmpeg-configure.log" 2>&1
touch .wasm-configured
fi
python "$ROOT/tools/d1-wasm/compile-ffmpeg.py"
