#!/usr/bin/env bash
# R3a: tanda A/B en Edge headless, una corrida por vez. Binario anterior servido en 5181, nuevo en 5179.
# Uso: bash tools/d1-wasm/r3a-batch-edge.sh   Logs: artifacts/d1-wasm/r3a-web/
cd "$(dirname "$0")/../.."
OUT="$(pwd -W)/artifacts/d1-wasm/r3a-web"; mkdir -p "$OUT"
node tools/d1-wasm/serve-d4.mjs 5179 > "$OUT/serve-new.log" 2>&1 & S1=$!
D4_ROOT="$(pwd -W)/artifacts/respaldo/2026-10-09-r3a/bin/d4" node tools/d1-wasm/serve-d4.mjs 5181 > "$OUT/serve-old.log" 2>&1 & S2=$!
trap 'kill $S1 $S2 2>/dev/null' EXIT
sleep 2
run() { local label="$1" port="$2"; shift 2; echo "== $label $*"; env D4_URL="http://127.0.0.1:$port/" D4_OUT="$OUT" "$@" node tools/d1-wasm/verify-d4.mjs "${SECS:-40}" "$label" ${GPU:-null} silent decode | grep -E '"exit"|"vdAll"|"errors"|"timedOut"' | tr -d '\n '; echo; }
for i in 1 2; do
  run r3a-old-sleep-$i 5181 X=1
  run r3a-new-sleep-$i 5179 X=1
done
run r3a-new-check-y1 5179 G1_R3A_CHECK=1 G1_R3A_YIELD=1
run r3a-old-event 5181 G1_CP_WAIT=event
run r3a-new-event 5179 G1_CP_WAIT=event
run r3a-new-check-y7-event 5179 G1_R3A_CHECK=1 G1_R3A_YIELD=7 G1_CP_WAIT=event
SECS=20 GPU=none run r3a-new-none 5179 X=1
echo done
