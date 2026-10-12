#!/usr/bin/env bash
# VB: una corrida corta en Edge headless (CP asíncrono + evento, latido R3c apagado) para medir el VBlank.
# Uso: bash tools/d1-wasm/vblank-edge.sh <etiqueta> [segundos]. Salida en artifacts/d1-wasm/vblank/.
cd "$(dirname "$0")/../.."
OUT="$(pwd -W)/artifacts/d1-wasm/vblank"; mkdir -p "$OUT"
node tools/d1-wasm/serve-d4.mjs 5183 > "$OUT/serve.log" 2>&1 & S=$!
trap 'kill $S 2>/dev/null' EXIT
sleep 2
env G1_CP_WAIT=event G1_CP_ASYNC=1 D4_URL="http://127.0.0.1:5183/" D4_OUT="$OUT" node tools/d1-wasm/verify-d4.mjs "${2:-30}" "$1" null silent decode > "$OUT/$1.runner.log" 2>&1
echo "runner rc=$?"
