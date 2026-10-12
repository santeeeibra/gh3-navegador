#!/usr/bin/env bash
# R5snap: liberación demorada con comprobación byte a byte del slot al liberar (consumidor de prueba hold).
# Node: artifacts/d1-wasm/d3/r5v-*.log; Edge: artifacts/d1-wasm/r5snap/edge/e5v-*.log. Resumen: artifacts/d1-wasm/r5snap/hold-verify.txt
cd "$(dirname "$0")/../.."
OUT="$(pwd -W)/artifacts/d1-wasm/r5snap/edge"; mkdir -p "$OUT"
node tools/d1-wasm/serve-d4.mjs 5179 > "$OUT/serve-v.log" 2>&1 & S1=$!
trap 'kill $S1 2>/dev/null' EXIT
sleep 2
nrun() { local secs="$1" label="$2"; shift 2; echo "== node $label $*"; env G1_CP_WAIT=event "$@" node tools/d1-wasm/run-d3.mjs "$secs" "$label" null silent decode | tail -1; grep -a '^\[r5snap\] {"on"' artifacts/d1-wasm/d3/$label.log | tail -1; grep -a 'hold: el slot' artifacts/d1-wasm/d3/$label.log | head -1; grep -a '^\[r3a\] {"pumps"' artifacts/d1-wasm/d3/$label.log | tail -1 | grep -o '"mismatchChunks":[0-9]*'; }
erun() { local secs="$1" label="$2"; shift 2; echo "== edge $label $*"; env G1_CP_WAIT=event D4_URL="http://127.0.0.1:5179/" D4_OUT="$OUT" "$@" node tools/d1-wasm/verify-d4.mjs "$secs" "$label" null silent decode | grep -E '"exit"|"errors"|"timedOut"' | tr -d '\n '; echo; grep -a '\[r5snap\] {"on"' "$OUT/$label.log" | tail -1; grep -a 'hold: el slot' "$OUT/$label.log" | head -1; grep -a '\[r3a\] {"pumps"' "$OUT/$label.log" | tail -1 | grep -o '"mismatchChunks":[0-9]*'; }
{
nrun 40 r5v-any-hold50 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=hold:50
nrun 40 r5v-any-holdbad G1_CP_ASYNC=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=holdbad:50
nrun 230 r5v-first-hold200 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_TEST=hold:200 G1E_PRESS="150:start,175:start"
erun 40 e5v-any-hold50 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=hold:50
erun 230 e5v-first-hold200 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_TEST=hold:200 G1E_PRESS="150:start,175:start"
echo done
} 2>&1 | tee "$OUT/../hold-verify.txt"
