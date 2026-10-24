#!/usr/bin/env bash
for t in clang clang++ cmake ninja git node python3 gcc g++ curl xz pip3; do printf "%s: " "$t"; command -v "$t" || echo no; done
ls -d /usr/lib/llvm* 2>/dev/null
