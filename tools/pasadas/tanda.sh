#!/usr/bin/env bash
# Claude 2026-10-17: una tanda del diagnóstico de pasadas. Uso: PAS_K0=n PAS_NO="1,5" bash tools/pasadas/tanda.sh
# (r5_frame usa el mismo pasadas.h: PAS_K0 sólo afecta qué llamada se saltea; el conteo es por ventana)
set -euo pipefail; cd "$(dirname "$0")/../.."
bash tools/pasadas/build.sh > /dev/null
node tools/pasadas/med.mjs bien --root artifacts/d1-wasm/pasadas/demo --perfil medir --sincaptura --segundos 70 --plazo 170 --calidad muy 2>&1 | tail -1
