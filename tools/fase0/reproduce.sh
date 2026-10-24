#!/usr/bin/env bash
# Reproduce desde código la compilación de Fase 0 (pruebas PPC de rexglue en WebAssembly).
# Correr en WSL Ubuntu:  bash "/mnt/d/guitar hero/tools/fase0/reproduce.sh"
# ESTADO: NO EJECUTADO COMPLETO. Requiere descargas que Santi todavía no autorizó:
#   - LLVM 20.1.8 Linux (~1,9 GB, quedó una descarga parcial en ~/gh3tc/llvm.tar.xz)
#   - submódulos de rexglue-sdk (cientos de MB; FFmpeg es el más grande)
# cmake 3.31.6 y ninja 1.12.1 ya quedaron instalados en ~/gh3tc. Emscripten 4.0.0 (97c7c2ad, el
# mismo del informe) ya está en D:\guitar hero\toolchain\emsdk (versión Windows).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; FASE0="$HERE/../../artifacts/fase0"
TC=~/gh3tc; export PATH="$TC/llvm/bin:$TC/cmake/bin:$TC/bin:$PATH"

bash "$HERE/wsl-toolchain.sh"   # cmake, ninja, clang 20 en ~/gh3tc
bash "$HERE/wsl-clone.sh"       # rexglue-sdk c94f5eb + submódulos
R=~/rexglue-sdk; cd "$R"

# 1. Recompilador nativo y generación de las pruebas PPC (usa los binutils PPC incluidos en tools/).
cmake -G Ninja -B build-native -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ \
  -DCMAKE_BUILD_TYPE=Release -DREXGLUE_BUILD_TESTS=ON -DREXGLUE_ENABLE_TRACY=OFF \
  -DCMAKE_C_FLAGS=-march=x86-64-v2 -DCMAKE_CXX_FLAGS=-march=x86-64-v2 2>&1 | tee "$FASE0/repro-01-cmake.log"
ninja -C build-native tests/ppc/generated/ppc_test_functions.cpp 2>&1 | tee "$FASE0/repro-02-codegen.log"
GEN=build-native/tests/ppc/generated; ls -la "$GEN"

# 2. Parches de plataforma del informe (Emscripten tratado como Linux).
git apply --check "$FASE0/patch-all.diff" && git apply "$FASE0/patch-all.diff"

# 3. Compilar el código generado a wasm32/wasm64 con el mini-arnés en lugar de Catch2.
#    HUECO CONOCIDO: el informe enlaza ppc_test_cases_flat.cpp, una versión aplanada de
#    ppc_test_cases.cpp cuyo script de transformación no se entregó. Con el mini-arnés
#    (artifacts/fase0/ppcwasm/catch_test_macros.hpp) se intenta compilar el original directamente.
#    em++ tiene que estar en el PATH de WSL: emsdk Linux (otra descarga) o copiar $GEN, include/ y
#    thirdparty/{simde,fmt,spdlog} a D: y correr este bloque con toolchain/emsdk de Windows.
command -v em++ >/dev/null || { echo "Falta em++ en WSL: ver comentario"; exit 2; }
mkdir -p build-web/catch2; cp "$FASE0/ppcwasm/catch_test_macros.hpp" build-web/catch2/
INC="-Ibuild-web -Iinclude -I$GEN -Ithirdparty/simde -Ithirdparty/fmt/include -Ithirdparty/spdlog/include"
for BITS in 32 64; do
  EXTRA=""; [ "$BITS" = 64 ] && EXTRA="-sMEMORY64=1"
  em++ -std=c++23 -O2 $EXTRA -DREX_PLATFORM_LINUX=1 $INC \
    "$GEN/ppc_test_functions.cpp" "$GEN/ppc_test_cases.cpp" \
    "$FASE0/ppcwasm/main.cpp" "$FASE0/ppcwasm/logstub.cpp" thirdparty/fmt/src/format.cc \
    -o "build-web/ppc$BITS.js" 2>&1 | tee "$FASE0/repro-03-em$BITS.log"
  node "build-web/ppc$BITS.js" | tail -3 | tee -a "$FASE0/repro-04-run.log"
done
