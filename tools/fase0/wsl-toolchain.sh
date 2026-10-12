#!/usr/bin/env bash
# Instala cmake, ninja y LLVM/Clang 20 en ~/gh3tc (sin sudo, reversible: rm -rf ~/gh3tc)
set -euo pipefail
TC=~/gh3tc; mkdir -p "$TC"; cd "$TC"
if [ ! -x cmake/bin/cmake ]; then
  curl -fsSL --limit-rate "${RATE:-1M}" -o cmake.tgz https://github.com/Kitware/CMake/releases/download/v3.31.6/cmake-3.31.6-linux-x86_64.tar.gz
  mkdir -p cmake && tar xzf cmake.tgz -C cmake --strip-components=1 && rm cmake.tgz
fi
if [ ! -x bin/ninja ]; then
  mkdir -p bin; curl -fsSL --limit-rate "${RATE:-1M}" -o ninja.zip https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-linux.zip
  python3 -c "import zipfile;zipfile.ZipFile('ninja.zip').extractall('bin')"; chmod +x bin/ninja; rm ninja.zip
fi
if [ ! -x llvm/bin/clang ]; then
  curl -fsSL -C - --limit-rate "${RATE:-1M}" -o llvm.tar.xz https://github.com/llvm/llvm-project/releases/download/llvmorg-20.1.8/LLVM-20.1.8-Linux-X64.tar.xz
  mkdir -p llvm && tar xJf llvm.tar.xz -C llvm --strip-components=1 && rm llvm.tar.xz
fi
"$TC/cmake/bin/cmake" --version | head -1; "$TC/bin/ninja" --version; "$TC/llvm/bin/clang" --version | head -1
