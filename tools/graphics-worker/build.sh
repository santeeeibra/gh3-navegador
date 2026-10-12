#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$ROOT/artifacts/fase2-threads/env.sh"
em++ "$ROOT/tools/graphics-worker/probe.cpp" -O2 -pthread -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=1 -sMODULARIZE=1 -sEXPORT_NAME=createGraphicsWorkerProbe -sENVIRONMENT=web,worker -sEXPORTED_FUNCTIONS=_main,_publish_probe,_malloc,_free -sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToNewUTF8 -o "$ROOT/artifacts/graphics-worker/build/probe.js"
