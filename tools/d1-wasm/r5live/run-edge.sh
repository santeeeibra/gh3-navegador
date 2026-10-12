#!/usr/bin/env bash
# R5L: prueba Edge del productor vivo (consumidor de prueba, sin dibujo) con turno y servidor propios.
# Uso: bash tools/d1-wasm/r5live/run-edge.sh <seg> <etiqueta> [puerto]
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$ROOT"
SEC="${1:-200}"; LABEL="${2:-edge-1}"; PORT="${3:-5188}"
O="$ROOT/artifacts/d1-wasm/r5live/$LABEL"; mkdir -p "$O"
T=$(node tools/gpu-capture/turn.mjs reserve "R5L vivo: prueba Edge $SEC s (build aislado artifacts/d1-wasm/r5live, servidor :$PORT)") || exit 1
D4_ROOT="$ROOT/artifacts/d1-wasm/r5live/d4" node tools/d1-wasm/serve-d4.mjs "$PORT" > "$O/serve.log" 2>&1 &
SP=$!
sleep 2
G1_CP_WAIT=event G1E_PRESS='150:start,175:start' D4_OUT="$O" \
  D4_URL="http://127.0.0.1:$PORT/?r5live=1&r5liveconsumer=r5snap-r5live-test.js" \
  node tools/d1-wasm/verify-d4.mjs "$SEC" "r5live-$LABEL" null silent decode > "$O/run.out" 2> "$O/run.err"
rc=$?
kill "$SP" 2>/dev/null
GPUCAP_TURN="$T" node tools/gpu-capture/turn.mjs release "R5L prueba Edge $LABEL"
echo "rc=$rc"
