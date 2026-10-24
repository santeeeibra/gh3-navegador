#!/usr/bin/env bash
# R5F: regenera los archivos mínimos sintéticos y comprueba que el verificador acepta el válido y rechaza
# cada inválido. Sin juego. Uso: bash tools/d1-wasm/r5f-fixture-check.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; F="$ROOT/artifacts/r5-runtime-claude/r5f-fixture"; C="$ROOT/tools/d1-wasm/r5frame-check.mjs"
node "$ROOT/artifacts/d1-wasm/r5frame/r5f-fixture.cjs" "$F" > "$F/fixture.log" || { echo "FALLA: pruebas de dependencias (ver $F/deps-check.json)"; exit 1; }
tail -1 "$F/fixture.log"
fails=0
node "$C" "$F/r5f-min-valido.r5f" "$F/r5f-min-valido.json" > /dev/null && echo "OK  valido aceptado" || { echo "MAL valido rechazado"; fails=$((fails+1)); }
for n in truncado hash-malo sin-footer bytes-sobrantes blob-ausente delta-fuera shader-repetido salto-seq; do
  if node "$C" "$F/r5f-min-$n.r5f" "$F/r5f-min-$n.json" --expect-invalid > /dev/null; then echo "OK  $n rechazado: $(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1])).errors[0])" "$(cygpath -w "$F/r5f-min-$n.json")")"; else echo "MAL $n aceptado"; fails=$((fails+1)); fi
done
echo "fallas: $fails"; exit $fails
