#!/usr/bin/env bash
# Fase 2: compila el runtime de hilos de rexglue (threading*.cpp, timer_queue.cpp) parcheado para
# WebAssembly + pthreads, el backend de fibers con Asyncify y la prueba threads_test.cpp.
# Fuentes parcheadas en artifacts/fase2-threads/src (originales en orig/, diff en patches/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
W="$ROOT/artifacts/fase2-threads"; source "$W/env.sh"
SRC="$ROOT/artifacts/fase0/repro/src"; T="$ROOT/tools/fase2-threads"; F0="$ROOT/artifacts/fase0/ppcwasm"
mkdir -p "$W/obj" "$W/build"
INC=(-I"$W/include" -I"$SRC/include" -I"$SRC/build-native/include" -I"$SRC/thirdparty/fmt/include"
     -I"$SRC/thirdparty/spdlog/include" -I"$W/thirdparty/disruptorplus/include")
CXX=(-std=c++23 -O2 -pthread -fexperimental-library -DSPDLOG_FMT_EXTERNAL -w)
LINK=(-pthread -fexperimental-library -sASYNCIFY=1 -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=12
      -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB -sMODULARIZE=1 -sENVIRONMENT=web,worker,node
      -sEXPORTED_RUNTIME_METHODS=UTF8ToString -sSTACK_SIZE=1MB)
for BITS in ${BITS_LIST:-32 64}; do
  M=(); LIM=(-sMAXIMUM_MEMORY=2GB); [ "$BITS" = 64 ] && { M=(-sMEMORY64=1); LIM=(-sMAXIMUM_MEMORY=4GB); }
  O="$W/obj/$BITS"; mkdir -p "$O"
  for f in threading threading_posix timer_queue fiber_emscripten clock_posix; do
    em++ "${CXX[@]}" "${M[@]}" "${INC[@]}" -c "$W/src/$f.cpp" -o "$O/$f.o"
  done
  em++ "${CXX[@]}" "${M[@]}" "${INC[@]}" -c "$F0/logstub.cpp" -o "$O/logstub.o"
  em++ "${CXX[@]}" "${M[@]}" -I"$SRC/thirdparty/fmt/include" -c "$SRC/thirdparty/fmt/src/format.cc" -o "$O/fmt.o"
  for V in ok nosafepoint; do
    D=(); [ "$V" = nosafepoint ] && D=(-DREXWASM_NO_SAFEPOINT)
    [ "$V" = nosafepoint ] && [ "$BITS" = 64 ] && continue
    em++ "${CXX[@]}" "${M[@]}" "${D[@]}" "${INC[@]}" -c "$T/threads_test.cpp" -o "$O/test-$V.o"
    echo "== wasm$BITS $V"
    em++ "${M[@]}" "${LIM[@]}" "${LINK[@]}" -sEXPORT_NAME="createThreads_${V}$BITS" \
      "$O/test-$V.o" "$O"/threading.o "$O"/threading_posix.o "$O"/timer_queue.o "$O"/fiber_emscripten.o "$O"/clock_posix.o \
      "$O/logstub.o" "$O/fmt.o" -o "$W/build/threads-$V$BITS.js"
  done
done
mkdir -p "$W/patches"
( cd "$W" && for f in threading_posix.cpp clock_posix.cpp; do diff -u "orig/$f" "src/$f" || true; done
  diff -u orig/fiber.h include/rex/thread/fiber.h || true ) > "$W/patches/rexglue-wasm-threads.diff"
ls -la "$W/build"
