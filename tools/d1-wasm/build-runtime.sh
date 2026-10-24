#!/usr/bin/env bash
# Paso D2a: compila a wasm32 las fuentes del runtime rexglue 0.9.0 (sin gráficos; audio/controles nulos)
# y anota cuáles fallan. Solo .o. Uso: bash tools/d1-wasm/build-runtime.sh [fuente.cpp ...]
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
PB="$ROOT/artifacts/xex-adapt/paso-b"; SDK="$PB/src/rexglue-sdk-090"; TP="$SDK/thirdparty"
OUT="${OUT:-$ROOT/artifacts/d1-wasm/rt-obj}"; mkdir -p "$OUT"; JOBS="${JOBS:-3}"
FLAGS=(-std=c++23 -O1 -w -pthread -fexperimental-library -fno-char8_t -DREX_PLATFORM_LINUX=1 -DSPDLOG_FMT_EXTERNAL
  -DREXGLUE_BUILD_CONFIG=\"Release\" -DFMT_HEADER_ONLY
  -I"$ROOT/tools/d1-wasm" -I"$ROOT/artifacts/d1-wasm/rtsrc/include" -I"$ROOT/artifacts/d1-wasm/sdkp/include" -I"$PB/build/sdk/include" -I"$PB/gh3-variant/generated/variant-dd2ca1ab" -I"$SDK" -I"$SDK/src" -I"$TP"
  -I"$TP/simde" -I"$TP/fmt/include" -I"$TP/spdlog/include" -I"$TP/tomlplusplus/include" -I"$TP/cli11/include"
  -I"$TP/utfcpp/source" -I"$TP/xxHash" -I"$TP/o1heap/o1heap" -I"$TP/snappy" -I"$PB/build/sdk/thirdparty/snappy"
  -I"$TP/imgui" -I"$ROOT/artifacts/d1-wasm/rtsrc/ffmpeg" -I"$TP/sdl3/include" -I"$TP/stb" -I"$TP/picosha2" -I"$TP/libmspack/libmspack/mspack" -I"$TP/aes_128" -I"$TP/tiny-aes-c" -I"$TP/disruptorplus/include")
# RT_EXTRA_FLAGS: banderas extra al final (p. ej. "-O3 -msimd128 -msse2" para una variante aislada); vacío = igual que siempre.
if [ -n "${RT_EXTRA_FLAGS:-}" ]; then read -r -a _extra <<< "$RT_EXTRA_FLAGS"; FLAGS+=("${_extra[@]}"); fi
S="$SDK/src"
CORE="arena bit_map bit_stream byte_stream clock cvar exception_handler filesystem filesystem_wildcard logging memory mutex ring_buffer sha256 string_buffer threading timer_queue utf8 vec128 atomic_posix clock_posix dbg_posix dynlib_posix exception_handler_posix filesystem_posix mapped_memory_posix math_gcc memory_posix platform/console_posix platform/env_posix seh_posix socket_posix system_posix threading_posix"
LIST=()
for f in graphics_system command_processor register_file registers trace_writer pipeline/shader/shader format/ucode; do LIST+=("$S/graphics/$f.cpp"); done
for f in $CORE; do LIST+=("$S/core/$f.cpp"); done
LIST+=("$S/graphics/xenos.cpp" "$S/graphics/pipeline/texture/info.cpp" "$S/graphics/pipeline/texture/info_formats.cpp" "$S/graphics/pipeline/texture/extent.cpp")  # extent: R5snap (TextureInfo::Prepare)
for f in $(sed -n '/add_library(rexfilesystem/,/)/p' "$S/filesystem/CMakeLists.txt" | grep -o '[a-z_/]*\.cpp'); do LIST+=("$S/filesystem/$f"); done
for f in $(sed -n '/set(REXSYSTEM_SOURCES/,/)/p' "$S/system/CMakeLists.txt" | grep -v '^\s*#' | grep -o '[a-z_0-9/]*\.cpp'); do LIST+=("$S/system/$f"); done
for f in $(sed -n '/set(REXKERNEL_SOURCES/,/)/p' "$S/kernel/CMakeLists.txt" | grep -v '^\s*#' | grep -o '[a-z_0-9/]*\.cpp'); do LIST+=("$S/kernel/$f"); done
# G1c: contexto XMA real y FFmpeg local; el selector conserva silent-consume.
for f in audio_driver audio_system xma_context xma_decoder xma_register_file nop/nop_audio_system silent/silent_audio_system; do LIST+=("$S/audio/$f.cpp"); done
for f in input_system nop/nop_input_driver; do LIST+=("$S/input/$f.cpp"); done
# fiber_emscripten.cpp necesita -sASYNCIFY; queda fuera hasta ver si GH3 usa fibers.
for f in rex_wasm_seg gh3_headless d2_stubs g1_null_gpu r3c_heartbeat r5_snapshot r5_frame; do LIST+=("$ROOT/tools/d1-wasm/$f.cpp"); done
# R5F (r5_frame.cpp): análisis de shaders, ResolveInfo y sus dependencias.
for f in pipeline/shader/translator pipeline/shader/translator_disasm util/draw pipeline/texture/util; do LIST+=("$S/graphics/$f.cpp"); done; LIST+=("$S/ui/graphics_util.cpp")
# Bibliotecas de terceros (imgui solo para los diálogos de XAM; no dibuja nada sin ventana).
for f in imgui imgui_draw imgui_tables imgui_widgets; do LIST+=("$TP/imgui/$f.cpp"); done
# Fuentes con parche WASM (artifacts/d1-wasm/rtsrc/src) reemplazan a las del SDK.
R="$ROOT/artifacts/d1-wasm/rtsrc/src"
for i in "${!LIST[@]}"; do rel="${LIST[$i]#$S/}"; [ -f "$R/$rel" ] && LIST[$i]="$R/$rel"; done
if [ $# -gt 0 ]; then
  LIST=()
  for f in "$@"; do LIST+=("$(cd "$(dirname "$f")" && pwd)/$(basename "$f")"); done
fi
compile() {
  local f="$1" b; b="$(echo "${f##*/src/}" | sed "s#.*/tools/d1-wasm/#d2_#; s#.*/thirdparty/#tp_#" | tr '/' '_' | sed 's/\.cpp$//')"
  if em++ "${FLAGS[@]}" -c "$f" -o "$OUT/$b.o" 2> "$OUT/$b.err"; then st=OK; else st=FAIL; fi
  printf "%s\t%s\t%s\n" "$b" "$st" "$(grep -c 'error:' "$OUT/$b.err")"
}
export -f compile; export OUT; FLAGS_DECL="$(declare -p FLAGS)"; export FLAGS_DECL
RESULTS="$OUT/results.tsv"
if [ $# -gt 0 ]; then RESULTS="$OUT/results-incremental-$(date +%s).tsv"; fi
printf "%s\n" "${LIST[@]}" | xargs -P "$JOBS" -I{} bash -c 'eval "$FLAGS_DECL"; compile "$1"' _ {} | sort | tee "$RESULTS"
# Código C de terceros que necesita la carga del XEX: AES-128 (descifrado) y LZX (descompresión),
# más fmt compilado (lo usa el código generado, que no es header-only).
if [ $# -eq 0 ]; then
  emcc -O2 -w -pthread -c "$TP/aes_128/aes.c" -o "$OUT/tp_aes128.o" && echo "tp_aes128	OK	0"
  emcc -O2 -w -pthread -I"$TP/libmspack/cabextract/mspack" -I"$TP/libmspack/cabextract" -c "$TP/libmspack/cabextract/mspack/lzxd.c" -o "$OUT/tp_lzxd.o" && echo "tp_lzxd	OK	0"
  em++ -std=c++23 -O2 -w -pthread -I"$TP/fmt/include" -c "$TP/fmt/src/format.cc" -o "$OUT/tp_fmt_format.o" && echo "tp_fmt_format	OK	0"
fi
