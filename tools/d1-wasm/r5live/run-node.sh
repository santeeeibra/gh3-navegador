#!/usr/bin/env bash
# R5L: prueba Node del productor vivo con turno propio. Uso: bash tools/d1-wasm/r5live/run-node.sh <seg> <etiqueta>
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$ROOT"
SEC="${1:-200}"; LABEL="${2:-node-1}"
O="$ROOT/artifacts/d1-wasm/r5live/$LABEL"; mkdir -p "$O"
T=$(node tools/gpu-capture/turn.mjs reserve "R5L vivo: prueba Node $SEC s del productor (build aislado artifacts/d1-wasm/r5live)") || exit 1
G1_CP_WAIT=event G1E_PRESS='150:start,175:start' G1_R5LIVE=1 G1_R5LIVE_CONSUMER="$ROOT/tools/d1-wasm/r5live/test-consumer.js" \
  R5L_TEST_OUT="$O/frames" GH3_JS="$ROOT/artifacts/d1-wasm/r5live/d2/gh3-headless.js" \
  node tools/d1-wasm/run-d3.mjs "$SEC" "r5live-$LABEL" null silent decode > "$O/run.out" 2> "$O/run.err"
rc=$?
GPUCAP_TURN="$T" node tools/gpu-capture/turn.mjs release "R5L prueba Node $LABEL"
echo "rc=$rc"
