#!/usr/bin/env bash
# Copia a D: el código generado y los encabezados mínimos para compilarlo con el emsdk de Windows.
set -euo pipefail
D="/mnt/d/guitar hero/artifacts/fase0/repro/src"; mkdir -p "$D"
cd ~/rexglue-sdk
cp -r build-native/tests/ppc/generated "$D/"
tar cf - include build-native/include thirdparty/simde thirdparty/fmt/include thirdparty/fmt/src thirdparty/spdlog/include thirdparty/catch2/src resources/templates 2>/dev/null | tar xf - -C "$D"
du -sh "$D"
