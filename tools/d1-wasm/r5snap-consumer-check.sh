#!/usr/bin/env bash
# R5snap: consumidor EXTERNO cargado en el hilo del CP (G1_R5SNAP_CONSUMER / ?r5consumer=).
cd "$(dirname "$0")/../.."
OUT="$(pwd -W)/artifacts/d1-wasm/r5snap/edge"; mkdir -p "$OUT"
node tools/d1-wasm/serve-d4.mjs 5179 > "$OUT/serve-c.log" 2>&1 & S1=$!
trap 'kill $S1 2>/dev/null' EXIT
sleep 2
EX="$(pwd -W)/artifacts/d1-wasm/d4/r5snap-consumer-example.js"
nrun() { local secs="$1" label="$2"; shift 2; echo "== node $label $*"; env G1_CP_WAIT=event "$@" node tools/d1-wasm/run-d3.mjs "$secs" "$label" null silent decode | tail -1; grep -a 'consumidor cargado\|no se pudo cargar\|r5snap-example' artifacts/d1-wasm/d3/$label.log | head -3; grep -a '^\[r5snap\] {"on"' artifacts/d1-wasm/d3/$label.log | tail -1; grep -a '^\[r3a\] {"pumps"' artifacts/d1-wasm/d3/$label.log | tail -1 | grep -o '"mismatchChunks":[0-9]*'; }
erun() { local secs="$1" label="$2"; shift 2; echo "== edge $label $*"; env G1_CP_WAIT=event D4_URL="http://127.0.0.1:5179/" D4_OUT="$OUT" "$@" node tools/d1-wasm/verify-d4.mjs "$secs" "$label" null silent decode | grep -E '"exit"|"errors"|"timedOut"' | tr -d '\n '; echo; grep -a 'consumidor cargado\|no se pudo cargar\|r5snap-example' "$OUT/$label.log" | head -3; grep -a '\[r5snap\] {"on"' "$OUT/$label.log" | tail -1; grep -a '\[r3a\] {"pumps"' "$OUT/$label.log" | tail -1 | grep -o '"mismatchChunks":[0-9]*'; }
{
if [ "${EDGE_ONLY:-}" != 1 ]; then
nrun 40 r5c-any-example G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_CONSUMER="$EX"
nrun 40 r5c-badpath G1_CP_ASYNC=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_CONSUMER=no-existe.js
fi
erun 40 e5c-any-example G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_CONSUMER=r5snap-consumer-example.js
erun 230 e5c-first-example G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_CONSUMER=r5snap-consumer-example.js G1E_PRESS="150:start,175:start"
echo done
} 2>&1 | tee "$OUT/../consumer-check${EDGE_ONLY:+-edge}.txt"
