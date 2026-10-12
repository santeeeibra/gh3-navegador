#!/usr/bin/env bash
# R5snap: tanda en Node, una corrida por vez. Binario anterior (sin r5snap) en artifacts/respaldo/2026-10-09-r5snap/bin.
# Logs: artifacts/d1-wasm/d3/r5-*.log. R5_ONLY=consumer: solo las corridas con consumidor JS (tras el arreglo del puntero sin signo). Resumen: una línea por corrida en artifacts/d1-wasm/r5snap/node-batch.txt.
cd "$(dirname "$0")/../.."
OLD="$(pwd -W)/artifacts/respaldo/2026-10-09-r5snap/bin/gh3-headless.js"
OUT=artifacts/d1-wasm/r5snap; mkdir -p "$OUT"
run() { local secs="$1" label="$2"; shift 2; echo "== $label $*"; env G1_CP_WAIT=event "$@" node tools/d1-wasm/run-d3.mjs "$secs" "$label" null silent decode | tail -1;
  grep '^\[r5snap\] {"on"' artifacts/d1-wasm/d3/$label.log | tail -1; grep '^\[r3a\] {"pumps"' artifacts/d1-wasm/d3/$label.log | tail -1 | grep -o '"mismatchChunks":[0-9]*,"packets":\[[0-9,]*\],"draws":\[[0-9,]*\],"swaps":\[[0-9,]*\]'; }
if [ "${R5_ONLY:-}" = consumer ]; then
{
run 40 r5-any-auto G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any
run 40 r5-any-check G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=check
run 40 r5-any-hold50 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=hold:50
run 40 r5-any-max G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_MAX=50000 G1_R5SNAP_TEST=check
run 40 r5-any-throw G1_CP_ASYNC=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=throw
run 40 r5-any-reject G1_CP_ASYNC=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=reject
run 230 r5-first-check G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_TEST=check G1E_PRESS="150:start,175:start"
run 230 r5-first-hold200 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_TEST=hold:200 G1E_PRESS="150:start,175:start"
echo done
} 2>&1 | tee "$OUT/node-batch-consumer.txt"
exit 0
fi
{
run 40 r5-off-old-sync GH3_JS="$OLD"
run 40 r5-off-new-sync X=1
run 40 r5-off-new-async G1_CP_ASYNC=1 G1_R3A_CHECK=1
run 40 r5-noasync G1_R5SNAP=1
run 40 r5-any-auto G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any
run 40 r5-any-check G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=check
run 40 r5-any-hold50 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=hold:50
run 40 r5-any-max G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_MAX=50000 G1_R5SNAP_TEST=check
run 40 r5-any-throw G1_CP_ASYNC=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=throw
run 40 r5-any-reject G1_CP_ASYNC=1 G1_R5SNAP=1 G1_R5SNAP_SELECT=any G1_R5SNAP_TEST=reject
run 230 r5-first-check G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_TEST=check G1E_PRESS="150:start,175:start"
run 230 r5-first-hold200 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R5SNAP=1 G1_R5SNAP_TEST=hold:200 G1E_PRESS="150:start,175:start"
echo done
} 2>&1 | tee "$OUT/node-batch.txt"
