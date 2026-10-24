#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Keep original generated source and existing object intact before replacing the object.
mkdir -p "$ROOT/artifacts/d1-wasm/g1d/spin-obj" "$ROOT/artifacts/d1-wasm/g1d/pre-spin-obj"
cp -n "$ROOT/artifacts/d1-wasm/obj/gh3_recomp.5.o" "$ROOT/artifacts/d1-wasm/g1d/pre-spin-obj/gh3_recomp.5.o" || true
# Local copy of compile script adds a forced include. No edit to generated C++ or SDK.
python - <<'PY'
from pathlib import Path
p=Path('tools/d1-wasm/build.sh');s=p.read_text();s=s.replace('-include "$ROOT/tools/d1-wasm/gh3_wasm_prelude.h")','-include "$ROOT/tools/d1-wasm/gh3_wasm_prelude.h" -include "$ROOT/artifacts/d1-wasm/rtsrc/include/g1d_counter_watch.h")')
Path('tools/d1-wasm/build-g1d-counter.sh').write_text(s)
PY
OUT="$ROOT/artifacts/d1-wasm/g1d/spin-obj" JOBS=1 bash "$ROOT/tools/d1-wasm/build-g1d-counter.sh" "$ROOT/artifacts/xex-adapt/paso-b/gh3-variant/generated/variant-dd2ca1ab/gh3_recomp.5.cpp"
grep -q $'\tOK\t' "$ROOT/artifacts/d1-wasm/g1d/spin-obj/results.tsv"
cp "$ROOT/artifacts/d1-wasm/g1d/spin-obj/gh3_recomp.5.o" "$ROOT/artifacts/d1-wasm/obj/gh3_recomp.5.o"
