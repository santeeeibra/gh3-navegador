#!/usr/bin/env bash
# Enlaza el build web "espía" con la MISMA receta que memlazy (vista memlazy/view + pre-js songlive_web.js),
# cambiando solo el código generado por artifacts/re/obj-simd. Arma artifacts/re/demo = memlazy/demo con
# enlaces duros + wasm/js propios (archivos nuevos, nunca se escribe sobre los enlazados). NO publicar.
# Uso: bash tools/re/link-wasm-re.sh [control]   (control = enlaza con r6/obj-simd para comparar con memlazy)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; A="$ROOT/artifacts/d1-wasm"; R="$ROOT/artifacts/re"
VIEW="$A/memlazy/view"; OBJ=../re/obj-simd; OUTW="$R/web"
if [ "${1:-}" = control ]; then OBJ=r6/obj-simd; OUTW="$R/web-control"; fi
[ "$OBJ" = r6/obj-simd ] || [ "$(ls "$R/obj-simd"/*.o | wc -l)" -ge 74 ] || { echo "faltan objetos en artifacts/re/obj-simd"; exit 1; }
T="$ROOT/tools/re/.link-tmp.sh"
sed -e "s#\"\$A\"/rt-obj/\*.o#\"$VIEW\"/*.o#" -e "s#\"\$ROOT/tools/d1-wasm/d4_web.js\"#\"\$ROOT/tools/d1-wasm/songlive_web.js\"#" "$ROOT/tools/d1-wasm/link-web.sh" > "$T"
grep -q "$VIEW" "$T" && grep -q songlive_web.js "$T" || { echo "no se pudo redirigir objetos/pre-js"; rm -f "$T"; exit 1; }
set +e; OBJDIR="$OBJ" LINK_OUT="$OUTW" bash "$T"; rc=$?; set -e; rm -f "$T"
[ $rc -eq 0 ] || exit $rc
[ ! -s "$OUTW/undefined.txt" ] || { echo "símbolos sin definir:"; cat "$OUTW/undefined.txt"; exit 1; }
sha256sum "$OUTW"/gh3-web.{js,wasm} | sed "s#$ROOT/##"
[ "${1:-}" = control ] && exit 0
# gh3-web.js: si el enlace dio el mismo JS que memlazy, se usa el publicado; si no, merge de 3 vías.
D="$R/demo"
if [ ! -d "$D" ]; then cp -al "$A/memlazy/demo" "$D"; fi
rm -f "$D/gh3-web.wasm" "$D/gh3-web.js"
cp "$OUTW/gh3-web.wasm" "$D/gh3-web.wasm"
if cmp -s "$OUTW/gh3-web.js" "$A/memlazy/web/gh3-web.js"; then
  cp "$A/memlazy/demo/gh3-web.js" "$D/gh3-web.js"; echo "JS igual al de memlazy: se usa el publicado"
else
  # Solo deberían cambiar las claves numéricas de ASM_CONSTS (direcciones de EM_ASM): se reemplazan en el publicado.
  node "$ROOT/tools/re/asm-consts-swap.mjs" "$A/memlazy/web/gh3-web.js" "$OUTW/gh3-web.js" "$A/memlazy/demo/gh3-web.js" "$D/gh3-web.js"
fi
echo "demo: ${D#$ROOT/}"
