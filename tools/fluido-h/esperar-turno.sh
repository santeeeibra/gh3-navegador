#!/bin/bash
# Claude 2026-10-23 (fluido H): espera turno LIBRE y ningún med.mjs corriendo, después ejecuta el comando dado.
cd "D:/guitar hero"
for i in $(seq 1 720); do
  if grep -q "Estado: LIBRE" artifacts/PRUEBAS-EN-CURSO.md && ! wmic process where "name='node.exe'" get commandline 2>/dev/null | grep -q "med.mjs"; then
    sleep 3
    if grep -q "Estado: LIBRE" artifacts/PRUEBAS-EN-CURSO.md && ! wmic process where "name='node.exe'" get commandline 2>/dev/null | grep -q "med.mjs"; then exec "$@"; fi
  fi
  sleep 10
done
echo "turno no se liberó"; exit 3
