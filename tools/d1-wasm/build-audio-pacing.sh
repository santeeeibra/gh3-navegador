#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="$PWD/artifacts/song-sync/pacing/rt-obj" JOBS=1 bash tools/d1-wasm/build-runtime.sh "$PWD/artifacts/song-sync/pacing/src/audio/silent/silent_audio_system.cpp"
test -s artifacts/song-sync/pacing/rt-obj/audio_silent_silent_audio_system.o
OBJDIR=r6/obj-simd LINK_OUT="$PWD/artifacts/song-sync/pacing/web" bash tools/d1-wasm/.audio-pacing-link.sh
