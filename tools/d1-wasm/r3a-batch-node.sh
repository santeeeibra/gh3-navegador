#!/usr/bin/env bash
# R3a: tanda A/B en Node, una corrida por vez (sin solaparse). Uso: bash tools/d1-wasm/r3a-batch-node.sh
# Logs: artifacts/d1-wasm/d3/r3a-*.log/json. Binario anterior: artifacts/respaldo/2026-10-09-r3a/bin.
cd "$(dirname "$0")/../.."
OLD="$(pwd -W)/artifacts/respaldo/2026-10-09-r3a/bin/gh3-headless.js"
run() { local label="$1"; shift; echo "== $label $*"; env "$@" node tools/d1-wasm/run-d3.mjs "${SECS:-40}" "$label" ${GPU:-null} silent decode | tail -1; }
for i in 1 2 3; do
  run r3a-old-sleep-$i GH3_JS="$OLD"
  run r3a-new-sleep-$i X=1
done
for i in 1 2; do run r3a-new-check-y1-$i G1_R3A_CHECK=1 G1_R3A_YIELD=1; done
run r3a-new-check-sleep G1_R3A_CHECK=1
run r3a-old-event GH3_JS="$OLD" G1_CP_WAIT=event
run r3a-new-event G1_CP_WAIT=event
run r3a-new-check-y7-event G1_R3A_CHECK=1 G1_R3A_YIELD=7 G1_CP_WAIT=event
SECS=20 GPU=none run r3a-new-none X=1
echo done
