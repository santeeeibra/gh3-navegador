#!/usr/bin/env bash
# R3b: tanda en Edge headless, una corrida por vez. Binario R3a en 5181, nuevo en 5179.
cd "$(dirname "$0")/../.."
OUT="$(pwd -W)/artifacts/d1-wasm/r3b-web"; mkdir -p "$OUT"
node tools/d1-wasm/serve-d4.mjs 5179 > "$OUT/serve-new.log" 2>&1 & S1=$!
D4_ROOT="$(pwd -W)/artifacts/respaldo/2026-10-09-r3b/bin/d4" node tools/d1-wasm/serve-d4.mjs 5181 > "$OUT/serve-old.log" 2>&1 & S2=$!
trap 'kill $S1 $S2 2>/dev/null' EXIT
sleep 2
run() { local label="$1" port="$2"; shift 2; echo "== $label $*"; env G1_CP_WAIT=event D4_URL="http://127.0.0.1:$port/" D4_OUT="$OUT" "$@" node tools/d1-wasm/verify-d4.mjs "${SECS:-40}" "$label" ${GPU:-null} silent decode | grep -E '"exit"|"vdAll"|"errors"|"timedOut"' | tr -d '\n '; echo; }
for i in 1 2; do
  run r3b-r3a-sync-$i 5181 X=1
  run r3b-new-async-$i 5179 G1_CP_ASYNC=1
done
run r3b-new-sync-1 5179 X=1
run r3b-new-async-check-fake 5179 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R3B_FAKE_PENDING=5:20
run r3b-new-async-check-pkts64 5179 G1_CP_ASYNC=1 G1_R3A_CHECK=1 G1_R3B_BUDGET_PKTS=64
run r3b-new-async-r3c-check 5179 G1_CP_ASYNC=1 G1_R3C=1 G1_R3A_CHECK=1
run r3b-new-async-r3c-1 5179 G1_CP_ASYNC=1 G1_R3C=1
SECS=20 GPU=none run r3b-new-none-async 5179 G1_CP_ASYNC=1
echo done
