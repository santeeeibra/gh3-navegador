#!/usr/bin/env bash
# Compila las 1458 pruebas PPC generadas por rexglue a WebAssembly, en memoria plana y traducida.
# Requiere: node tools/fase1-mem/make-ppc-tests.mjs (prepara artifacts/fase1-mem/ppc/{flat,tr}).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EMSDK="$ROOT/toolchain/emsdk"; PYDIR="$EMSDK/python/$(ls "$EMSDK/python" | head -1)"
export EMSDK EM_CONFIG="$EMSDK/.emscripten" EMSDK_PYTHON="$PYDIR/python.exe" PATH="$EMSDK/upstream/emscripten:$EMSDK/node/$(ls "$EMSDK/node" | head -1):$PYDIR:$PATH"
SRC="$ROOT/artifacts/fase0/repro/src"; F0="$ROOT/artifacts/fase0/ppcwasm"; P="$ROOT/artifacts/fase1-mem/ppc"
mkdir -p "$P/harness/catch2" "$P/obj"; cp "$F0/catch_test_macros.hpp" "$P/harness/catch2/"
INC=(-I"$P/harness" -I"$ROOT/tools/fase1-mem" -I"$SRC/include" -I"$SRC/build-native/include" -I"$SRC/thirdparty/simde"
     -I"$SRC/thirdparty/fmt/include" -I"$SRC/thirdparty/spdlog/include")
DEF=(-DREX_PLATFORM_LINUX=1 -DSPDLOG_FMT_EXTERNAL -DREXGLUE_BUILD_CONFIG=\"Release\")
CXX=(-std=c++23 -O2 -w)
LINK=(-sSINGLE_FILE=1 -sMODULARIZE=1 -sINVOKE_RUN=0 -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1
      -sINITIAL_MEMORY=64MB -sSTACK_SIZE=4MB -sEXPORTED_FUNCTIONS=_run_all,_main -sEXPORTED_RUNTIME_METHODS=ccall)
for BITS in ${BITS_LIST:-32 64}; do
  M=(); [ "$BITS" = 64 ] && M=(-sMEMORY64=1)
  [ "$BITS" = 64 ] && LIMIT=(-sMAXIMUM_MEMORY=8GB) || LIMIT=(-sMAXIMUM_MEMORY=4GB)
  # Partes comunes (funciones generadas sin memoria plana/traducida distinta se compilan por variante).
  em++ "${CXX[@]}" "${M[@]}" "${DEF[@]}" "${INC[@]}" -c "$F0/logstub.cpp" -o "$P/obj/logstub$BITS.o"
  em++ "${CXX[@]}" "${M[@]}" -I"$SRC/thirdparty/fmt/include" -c "$SRC/thirdparty/fmt/src/format.cc" -o "$P/obj/fmt$BITS.o"
  em++ "${CXX[@]}" "${M[@]}" "${INC[@]}" -c "$F0/main.cpp" -o "$P/obj/main$BITS.o"
  for V in ${VARIANTS:-flat tr}; do
    echo "== wasm$BITS $V"
    em++ "${CXX[@]}" "${M[@]}" "${DEF[@]}" -I"$P/$V" "${INC[@]}" -c "$P/$V/ppc_test_functions.cpp" -o "$P/obj/fn-$V$BITS.o"
    em++ "${CXX[@]}" "${M[@]}" "${DEF[@]}" -I"$P/$V" "${INC[@]}" -c "$P/$V/ppc_test_cases.cpp" -o "$P/obj/cases-$V$BITS.o"
    em++ "${M[@]}" "${LIMIT[@]}" "${LINK[@]}" -sEXPORT_NAME="createPpc_${V}$BITS" \
      "$P/obj/fn-$V$BITS.o" "$P/obj/cases-$V$BITS.o" "$P/obj/main$BITS.o" "$P/obj/logstub$BITS.o" "$P/obj/fmt$BITS.o" \
      -o "$P/ppc-$V$BITS.js"
  done
done
# Control negativo: misma variante traducida con la conversión de bytes y REX_RAW_ADDR rotos.
if [ "${NEGATIVE:-1}" = 1 ]; then
  echo "== wasm32 tr-roto (control negativo)"
  N=(-DREXWASM_SABOTAGE_ENDIAN -DREXWASM_SABOTAGE_RAW)
  em++ "${CXX[@]}" "${DEF[@]}" "${N[@]}" -I"$P/tr" "${INC[@]}" -c "$P/tr/ppc_test_functions.cpp" -o "$P/obj/fn-roto32.o"
  em++ "${CXX[@]}" "${DEF[@]}" "${N[@]}" -I"$P/tr" "${INC[@]}" -c "$P/tr/ppc_test_cases.cpp" -o "$P/obj/cases-roto32.o"
  em++ -sMAXIMUM_MEMORY=4GB "${LINK[@]}" -sEXPORT_NAME=createPpc_roto32 "$P/obj/fn-roto32.o" "$P/obj/cases-roto32.o"     "$P/obj/main32.o" "$P/obj/logstub32.o" "$P/obj/fmt32.o" -o "$P/ppc-roto32.js"
fi
ls -la "$P"/*.js
