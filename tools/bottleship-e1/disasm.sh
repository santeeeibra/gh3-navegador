#!/usr/bin/env bash
# Desensambla un rango de un volcado crudo del guest. Uso (WSL): disasm.sh <volcado.bin> <base_hex> <desde_hex> <hasta_hex>
set -e
T=~/gh3tc/llvm/bin; f=$1; base=$((16#$2)); a=$((16#$3)); b=$((16#$4))
tmp=$(mktemp -d); dd if="$f" of=$tmp/r.bin bs=1 skip=$((a-base)) count=$((b-a)) status=none
cd $tmp; $T/llvm-objcopy -I binary -O elf32-i386 --rename-section .data=.text,code r.bin r.o
$T/llvm-objdump -d --no-show-raw-insn r.o | tail -n +7 | awk -v a=$a '{ if (match($0,/^ *[0-9a-f]+:/)) { o=substr($1,1,length($1)-1); printf "%x:", a+strtonum("0x" o); $1=""; print } }'; rm -rf $tmp
