#!/bin/bash
# Claude 2026-10-23 (fluido H): corridas en fila (cada una espera el turno).
cd "D:/guitar hero"; C="--perfil fluidoh --root artifacts/d1-wasm/fluido/h/demo --calidad completo --sincaptura --ver --aceptar 8 --gapa 4000 --espera 4000 --hlog --fria --lat 40 --bw 3000"
bash tools/fluido-h/turno-y-correr.sh node tools/fluido-h/med.mjs derrota --tema slowride --plazo 300 --despues 20 --q precarga=0 $C
bash tools/fluido-h/turno-y-correr.sh node tools/fluido-h/med.mjs bien --tema slowride --plazo 540 --segundos 400 --despues 10 $C
