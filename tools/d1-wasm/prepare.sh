#!/usr/bin/env bash
# Paso D1: copia los encabezados del SDK rexglue 0.9.0 (los que usó el build nativo) y les aplica
# los parches de Fase 0 para Emscripten. No toca el SDK original de paso-b.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/artifacts/xex-adapt/paso-b/src/rexglue-sdk-090/include"; D="$ROOT/artifacts/d1-wasm/sdkp"
rm -rf "$D/include"; mkdir -p "$D/include"; cp -r "$SRC/rex" "$D/include/"
find "$D/include" -type f -exec sed -i 's/\r$//' {} +
cd "$D"
# platform.h, fpscr.h e intrinsics.h aplican tal cual; chrono.h y numeric.h cambiaron en 0.9.0.
patch -p1 --forward -r - < "$ROOT/artifacts/fase0/patch-all.diff" || true  # fallan chrono.h/numeric.h: esperado
python - "$D/include/rex/chrono/chrono.h" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
if 'clock_time_conversion {};' not in s:
    old='namespace std::chrono {\n\ntemplate <>'
    new=('namespace std::chrono {\n\n#if defined(__EMSCRIPTEN__)\n// libc++ de Emscripten no expone clock_time_conversion'
         ' (igual que Apple; ver Fase 0 patch-03).\ntemplate <class, class>\nstruct clock_time_conversion {};\n#endif\n\ntemplate <>')
    assert old in s; open(p,'w').write(s.replace(old,new,1))
PY
grep -c EMSCRIPTEN include/rex/platform.h include/rex/platform/fpscr.h include/rex/chrono/chrono.h
