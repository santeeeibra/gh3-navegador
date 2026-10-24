#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$ROOT/artifacts/fase2-threads/env.sh"
mkdir -p "$ROOT/artifacts/graphics-upload/build"
em++ "$ROOT/tools/graphics-upload/probe.cpp" -O2 -pthread \
  -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=2 -sALLOW_BLOCKING_ON_MAIN_THREAD=0 \
  -sMODULARIZE=1 -sEXPORT_NAME=createGraphicsUploadProbe -sENVIRONMENT=web,worker \
  -sEXPORTED_FUNCTIONS=_main,_start_producer,_publish_probe,_publish_texture,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToNewUTF8 \
  -o "$ROOT/artifacts/graphics-upload/build/probe.js"

