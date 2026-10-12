#!/usr/bin/env bash
# Build aislado con esperas activas parcheadas (descanso corto). Uso: bash tools/optim/build-spin.sh <tag> <micros> <archivo.cpp:loc_A,loc_B> [...]
# Salida: artifacts/d1-wasm/optim/<tag>/web/gh3-web.{js,wasm}. No toca el código generado ni otros builds.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; A="$ROOT/artifacts/d1-wasm"; TAG="$1"; US="$2"; shift 2
GEN="$ROOT/artifacts/xex-adapt/paso-b/gh3-variant/generated/variant-dd2ca1ab"; T="$A/optim/$TAG"
mkdir -p "$T/src" "$T/obj1"; rm -rf "$T/obj-simd"; mkdir -p "$T/obj-simd"; cp -l "$A"/r6/obj-simd/*.o "$T/obj-simd/"
for spec in "$@"; do f="${spec%%:*}"; python "$ROOT/tools/optim/patch-spins.py" "$GEN/$f" "$T/src/$f" "${spec#*:}" "$US"
  OUT="$T/obj1" OPT="-O2 -msimd128" JOBS=1 bash "$ROOT/tools/d1-wasm/build.sh" "$T/src/$f" | tee -a "$T/build.log"
  b="${f%.cpp}"; grep -q $'\tOK\t' <(grep "^$b" "$T/obj1/results.tsv") || { cat "$T/obj1/$b.err"; exit 1; }
  rm -f "$T/obj-simd/$b.o"; cp "$T/obj1/$b.o" "$T/obj-simd/$b.o"; done
SONGLIVE_DIR="optim/$TAG" SONGLIVE_OBJDIR="optim/$TAG/obj-simd" bash "$ROOT/tools/d1-wasm/songlive-link.sh" > "$T/link.log" 2>&1 || { tail -20 "$T/link.log"; exit 1; }
tail -2 "$T/link.log"
