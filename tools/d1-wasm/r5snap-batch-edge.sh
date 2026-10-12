#!/usr/bin/env bash
# R5snap: tanda en Edge headless, una corrida por vez (binario nuevo en 5179). Logs en artifacts/d1-wasm/r5snap/edge.
cd "$(dirname "$0")/../.."
OUT="$(pwd -W)/artifacts/d1-wasm/r5snap/edge"; mkdir -p "$OUT"
node tools/d1-wasm/serve-d4.mjs 5179 > "$OUT/serve.log" 2>&1 & S1=$!
trap 'kill $S1 2>/dev/null' EXIT
sleep 2
run() { local secs="$1" label="$2"; shift 2; echo "== $label $*"; env G1_CP_WAIT=event D4_URL="http://127.0.0.1:5179/" D4_OUT="$OUT" "$@" node tools/d1-wasm/verify-d4.mjs "$secs" "$label" null silent decode | grep -E '"exit"|"errors"|"timedOut"' | tr -d '\n '; echo;
  grep -a '\[r5snap\] {"on"' "$OUT/$label.log" | tail -1; grep -a '\[r3a\] {"pumps"' "$OUT/$label.log" | tail -1 | grep -o '"mismatchChunks":[0-9]*,"packets":\[[0-9,]*\],"draws":\[[0-9,]*\],"swaps":\[[0-9,]*\]'; }
{
run 40 e5-off-sync X=1
run 40 e5-off-async G1_CP_ASYNC=1 G1_R3A_CHECK=1
run 40 e5-any-hold50 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=hold:50
run 40 e5-any-reject G1_CP_ASYNC=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=reject
run 230 e5-first-check G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_TEST=check G1E_PRESS="150:start,175:start"
echo done
} 2>&1 | tee "$OUT/../edge-batch.txt"
