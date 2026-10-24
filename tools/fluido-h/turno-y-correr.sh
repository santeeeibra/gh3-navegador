#!/bin/bash
# Claude 2026-10-23 (fluido H): como esperar-turno.sh, pero si otra sesión gana la carrera por el turno, reintenta.
cd "D:/guitar hero"
for k in $(seq 1 30); do
  out=$(bash tools/fluido-h/esperar-turno.sh "$@" 2>&1 | tail -3)
  if echo "$out" | grep -q "Turno de pruebas ocupado"; then sleep 5; continue; fi
  echo "$out"; exit 0
done
echo "sin turno"; exit 3
