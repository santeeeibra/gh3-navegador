#!/usr/bin/env bash
# Prepara rexglue-sdk c94f5eb en ~/rexglue-sdk y baja SOLO los submódulos requeridos como tarballs
# de GitHub con velocidad limitada (RATE, por defecto 1M) en vez de git (que no permite limitar).
set -euo pipefail
RATE="${RATE:-1M}"
SRC="/mnt/d/guitar hero/toolchain/rexglue-sdk"   # clon superficial ya bajado en Windows
R=~/rexglue-sdk
[ -d "$R" ] || git clone -q --no-hardlinks "$SRC" "$R"
cd "$R"; git checkout -q c94f5ebdcb3c9d1a460ca48e04f9758448f8d518
SUBS="cli11 libmspack FFmpeg tomlplusplus simde xxHash spdlog fmt utfcpp imgui sdl3 vulkan-headers vulkan-memory-allocator spirv-headers spirv-tools glslang catch2 o1heap inja"
for s in $SUBS; do
  d="thirdparty/$s"; [ -e "$d/.git" ] && { echo "ya está $s"; continue; }
  c=$(git ls-tree HEAD "$d" | awk '{print $3}')
  u=$(git config -f .gitmodules "submodule.$d.url"); u=${u%.git}; repo=${u#https://github.com/}
  echo "bajando $s @ ${c:0:8} ($repo)"
  mkdir -p "$d"; curl -fsSL --limit-rate "$RATE" "https://codeload.github.com/$repo/tar.gz/$c" | tar xz -C "$d" --strip-components=1
  echo "gitdir: tarball $c" > "$d/.git"   # CMake solo comprueba que exista
done
du -sh thirdparty
