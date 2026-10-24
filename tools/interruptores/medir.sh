#!/usr/bin/env bash
# Claude 2026-10-17: Slow Ride, calidad alta (completo), robot bien, sin capturas; base + 3 interruptores × (todos, 2 núcleos).
cd "$(dirname "$0")/../.."
OUT=artifacts/d1-wasm/interruptores/medidas; mkdir -p $OUT
for nuc in todos 2; do for sw in base sinpublico sinluces menoslod; do [ "$nuc-$sw" = todos-base ] && continue;
  Q=""; [ $sw != base ] && Q="--q $sw=1"; N=""; [ $nuc = 2 ] && N="--nucleos 5"
  for w in $(seq 1 240); do grep -q "Estado: LIBRE" artifacts/PRUEBAS-EN-CURSO.md && break; sleep 5; done; sleep 2
  node tools/sinescena/med.mjs bien --tema slowride --perfil medir --root artifacts/d1-wasm/interruptores/demo --calidad completo $N $Q --segundos 45 --plazo 150 --sincaptura > $OUT/$nuc-$sw.log 2>&1
  echo "$nuc $sw $(tail -c 400 $OUT/$nuc-$sw.log | grep -o '"out":"[^"]*"')"
done; done
