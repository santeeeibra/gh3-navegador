#!/usr/bin/env bash
# Compila rexglue nativo en WSL (sin red) y genera el código C++ de las pruebas PPC.
set -euo pipefail
TC=~/gh3tc; export PATH="$TC/llvm/bin:$TC/cmake/bin:$TC/bin:$PATH"
LOGS="/mnt/d/guitar hero/artifacts/fase0/repro"; mkdir -p "$LOGS"
cd ~/rexglue-sdk
# Parche local de reproducción: SDL sin X11/Wayland (rexglue los fuerza ON y faltan libs de cursor,
# xkbcommon, etc.). La generación de pruebas PPC no usa la ventana de SDL.
sed -i 's/set(SDL_X11               ON /set(SDL_X11               OFF/; s/set(SDL_WAYLAND           ON /set(SDL_WAYLAND           OFF/' thirdparty/CMakeLists.txt
git diff -- thirdparty/CMakeLists.txt > "$LOGS/patch-05-sdl-sin-x11-wayland.diff"
[ "${CLEAN:-0}" = 1 ] && rm -rf build-native
cmake -G Ninja -B build-native -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ \
  -DCMAKE_BUILD_TYPE=Release -DREXGLUE_BUILD_TESTS=ON -DREXGLUE_ENABLE_TRACY=OFF \
  -DCMAKE_C_FLAGS=-march=x86-64-v2 -DCMAKE_CXX_FLAGS=-march=x86-64-v2 ${CMAKE_EXTRA:-} > "$LOGS/01-cmake.log" 2>&1 \
  || { tail -30 "$LOGS/01-cmake.log"; exit 1; }
echo "cmake OK"
ninja -C build-native -j"${JOBS:-10}" tests/ppc/generated/ppc_test_functions.cpp > "$LOGS/02-codegen.log" 2>&1 \
  || { grep -m5 -B2 -A8 'error' "$LOGS/02-codegen.log" | head -60; exit 1; }
ls -la build-native/tests/ppc/generated | tee "$LOGS/03-generated-files.txt"
sha256sum build-native/tests/ppc/generated/* | tee -a "$LOGS/03-generated-files.txt"
