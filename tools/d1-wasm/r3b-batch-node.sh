#!/usr/bin/env bash
# R3b: tanda en Node, una corrida por vez. Binario R3a (anterior) en artifacts/respaldo/2026-10-09-r3b/bin.
cd "$(dirname "$0")/../.."
OLD="$(pwd -W)/artifacts/respaldo/2026-10-09-r3b/bin/gh3-headless.js"
run() { local label="$1"; shift; echo "== $label $*"; env G1_CP_WAIT=event "$@" node tools/d1-wasm/run-d3.mjs "${SECS:-40}" "$label" ${GPU:-null} silent decode | tail -1; }
for i in 1 2; do
  run r3b-r3a-sync-$i GH3_JS="$OLD"
  run r3b-new-sync-$i X=1
  run r3b-new-async-$i G1_CP_ASYNC=1
done
run r3b-new-async-3 G1_CP_ASYNC=1
run r3b-new-async-check G1_CP_ASYNC=1 G1_R3A_CHECK=1
run r3b-new-async-check-fake G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R3B_FAKE_PENDING=5:20
run r3b-new-async-check-pkts64 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R3B_BUDGET_PKTS=64
run r3b-new-async-sleep G1_CP_ASYNC=1 G1_CP_WAIT=sleep
SECS=20 GPU=none run r3b-new-none X=1
SECS=20 GPU=none run r3b-new-none-async G1_CP_ASYNC=1
echo done
